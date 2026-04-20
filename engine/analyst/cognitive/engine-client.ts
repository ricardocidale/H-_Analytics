/**
 * engine-client.ts — Phase 5B read-path for the verdict cache (ADR-004).
 *
 * Given a VerdictCacheKey + injected storage reader, this module decides
 * whether to serve the existing research_run or require the caller to
 * re-orchestrate. All I/O is injected via `EngineClientDeps`; the module
 * itself is pure logic + typed contracts.
 *
 * ## What v1 ships (Phase 5B)
 *
 * - Typed `ConsultRequest` / `ConsultResult` / `MissReason` contracts.
 * - `tryCacheRead()` — looks up research_runs by cache_key, applies the
 *   two-axis TTL + inputs-hash + not-superseded + complete gates from
 *   ADR-004 §3-4, and returns either a hit (with the raw guidance rows)
 *   or a miss (with the reason enum).
 *
 * ## What v1 does NOT ship (deferred to Phase 5B v2)
 *
 * - Full `AnalystVerdict` reconstruction from guidance rows. Needs a
 *   decision on whether to persist the rendered `VoiceBlock` (Phase 5C
 *   write-after) or re-run the voice renderer at read-time against
 *   reconstructed dimensions. The caller currently receives the raw
 *   `GuidanceSlim[]` on hit and re-runs just the voice stage; that's
 *   still ~300× cheaper than re-orchestrating.
 *
 * See docs/architecture/decisions/ADR-004-verdict-cache.md for the full
 * design. See engine/analyst/cognitive/cache-keys.ts for how the cache
 * key is constructed.
 */
import { computeCacheKey, type VerdictCacheKey } from "./cache-keys";

// ──────────────────────────────────────────────────────────────────────────
// Miss reasons

/**
 * Why a cache lookup did not return a reusable verdict. Emitted as
 * telemetry tag by the consumer; dashboards aggregate by reason to
 * identify churn drivers (e.g., `engine_version_drift` dominating means
 * the cache is effectively cold — check that the engine is stable; or
 * `inputs_changed` dominating means callers are mutating inputs rapidly
 * and the cache TTL is over-optimistic).
 */
export type MissReason =
  | "fresh_miss" // no research_runs row with this cache_key
  | "not_complete" // row exists but status !== "complete"
  | "ttl_expired" // older than configured TTL
  | "inputs_changed" // cache_inputs_hash mismatch (defensive; key hash already encodes inputs)
  | "superseded" // all guidance rows for the run are flagged superseded_at
  | "no_guidance" // run exists and fresh, but zero matching guidance rows (data loss)
  | "explicit_bypass"; // caller forced a re-run (power-user escape hatch)

// ──────────────────────────────────────────────────────────────────────────
// Row shapes (minimal subset of the full drizzle rows)
//
// Defined here so this module doesn't import from `shared/schema`. The
// caller adapts their full rows into these shapes. Keeps engine/ pure.

export interface ResearchRunSlim {
  id: number;
  cacheKey: string | null;
  cacheInputsHash: string | null;
  status: string;
  completedAt: Date | null;
  modelPrimary: string | null;
  tier: number;
}

export interface GuidanceSlim {
  assumptionKey: string;
  valueLow: number | null;
  valueMid: number | null;
  valueHigh: number | null;
  confidence: string | null;
  sourceName: string | null;
  sourceDate: string | null;
  reasoning: string | null;
  supersededAt: Date | null;
}

// ──────────────────────────────────────────────────────────────────────────
// Contracts

export interface ConsultRequest {
  /** Structured cache key — will be hashed via `computeCacheKey()`. */
  cacheKey: VerdictCacheKey;
  /**
   * Set to true to force a cache miss even if a valid entry exists. The
   * "Ask the Analyst" explicit-refresh button at the UI layer maps to this.
   * See ADR-004 §4 invalidation-trigger #5.
   */
  explicitBypass?: boolean;
}

export interface EngineClientDeps {
  /**
   * Look up the most recent `research_runs` row matching the hashed cache
   * key. Caller is responsible for the SQL — this module only orchestrates
   * the decision tree. Returns null if no row exists.
   */
  findRunByCacheKey: (hashedKey: string) => Promise<ResearchRunSlim | null>;

  /**
   * Fetch all `assumption_guidance` rows for a completed run. Include
   * superseded rows — this module decides whether they disqualify the hit.
   */
  findGuidanceByRunId: (runId: number) => Promise<GuidanceSlim[]>;

  /**
   * Current time. Injectable for tests. Defaults to `new Date()`.
   */
  now?: () => Date;

  /**
   * Time-axis TTL. Default 30 days (ADR-004 §3 — mirrors the staleness
   * detector's TTL knob). Set to 0 to disable time-axis invalidation.
   */
  ttlMs?: number;
}

export type ConsultResult =
  | {
      hit: true;
      runId: number;
      completedAt: Date;
      modelPrimary: string | null;
      tier: number;
      /**
       * Raw guidance rows (non-superseded) that matched the run. The caller
       * reconstructs the final `AnalystVerdict` — Phase 5B v1 leaves that
       * step to the consumer since it depends on voice-rendering decisions
       * that are not yet cached. See module docstring "What v1 does NOT ship".
       */
      guidance: GuidanceSlim[];
    }
  | {
      hit: false;
      missReason: MissReason;
    };

// ──────────────────────────────────────────────────────────────────────────
// Read path

const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Attempt a cache read. Returns `{ hit: true, ... }` with guidance rows
 * if the cache has a fresh, non-superseded entry matching the key + inputs;
 * otherwise `{ hit: false, missReason }`.
 *
 * This function NEVER invokes the orchestrator on miss. That's the
 * caller's responsibility — they have the orchestrator credentials,
 * prompts, and streaming context. This module is pure decision-making.
 */
export async function tryCacheRead(
  req: ConsultRequest,
  deps: EngineClientDeps,
): Promise<ConsultResult> {
  // Escape hatch: explicit bypass
  if (req.explicitBypass) {
    return { hit: false, missReason: "explicit_bypass" };
  }

  const hashedKey = computeCacheKey(req.cacheKey);
  const run = await deps.findRunByCacheKey(hashedKey);

  // Gate 1: row existence
  if (!run) {
    return { hit: false, missReason: "fresh_miss" };
  }

  // Gate 2: completion status
  if (run.status !== "complete") {
    return { hit: false, missReason: "not_complete" };
  }

  // Gate 3: time-axis TTL
  const now = deps.now ? deps.now() : new Date();
  const ttlMs = deps.ttlMs ?? DEFAULT_TTL_MS;
  if (run.completedAt === null) {
    // Completed runs should have a timestamp. Treat as TTL-expired.
    return { hit: false, missReason: "ttl_expired" };
  }
  if (ttlMs > 0) {
    const ageMs = now.getTime() - run.completedAt.getTime();
    if (ageMs > ttlMs) {
      return { hit: false, missReason: "ttl_expired" };
    }
  }

  // Gate 4: content-axis (inputs) hash match
  // In theory the cache_key hash already encodes the inputs_hash, so a
  // mismatch here is impossible. Kept as a defensive check in case the
  // persisted cache_key and cache_inputs_hash ever drift (e.g., a bad
  // migration).
  if (
    run.cacheInputsHash !== null &&
    run.cacheInputsHash !== req.cacheKey.inputContextHash
  ) {
    return { hit: false, missReason: "inputs_changed" };
  }

  // Gate 5: fetch guidance + check supersede status
  const allGuidance = await deps.findGuidanceByRunId(run.id);
  const live = allGuidance.filter((g) => g.supersededAt === null);

  if (allGuidance.length > 0 && live.length === 0) {
    // Rows exist but every one is superseded — treat as miss so the caller
    // re-orchestrates rather than serving stale-flagged content.
    return { hit: false, missReason: "superseded" };
  }

  if (live.length === 0) {
    // No guidance at all — data gap. Don't serve a "hit" with empty payload.
    return { hit: false, missReason: "no_guidance" };
  }

  return {
    hit: true,
    runId: run.id,
    completedAt: run.completedAt,
    modelPrimary: run.modelPrimary,
    tier: run.tier,
    guidance: live,
  };
}
