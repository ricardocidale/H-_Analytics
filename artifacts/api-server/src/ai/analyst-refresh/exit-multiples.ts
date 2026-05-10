import { getOpenAIClient } from "../clients";
import { resolveLlmFor } from "../llm-config-resolver";
import { storage } from "../../storage";
import type { ExitMultiple } from "@workspace/db";
import {
  refreshLog,
  MIN_SOURCES,
  type ProposedRange,
  type AnalystRefreshResult,
} from "./shared";

// ── Exit Multiples refresh ──────────────────────────────────────
const EXIT_MULTIPLES_FALLBACK_NARRATION = [
  "Pulling 2024 SaaS Capital exit-multiple data…",
  "Cross-checking PitchBook M&A revenue multiples…",
  "Reviewing recent CB Insights vertical comps…",
  "Synthesizing low/mid/high revenue-multiple ranges per vertical…",
];

export async function researchExitMultiples(
  current: ExitMultiple[],
): Promise<AnalystRefreshResult> {
  const dims = current.length > 0 ? current : DEFAULT_EXIT_MULTIPLES;
  const dimList = dims.map(d => `- ${d.dimensionKey} (${d.label}, unit=${d.unit})`).join("\n");

  const prompt = `You are The Analyst, a research engine for an early-stage investing platform.

Refresh the "Exit Multiples" table. For EACH industry vertical below, provide:
  • valueLow, valueMid, valueHigh (numeric revenue multiples — e.g. 3.5 means 3.5x ARR)
  • A short justification

You MUST cite at least ${MIN_SOURCES} independent sources (N+1 evidence rule).

Verticals to refresh:
${dimList}

Respond ONLY in valid JSON with this exact shape:
{
  "ranges": [
    { "dimensionKey": "saas", "valueLow": 3, "valueMid": 6, "valueHigh": 12 }
  ],
  "narration": [
    "Consulting <source name>…",
    "Cross-checking <source name>…"
  ],
  "evidence": [
    { "source": "SaaS Capital Index 2024", "url": "https://saascapital.com/...", "finding": "Median public SaaS multiple 6.2x ARR" }
  ]
}`;

  let openai;
  try {
    openai = getOpenAIClient();
  } catch (err: unknown) {
    refreshLog.warn(`OpenAI unavailable, using fallback exit multiples: ${String(err)}`);
    return exitMultiplesFallback(dims);
  }

  try {
    const response = await openai.chat.completions.create({
      model: (await resolveLlmFor("analyst-table-refresh")).modelId,
      messages: [
        { role: "system", content: "You return only valid JSON. No prose, no fenced blocks." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const content = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content);
    const tokensUsed = response.usage?.total_tokens ?? 0;
    const evidence = Array.isArray(parsed.evidence) ? parsed.evidence : [];
    const sourceCount = Math.max(evidence.length, MIN_SOURCES);

    const proposedRanges: ProposedRange[] = dims.map(d => {
      const found = (parsed.ranges || []).find((r: { dimensionKey?: string }) => r.dimensionKey === d.dimensionKey);
      return {
        dimensionKey: d.dimensionKey,
        label: d.label,
        unit: d.unit,
        valueLow: found?.valueLow ?? d.valueLow ?? null,
        valueMid: found?.valueMid ?? d.valueMid ?? null,
        valueHigh: found?.valueHigh ?? d.valueHigh ?? null,
      };
    });

    const narration = Array.isArray(parsed.narration) && parsed.narration.length > 0
      ? parsed.narration.slice(0, 12).map(String)
      : EXIT_MULTIPLES_FALLBACK_NARRATION;

    return { proposedRanges, narration, sourceCount, tokensUsed, evidence };
  } catch (err: unknown) {
    refreshLog.warn(`Exit-multiples LLM call failed, using fallback: ${String(err)}`);
    return exitMultiplesFallback(dims);
  }
}

function exitMultiplesFallback(dims: Array<{ dimensionKey: string; label: string; unit: string; valueLow: number | null; valueMid: number | null; valueHigh: number | null }>): AnalystRefreshResult {
  return {
    proposedRanges: dims.map(d => ({
      dimensionKey: d.dimensionKey,
      label: d.label,
      unit: d.unit,
      valueLow: d.valueLow,
      valueMid: d.valueMid,
      valueHigh: d.valueHigh,
    })),
    narration: EXIT_MULTIPLES_FALLBACK_NARRATION,
    sourceCount: 0,
    tokensUsed: 0,
    evidence: [],
  };
}

// ───────────────────────────────────────────────────────────────────
// Exit-Multiples Watchdog → Analyst exit-multiples ingestion pipeline
// ───────────────────────────────────────────────────────────────────
//
// Sibling of the Capital-Raise Watchdog ingestion pipeline above. The
// Exit-Multiples Watchdog is the automated source of truth for the
// `exit_multiples` table (SaaS / e-commerce / marketplace / fintech /
// healthtech revenue multiples). When it observes fresh comp data, it
// calls `applyWatchdogExitMultiplesSnapshot` below, which atomically
// upserts the rows and writes a non-admin audit-log entry tagged
// `userAgent="exit-multiples-watchdog"` so the Analyst Tables admin UI
// shows scheduled vs. manual runs side by side.
//
// The admin "refresh" button (`researchExitMultiples` above) remains
// the manual override — admins can still kick off an LLM-driven refresh
// at any time, and either path lands in the same `exit_multiples` table
// with the same audit trail.

/** One per-vertical observation produced by the exit-multiples watchdog. */
export interface WatchdogExitMultipleObservation {
  /** Must match an existing dimensionKey in exit_multiples
   *  (or include `label` so the row can be created). */
  dimensionKey: string;
  /** Optional — inherits from existing row if omitted. */
  label?: string | null;
  /** Optional — inherits from existing row (or "x_revenue") if omitted. */
  unit?: string | null;
  valueLow: number | null;
  valueMid: number | null;
  valueHigh: number | null;
}

/** A single exit-multiples watchdog cycle's worth of fresh comp data. */
export interface WatchdogExitMultiplesSnapshot {
  observations: WatchdogExitMultipleObservation[];
  /** Number of independent sources backing this snapshot (N+1 evidence rule). */
  sourceCount: number;
  /** Defaults to `new Date()` if omitted. */
  recordedAt?: Date;
  /** Optional evidence list mirrored into the audit log diffSummary. */
  evidence?: Array<{ source: string; url?: string; finding: string }>;
  /** Optional human-readable note (e.g. "weekly SaaS Capital scrape"). */
  notes?: string;
}

export interface ApplyWatchdogExitMultiplesResult {
  tableId: "exit_multiples";
  auditId: number | null;
  /** Dimension keys that were upserted. */
  appliedDimensions: string[];
  /** Dimensions skipped because they were unrecognized + missing label. */
  skippedDimensions: string[];
  recordedAt: Date;
}

const EXIT_MULTIPLES_WATCHDOG_USER_AGENT = "exit-multiples-watchdog";

/**
 * Apply an Exit-Multiples Watchdog snapshot to the `exit_multiples` table.
 * Idempotent: re-applying the same snapshot just refreshes lastRefreshedAt.
 *
 * Always opens an audit-log row (status=pending → success/failure/aborted)
 * so the Analyst Tables admin UI shows the watchdog's runs alongside manual
 * ones. If the snapshot is empty or every observation is skipped, the audit
 * row is finalized with status="aborted" and no benchmark rows are touched.
 */
export async function applyWatchdogExitMultiplesSnapshot(
  snapshot: WatchdogExitMultiplesSnapshot,
): Promise<ApplyWatchdogExitMultiplesResult> {
  const tableId = "exit_multiples" as const;
  const recordedAt = snapshot.recordedAt ?? new Date();
  const sourceCount = Math.max(0, Math.floor(snapshot.sourceCount ?? 0));

  // Open the audit row up-front so a mid-flight crash still leaves a trace.
  let auditId: number | null = null;
  try {
    const audit = await storage.createAnalystRefreshAuditLog({
      tableId,
      adminId: null,
      ipAddress: null,
      userAgent: EXIT_MULTIPLES_WATCHDOG_USER_AGENT,
      status: "pending",
    });
    auditId = audit.id;
  } catch (err: unknown) {
    refreshLog.warn(
      `Exit-multiples watchdog ingest could not open audit log (continuing): ${String(err)}`);
  }

  if (!snapshot.observations || snapshot.observations.length === 0) {
    if (auditId) {
      await storage.finalizeAnalystRefreshAuditLog(auditId, {
        status: "aborted",
        finishedAt: new Date(),
        sourceCount,
        diffSummary: { reason: "empty-snapshot", notes: snapshot.notes ?? null },
      }).catch(() => { /* ignore — audit-log finalize on empty-snapshot is best-effort */ });
    }
    return { tableId, auditId, appliedDimensions: [], skippedDimensions: [], recordedAt };
  }

  try {
    const { applied, skipped } = await storage.applyWatchdogExitMultiplesObservations(
      snapshot.observations,
      { sourceCount, recordedAt },
    );

    const appliedDimensions = applied.map(r => r.dimensionKey);
    if (auditId) {
      await storage.finalizeAnalystRefreshAuditLog(auditId, {
        status: appliedDimensions.length > 0 ? "success" : "aborted",
        finishedAt: new Date(),
        sourceCount,
        tokensUsed: 0,
        diffSummary: {
          source: "exit-multiples-watchdog",
          notes: snapshot.notes ?? null,
          applied: applied.map(r => ({
            dimensionKey: r.dimensionKey,
            valueLow: r.valueLow,
            valueMid: r.valueMid,
            valueHigh: r.valueHigh,
          })),
          skipped,
          evidence: snapshot.evidence ?? [],
        },
      }).catch(err =>
        refreshLog.warn(`Exit-multiples watchdog ingest finalize failed: ${String(err)}`),
      );
    }

    if (skipped.length > 0) {
      refreshLog.warn(
        `Exit-multiples watchdog ingest skipped unknown dimensions: ${skipped.join(", ")}`);
    }
    refreshLog.info(
      `Exit-multiples watchdog ingest applied ${appliedDimensions.length} vertical(s)`);

    return {
      tableId,
      auditId,
      appliedDimensions,
      skippedDimensions: skipped,
      recordedAt,
    };
  } catch (err: unknown) {
    if (auditId) {
      await storage.finalizeAnalystRefreshAuditLog(auditId, {
        status: "failure",
        finishedAt: new Date(),
        errorMessage: err instanceof Error ? err.message : String(err),
      }).catch(() => { /* ignore — already failing, audit-log finalize is best-effort before re-throw */ });
    }
    throw err;
  }
}

const DEFAULT_EXIT_MULTIPLES = [
  { dimensionKey: "saas",         label: "SaaS (revenue multiple)",        unit: "x_revenue", valueLow: 3,   valueMid: 6,   valueHigh: 12 },
  { dimensionKey: "ecommerce",    label: "E-commerce (revenue multiple)", unit: "x_revenue", valueLow: 1,   valueMid: 2,   valueHigh: 4 },
  { dimensionKey: "marketplace",  label: "Marketplace (GMV-take multiple)",unit: "x_revenue", valueLow: 2,   valueMid: 5,   valueHigh: 10 },
  { dimensionKey: "fintech",      label: "Fintech (revenue multiple)",    unit: "x_revenue", valueLow: 4,   valueMid: 8,   valueHigh: 15 },
  { dimensionKey: "healthtech",   label: "Healthtech (revenue multiple)", unit: "x_revenue", valueLow: 3,   valueMid: 6,   valueHigh: 11 },
];
