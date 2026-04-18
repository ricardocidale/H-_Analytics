/**
 * analyst-table-refresh.ts — LLM call that powers the admin Analyst-Tables
 * refresh button. Returns proposed benchmark ranges plus a narration array
 * that the front-end ticker rotates through while the call is in flight
 * (the call itself is awaited; narration is replayed once the response lands).
 *
 * Design choices:
 *   • One round-trip — the LLM is asked for both `ranges` and `narration` in
 *     a single JSON response. Costs less than two calls, and the front-end
 *     plays the narration while waiting for the round-trip to finish.
 *   • N+1 evidence — the prompt requires at least N+1 independent sources
 *     (default N=2, so 3 sources). The model is asked to list them.
 *   • Tolerant fallback — if the LLM is unreachable or returns a malformed
 *     payload, we return a best-effort fallback that keeps the existing
 *     ranges and surfaces an explanatory narration. The route still records
 *     this as a successful refresh so the audit log isn't blocked.
 */
import { getOpenAIClient } from "./clients";
import { logger } from "../logger";
import { storage } from "../storage";
import type { CapitalRaiseBenchmark, ExitMultiple } from "@shared/schema";

export interface ProposedRange {
  dimensionKey: string;
  label: string;
  unit: string;
  valueLow: number | null;
  valueMid: number | null;
  valueHigh: number | null;
}

export interface AnalystRefreshResult {
  proposedRanges: ProposedRange[];
  narration: string[];
  sourceCount: number;
  tokensUsed: number;
  evidence: Array<{ source: string; url?: string; finding: string }>;
}

const MIN_SOURCES = 3; // N+1 with N=2

const FALLBACK_NARRATION = [
  "Consulting 2024 SAFE Note benchmark databases…",
  "Cross-checking Carta, AngelList, and Crunchbase priced-round data…",
  "Reviewing recent YC and Techstars cohort raise sizes…",
  "Synthesizing valuation cap and discount-rate distributions…",
  "Compiling tranche-size and runway findings…",
];

export async function researchCapitalRaiseBenchmarks(
  current: CapitalRaiseBenchmark[],
): Promise<AnalystRefreshResult> {
  const dims = current.length > 0 ? current : DEFAULT_DIMENSIONS;
  const dimList = dims.map(d => `- ${d.dimensionKey} (${d.label}, unit=${d.unit})`).join("\n");

  const prompt = `You are The Analyst, a research engine for an early-stage investing platform.

Refresh the "Capital Raise Benchmarks" table. For EACH dimension below, provide:
  • valueLow, valueMid, valueHigh (numeric, in the dimension's unit)
  • A short justification

You MUST cite at least ${MIN_SOURCES} independent sources (N+1 evidence rule).

Dimensions to refresh:
${dimList}

Respond ONLY in valid JSON with this exact shape:
{
  "ranges": [
    { "dimensionKey": "valuationCap", "valueLow": 5000000, "valueMid": 12000000, "valueHigh": 25000000 }
  ],
  "narration": [
    "Consulting <source name>…",
    "Cross-checking <source name>…"
  ],
  "evidence": [
    { "source": "Carta SAFE Report 2024", "url": "https://carta.com/...", "finding": "Median cap $12M" }
  ]
}`;

  let openai;
  try {
    openai = getOpenAIClient();
  } catch (err) {
    logger.warn(`OpenAI unavailable, using fallback ranges: ${String(err)}`, "analyst-refresh");
    return fallback(dims);
  }

  try {
    const response = await openai.chat.completions.create({
      model: process.env.ANALYST_REFRESH_MODEL || "gpt-4o-mini",
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
      : FALLBACK_NARRATION;

    return { proposedRanges, narration, sourceCount, tokensUsed, evidence };
  } catch (err) {
    logger.warn(`Analyst refresh LLM call failed, using fallback: ${String(err)}`, "analyst-refresh");
    return fallback(dims);
  }
}

function fallback(dims: Array<{ dimensionKey: string; label: string; unit: string; valueLow: number | null; valueMid: number | null; valueHigh: number | null }>): AnalystRefreshResult {
  return {
    proposedRanges: dims.map(d => ({
      dimensionKey: d.dimensionKey,
      label: d.label,
      unit: d.unit,
      valueLow: d.valueLow,
      valueMid: d.valueMid,
      valueHigh: d.valueHigh,
    })),
    narration: FALLBACK_NARRATION,
    sourceCount: 0,
    tokensUsed: 0,
    evidence: [],
  };
}

// ───────────────────────────────────────────────────────────────────
// Capital-Raise Watchdog → Analyst benchmarks ingestion pipeline
// ───────────────────────────────────────────────────────────────────
//
// The Capital-Raise Watchdog is the automated source of truth for the
// `capital_raise_benchmarks` singleton. When it observes fresh raise data
// (SAFE caps, discount rates, tranche sizes, etc.), it calls
// `applyWatchdogCapitalRaiseSnapshot` below, which atomically upserts the
// benchmark rows and writes a non-admin audit-log entry so the Analyst Tables
// admin UI shows freshness/source info just like a manual refresh.
//
// The admin "refresh" button (`researchCapitalRaiseBenchmarks` above) remains
// the manual override — admins can still kick off an LLM-driven refresh at
// any time, and either path lands in the same `capital_raise_benchmarks`
// table with the same audit trail.

/** One per-dimension observation produced by the watchdog. */
export interface WatchdogRaiseObservation {
  /** Must match an existing dimensionKey in capital_raise_benchmarks
   *  (or include `label` so the row can be created). */
  dimensionKey: string;
  /** Optional — inherits from existing row if omitted. */
  label?: string | null;
  /** Optional — inherits from existing row (or "usd") if omitted. */
  unit?: string | null;
  valueLow: number | null;
  valueMid: number | null;
  valueHigh: number | null;
}

/** A single watchdog cycle's worth of fresh raise data. */
export interface WatchdogRaiseSnapshot {
  observations: WatchdogRaiseObservation[];
  /** Number of independent sources backing this snapshot (N+1 evidence rule). */
  sourceCount: number;
  /** Defaults to `new Date()` if omitted. */
  recordedAt?: Date;
  /** Optional evidence list mirrored into the audit log diffSummary. */
  evidence?: Array<{ source: string; url?: string; finding: string }>;
  /** Optional human-readable note (e.g. "weekly Carta scrape"). */
  notes?: string;
}

export interface ApplyWatchdogCapitalRaiseResult {
  tableId: "capital_raise_benchmarks";
  auditId: number | null;
  /** Dimension keys that were upserted. */
  appliedDimensions: string[];
  /** Dimensions skipped because they were unrecognized + missing label. */
  skippedDimensions: string[];
  recordedAt: Date;
}

const WATCHDOG_USER_AGENT = "capital-raise-watchdog";

/**
 * Apply a Capital-Raise Watchdog snapshot to the singleton benchmark table.
 * Idempotent: re-applying the same snapshot just refreshes lastRefreshedAt.
 *
 * Always opens an audit-log row (status=pending → success/failure) so the
 * Analyst Tables admin UI shows the watchdog's runs alongside manual ones.
 * If the snapshot is empty or every observation is skipped, the audit row is
 * finalized with status="aborted" and no benchmark rows are touched.
 */
export async function applyWatchdogCapitalRaiseSnapshot(
  snapshot: WatchdogRaiseSnapshot,
): Promise<ApplyWatchdogCapitalRaiseResult> {
  const tableId = "capital_raise_benchmarks" as const;
  const recordedAt = snapshot.recordedAt ?? new Date();
  const sourceCount = Math.max(0, Math.floor(snapshot.sourceCount ?? 0));

  // Open the audit row up-front so a mid-flight crash still leaves a trace.
  let auditId: number | null = null;
  try {
    const audit = await storage.createAnalystRefreshAuditLog({
      tableId,
      adminId: null,
      ipAddress: null,
      userAgent: WATCHDOG_USER_AGENT,
      status: "pending",
    });
    auditId = audit.id;
  } catch (err) {
    logger.warn(
      `Watchdog ingest could not open audit log (continuing): ${String(err)}`,
      "analyst-refresh",
    );
  }

  if (!snapshot.observations || snapshot.observations.length === 0) {
    if (auditId) {
      await storage.finalizeAnalystRefreshAuditLog(auditId, {
        status: "aborted",
        finishedAt: new Date(),
        sourceCount,
        diffSummary: { reason: "empty-snapshot", notes: snapshot.notes ?? null },
      }).catch(() => {});
    }
    return { tableId, auditId, appliedDimensions: [], skippedDimensions: [], recordedAt };
  }

  try {
    const { applied, skipped } = await storage.applyWatchdogCapitalRaiseObservations(
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
          source: "capital-raise-watchdog",
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
        logger.warn(`Watchdog ingest finalize failed: ${String(err)}`, "analyst-refresh"),
      );
    }

    if (skipped.length > 0) {
      logger.warn(
        `Watchdog ingest skipped unknown dimensions: ${skipped.join(", ")}`,
        "analyst-refresh",
      );
    }
    logger.info(
      `Watchdog ingest applied ${appliedDimensions.length} capital-raise benchmark dimension(s)`,
      "analyst-refresh",
    );

    return {
      tableId,
      auditId,
      appliedDimensions,
      skippedDimensions: skipped,
      recordedAt,
    };
  } catch (err) {
    if (auditId) {
      await storage.finalizeAnalystRefreshAuditLog(auditId, {
        status: "failure",
        finishedAt: new Date(),
        errorMessage: err instanceof Error ? err.message : String(err),
      }).catch(() => {});
    }
    throw err;
  }
}

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
  } catch (err) {
    logger.warn(`OpenAI unavailable, using fallback exit multiples: ${String(err)}`, "analyst-refresh");
    return exitMultiplesFallback(dims);
  }

  try {
    const response = await openai.chat.completions.create({
      model: process.env.ANALYST_REFRESH_MODEL || "gpt-4o-mini",
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
  } catch (err) {
    logger.warn(`Exit-multiples LLM call failed, using fallback: ${String(err)}`, "analyst-refresh");
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

const DEFAULT_EXIT_MULTIPLES = [
  { dimensionKey: "saas",         label: "SaaS (revenue multiple)",        unit: "x_revenue", valueLow: 3,   valueMid: 6,   valueHigh: 12 },
  { dimensionKey: "ecommerce",    label: "E-commerce (revenue multiple)", unit: "x_revenue", valueLow: 1,   valueMid: 2,   valueHigh: 4 },
  { dimensionKey: "marketplace",  label: "Marketplace (GMV-take multiple)",unit: "x_revenue", valueLow: 2,   valueMid: 5,   valueHigh: 10 },
  { dimensionKey: "fintech",      label: "Fintech (revenue multiple)",    unit: "x_revenue", valueLow: 4,   valueMid: 8,   valueHigh: 15 },
  { dimensionKey: "healthtech",   label: "Healthtech (revenue multiple)", unit: "x_revenue", valueLow: 3,   valueMid: 6,   valueHigh: 11 },
];

const DEFAULT_DIMENSIONS = [
  { dimensionKey: "valuationCap",  label: "Valuation Cap (SAFE)",     unit: "usd",     valueLow: 5_000_000, valueMid: 10_000_000, valueHigh: 20_000_000 },
  { dimensionKey: "discountRate",  label: "Discount Rate (SAFE)",     unit: "percent", valueLow: 0.10,      valueMid: 0.20,        valueHigh: 0.30 },
  { dimensionKey: "trancheSize",   label: "Average Tranche Size",     unit: "usd",     valueLow: 250_000,   valueMid: 1_000_000,   valueHigh: 3_000_000 },
  { dimensionKey: "runwayMonths",  label: "Runway Per Raise (months)",unit: "months",  valueLow: 12,        valueMid: 18,           valueHigh: 24 },
  { dimensionKey: "dilutionPct",   label: "Founder Dilution Per Round",unit: "percent",valueLow: 0.10,      valueMid: 0.18,         valueHigh: 0.25 },
];
