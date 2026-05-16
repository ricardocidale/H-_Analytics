/**
 * admin-llm-cost.ts — GET /api/admin/llm-cost-summary
 *
 * Tail-reads logs/api-costs.jsonl, filters by the requested window, aggregates
 * by model+operation, and attributes each entry to a slot via the
 * modelSlug→slotSlug inverse map built from admin_resources rows.
 */

import type { Express, Request, Response } from "express";
import fs from "node:fs";
import readline from "node:readline";
import path from "node:path";
import { requireAdmin } from "../auth";
import { storage } from "../storage";
import type { CostEntry } from "../middleware/cost-logger";

const LOG_FILE = path.resolve(process.cwd(), "logs", "api-costs.jsonl");
const MAX_LINES = 10_000;
const P95_PERCENTILE = 0.95;
const COST_ROUND_FACTOR = 10_000;
const AVG_COST_ROUND_FACTOR = 100_000;
const DEFAULT_WINDOW_DAYS = 30;
const HTTP_BAD_REQUEST = 400;
const HTTP_INTERNAL_ERROR = 500;

interface SlotCostSummary {
  slotSlug: string;
  modelSlug: string;
  vendor: string;
  calls: number;
  totalCostUsd: number;
  avgCostPerCall: number;
  p95DurationMs: number | null;
}

interface LlmCostSummaryResponse {
  windowDays: number;
  windowStart: string;
  totalCostUsd: number;
  perSlot: SlotCostSummary[];
}

interface SlotAccum {
  slotSlug: string;
  modelSlug: string;
  vendor: string;
  calls: number;
  totalCostUsd: number;
  durations: number[];
}

async function buildModelToSlotMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const rows = await storage.listAdminResources("llm_slot");
    for (const row of rows) {
      const modelSlug = row.config?.modelSlug as string | undefined;
      if (modelSlug && row.slug) {
        map.set(modelSlug, row.slug as string);
      }
    }
  } catch {
    // non-blocking — return empty map on failure
  }
  return map;
}

async function buildModelSlugByModelId(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const rows = await storage.listAdminResources("model");
    for (const row of rows) {
      const modelId = row.config?.modelId as string | undefined;
      if (modelId && row.slug) {
        map.set(modelId, row.slug as string);
      }
    }
  } catch {
    // non-blocking
  }
  return map;
}

async function aggregateCostEntries(
  windowStart: Date,
  modelToSlot: Map<string, string>,
  modelIdToSlug: Map<string, string>,
): Promise<{ accum: Map<string, SlotAccum>; totalCostUsd: number }> {
  const accum = new Map<string, SlotAccum>();
  let totalCostUsd = 0;

  if (!fs.existsSync(LOG_FILE)) {
    return { accum, totalCostUsd };
  }

  const stream = fs.createReadStream(LOG_FILE, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let linesRead = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    if (linesRead++ >= MAX_LINES) break;

    let entry: CostEntry;
    try {
      entry = JSON.parse(line) as CostEntry;
    } catch {
      continue;
    }

    if (!entry.timestamp || new Date(entry.timestamp) < windowStart) continue;

    // Resolve model slug: try entry.model as a modelId first, then as a slug directly
    const modelSlug = (entry.model ? (modelIdToSlug.get(entry.model) ?? entry.model) : null) ?? "unknown";

    // Slot attribution: operation field carries the slot slug when set by dispatch (U3)
    // Fall back to modelSlug→slotSlug inverse map
    const slotSlug =
      (entry.operation && entry.operation !== "dispatch" ? entry.operation : null) ??
      modelToSlot.get(modelSlug) ??
      "unattributed";

    const key = `${slotSlug}::${modelSlug}`;
    let bucket = accum.get(key);
    if (!bucket) {
      bucket = {
        slotSlug,
        modelSlug,
        vendor: entry.service ?? "unknown",
        calls: 0,
        totalCostUsd: 0,
        durations: [],
      };
      accum.set(key, bucket);
    }

    bucket.calls += 1;
    if (typeof entry.estimatedCostUsd === "number") {
      bucket.totalCostUsd += entry.estimatedCostUsd;
      totalCostUsd += entry.estimatedCostUsd;
    }
    if (typeof entry.durationMs === "number") {
      bucket.durations.push(entry.durationMs);
    }
  }

  rl.close();
  stream.destroy();

  return { accum, totalCostUsd };
}

function p95(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * P95_PERCENTILE) - 1;
  return sorted[Math.max(0, idx)];
}

export async function computeLlmCostSummary(windowDays: number): Promise<LlmCostSummaryResponse> {
  const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const [modelToSlot, modelIdToSlug] = await Promise.all([
    buildModelToSlotMap(),
    buildModelSlugByModelId(),
  ]);

  const { accum, totalCostUsd } = await aggregateCostEntries(
    windowStart,
    modelToSlot,
    modelIdToSlug,
  );

  const perSlot: SlotCostSummary[] = Array.from(accum.values())
    .sort((a, b) => b.totalCostUsd - a.totalCostUsd)
    .map((b) => ({
      slotSlug: b.slotSlug,
      modelSlug: b.modelSlug,
      vendor: b.vendor,
      calls: b.calls,
      totalCostUsd: Math.round(b.totalCostUsd * COST_ROUND_FACTOR) / COST_ROUND_FACTOR,
      avgCostPerCall:
        b.calls > 0 ? Math.round((b.totalCostUsd / b.calls) * AVG_COST_ROUND_FACTOR) / AVG_COST_ROUND_FACTOR : 0,
      p95DurationMs: p95(b.durations),
    }));

  return {
    windowDays,
    windowStart: windowStart.toISOString(),
    totalCostUsd: Math.round(totalCostUsd * COST_ROUND_FACTOR) / COST_ROUND_FACTOR,
    perSlot,
  };
}

export function register(app: Express) {
  app.get("/api/admin/llm-cost-summary", requireAdmin, async (req: Request, res: Response) => {
    try {
      const rawDays = Number(req.query.windowDays ?? DEFAULT_WINDOW_DAYS);
      if (!Number.isFinite(rawDays) || rawDays <= 0) {
        res.status(HTTP_BAD_REQUEST).json({ error: "windowDays must be a positive number" });
        return;
      }
      res.json(await computeLlmCostSummary(Math.floor(rawDays)));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(HTTP_INTERNAL_ERROR).json({ error: message });
    }
  });
}
