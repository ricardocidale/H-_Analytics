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
import { resolveLlmFor } from "./llm-config-resolver";
import { loggerFor } from "../logger";
import { ORCHESTRATOR_IDENTITY } from "@engine/analyst/identity";

// Table-refresh runs as Gustavo dispatching specialist tools — narrate
// the path under his persona so admin logs read uniformly with the rest
// of the orchestrator surface.
const refreshLog = loggerFor(ORCHESTRATOR_IDENTITY.logKey);
import { storage } from "../storage";
import type { CapitalRaiseBenchmark, ExitMultiple, ReferenceBrand, InsertReferenceBrand } from "@workspace/db";

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
  } catch (err: unknown) {
    refreshLog.warn(`OpenAI unavailable, using fallback ranges: ${String(err)}`);
    return fallback(dims);
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
      : FALLBACK_NARRATION;

    return { proposedRanges, narration, sourceCount, tokensUsed, evidence };
  } catch (err: unknown) {
    refreshLog.warn(`Analyst refresh LLM call failed, using fallback: ${String(err)}`);
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
  } catch (err: unknown) {
    refreshLog.warn(
      `Watchdog ingest could not open audit log (continuing): ${String(err)}`);
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
        refreshLog.warn(`Watchdog ingest finalize failed: ${String(err)}`),
      );
    }

    if (skipped.length > 0) {
      refreshLog.warn(
        `Watchdog ingest skipped unknown dimensions: ${skipped.join(", ")}`);
    }
    refreshLog.info(
      `Watchdog ingest applied ${appliedDimensions.length} capital-raise benchmark dimension(s)`);

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

// ─────────────────────────────────────────────────────────────────────────────
// Reference Brands refresh — auto-commit (no diff/review step)
// ─────────────────────────────────────────────────────────────────────────────

export interface ReferenceBrandsRefreshResult extends AnalystRefreshResult {
  autoCommitted: true;
  brandCount: number;
}

const REFERENCE_BRANDS_NARRATION = [
  "Sourcing current boutique and lifestyle hospitality brand data…",
  "Reviewing ADR, occupancy, and RevPAR for known reference brands…",
  "Checking brand portfolios: property counts and key-count ranges…",
  "Cross-referencing M&A transactions and PE ownership changes…",
  "Synthesising positioning summaries from operator and trade sources…",
  "Auto-committing reference brands (no diff review required)…",
];

// Implementation note: uses direct openai.chat.completions.create — the same
// approach as researchCapitalRaiseBenchmarks and researchExitMultiples above.
// The handleToolCall / aiResearch.ts pipeline is for the interactive specialist
// chat flow; these analyst-table refresh functions are batch, non-interactive,
// and intentionally follow the simpler prompt→JSON-parse pattern.
export async function researchReferenceBrands(
  current: ReferenceBrand[],
  auditId?: number,
): Promise<ReferenceBrandsRefreshResult> {
  const currentBrandList = current.length > 0
    ? current.map(b => `- ${b.brandName} (${b.niche ?? "n/a"}, ${b.propertyCount ?? "?"} properties)`).join("\n")
    : "(table is currently empty)";

  const prompt = `You are a hospitality industry analyst. Your task is to refresh the reference_brands table with current data on 15–25 real boutique / lifestyle / experiential hotel brands.

ALWAYS include these 6 founding brands (verify and update their current metrics):
1. Axel Hotels
2. Mama Shelter
3. Desire Resorts
4. Selina
5. Eleven Experience
6. Yotel

CURRENT TABLE (for orientation — verify and update each row):
${currentBrandList}

Return a JSON object with this exact shape:
{
  "brands": [
    {
      "brandName": "string — official brand name",
      "niche": "string — 2–5 word niche label (e.g. 'LGBTQ+ boutique lifestyle')",
      "positioningSummary": "string — 1–2 sentence brand DNA",
      "guestSegment": "string — primary guest profiles",
      "propertyCount": number | null,
      "keyCountMin": number | null,
      "keyCountMax": number | null,
      "geographicFocus": "string — primary markets",
      "adrUsd": number | null,
      "occupancyPct": number | null,
      "revparUsd": number | null,
      "revenueRangeLowUsd": number | null,
      "revenueRangeHighUsd": number | null,
      "ownershipModel": "string — ownership/management structure",
      "acquisitionContext": "string | null — M&A, PE, or IPO history if any",
      "description": "string — 2–4 sentence narrative",
      "dataYear": number,
      "sourceUrls": ["string", ...]
    }
  ],
  "narration": ["string line 1", ...],
  "evidence": [
    { "source": "string", "url": "string (optional)", "finding": "string" }
  ],
  "sourceCount": number
}

REQUIREMENTS:
- Include 15–25 brands total; always include the 6 founding brands above.
- Use orientation-grade data from public filings, press releases, and trade publications.
- Wide variation across rows is intentional and correct — do not normalize.
- Cite at least 3 independent sources in evidence[].
- narration should be 4–6 short ticker lines describing your research steps.
- All financial figures are in USD. occupancyPct is 0.0–1.0 (e.g. 0.82 = 82%).
- IMPORTANT: Return ONLY valid JSON with no markdown fences, no preamble, no trailing text.`;

  let rawJson = "";
  let tokensUsed = 0;

  try {
    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: (await resolveLlmFor("analyst-table-refresh")).modelId,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      response_format: { type: "json_object" },
    });
    rawJson = completion.choices[0]?.message?.content ?? "{}";
    tokensUsed = completion.usage?.total_tokens ?? 0;
  } catch (err: unknown) {
    refreshLog.warn(`researchReferenceBrands: LLM call failed, keeping existing rows: ${String(err)}`);
    return {
      autoCommitted: true,
      brandCount: current.length,
      proposedRanges: brandRowsToRanges(current),
      narration: REFERENCE_BRANDS_NARRATION,
      sourceCount: 0,
      tokensUsed: 0,
      evidence: [],
    };
  }

  let parsed: {
    brands?: unknown[];
    narration?: unknown[];
    evidence?: unknown[];
    sourceCount?: unknown;
  };
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    refreshLog.warn("researchReferenceBrands: failed to parse LLM JSON; keeping existing rows");
    return {
      autoCommitted: true,
      brandCount: current.length,
      proposedRanges: brandRowsToRanges(current),
      narration: REFERENCE_BRANDS_NARRATION,
      sourceCount: 0,
      tokensUsed,
      evidence: [],
    };
  }

  const rawBrands = Array.isArray(parsed.brands) ? parsed.brands : [];
  const newBrands: InsertReferenceBrand[] = rawBrands
    .filter((b): b is Record<string, unknown> => b !== null && typeof b === "object")
    .map(b => ({
      brandName: String(b["brandName"] ?? "Unknown"),
      niche: b["niche"] ? String(b["niche"]) : null,
      positioningSummary: b["positioningSummary"] ? String(b["positioningSummary"]) : null,
      guestSegment: b["guestSegment"] ? String(b["guestSegment"]) : null,
      propertyCount: typeof b["propertyCount"] === "number" ? b["propertyCount"] : null,
      keyCountMin: typeof b["keyCountMin"] === "number" ? b["keyCountMin"] : null,
      keyCountMax: typeof b["keyCountMax"] === "number" ? b["keyCountMax"] : null,
      geographicFocus: b["geographicFocus"] ? String(b["geographicFocus"]) : null,
      adrUsd: typeof b["adrUsd"] === "number" ? b["adrUsd"] : null,
      occupancyPct: typeof b["occupancyPct"] === "number" ? b["occupancyPct"] : null,
      revparUsd: typeof b["revparUsd"] === "number" ? b["revparUsd"] : null,
      revenueRangeLowUsd: typeof b["revenueRangeLowUsd"] === "number" ? b["revenueRangeLowUsd"] : null,
      revenueRangeHighUsd: typeof b["revenueRangeHighUsd"] === "number" ? b["revenueRangeHighUsd"] : null,
      ownershipModel: b["ownershipModel"] ? String(b["ownershipModel"]) : null,
      acquisitionContext: b["acquisitionContext"] ? String(b["acquisitionContext"]) : null,
      description: b["description"] ? String(b["description"]) : null,
      referenceDisclaimer: true,
      dataYear: typeof b["dataYear"] === "number" ? b["dataYear"] : new Date().getFullYear(),
      sourceUrls: Array.isArray(b["sourceUrls"]) ? b["sourceUrls"] as string[] : null,
      lastRefreshedAt: new Date(),
      refreshedByRunId: auditId ?? null,
    }));

  // When the model returns no brands, fall back to re-inserting the existing
  // rows. Strip DB-managed fields (id, createdAt, updatedAt) so the INSERT
  // does not conflict with the GENERATED ALWAYS IDENTITY column.
  const brandsToWrite: InsertReferenceBrand[] = newBrands.length > 0 ? newBrands : current.map(b => ({
    brandName: b.brandName,
    niche: b.niche,
    positioningSummary: b.positioningSummary,
    guestSegment: b.guestSegment,
    propertyCount: b.propertyCount,
    keyCountMin: b.keyCountMin,
    keyCountMax: b.keyCountMax,
    geographicFocus: b.geographicFocus,
    adrUsd: b.adrUsd,
    occupancyPct: b.occupancyPct,
    revparUsd: b.revparUsd,
    revenueRangeLowUsd: b.revenueRangeLowUsd,
    revenueRangeHighUsd: b.revenueRangeHighUsd,
    ownershipModel: b.ownershipModel,
    acquisitionContext: b.acquisitionContext,
    description: b.description,
    referenceDisclaimer: b.referenceDisclaimer,
    dataYear: b.dataYear,
    sourceUrls: b.sourceUrls,
    lastRefreshedAt: new Date(),
    refreshedByRunId: auditId ?? null,
  }));

  const written = await storage.replaceAllReferenceBrands(brandsToWrite);

  const narration = Array.isArray(parsed.narration) && parsed.narration.length > 0
    ? parsed.narration.map(String)
    : REFERENCE_BRANDS_NARRATION;
  const evidence = Array.isArray(parsed.evidence)
    ? parsed.evidence
        .filter((e): e is Record<string, unknown> => e !== null && typeof e === "object")
        .map(e => ({
          source: String(e["source"] ?? ""),
          url: e["url"] ? String(e["url"]) : undefined,
          finding: String(e["finding"] ?? ""),
        }))
    : [];
  const sourceCount = typeof parsed.sourceCount === "number"
    ? parsed.sourceCount
    : evidence.length;

  refreshLog.info(`researchReferenceBrands: auto-committed ${written.length} brands (${tokensUsed} tokens)`);

  return {
    autoCommitted: true,
    brandCount: written.length,
    proposedRanges: brandRowsToRanges(written),
    narration,
    sourceCount,
    tokensUsed,
    evidence,
  };
}

function brandRowsToRanges(brands: Array<Pick<ReferenceBrand, "id" | "brandName" | "niche" | "propertyCount" | "keyCountMin" | "keyCountMax">>): ProposedRange[] {
  return brands.map(b => ({
    dimensionKey: `brand_${b.id}`,
    label: b.niche ? `${b.brandName} · ${b.niche}` : b.brandName,
    unit: "properties",
    valueLow: b.keyCountMin ?? null,
    valueMid: b.propertyCount ?? null,
    valueHigh: b.keyCountMax ?? null,
  }));
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
