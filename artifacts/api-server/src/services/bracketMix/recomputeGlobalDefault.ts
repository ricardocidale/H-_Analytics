/**
 * Phase B bracket-mix global recompute orchestrator
 *
 * U5 of the ICP bracket-mix peer-derived rebuild plan
 * (docs/plans/2026-05-13-001-feat-icp-bracket-mix-peer-derived-phase-b-plan.md).
 *
 * Combines the two derivation paths per recompute event (R11, AE5):
 *   - Phase B: Hugo aggregator over `icp_peer_companies` rows that Tiago
 *     has populated with brand_archetype_split + roster_size_estimate.
 *   - Legacy: `assignBrackets()` (the existing property-level deterministic
 *     classifier in `ai/icp/bracket-assignment-minion.ts`).
 *
 * On each recompute:
 *   1. Both paths produce a `BracketMixData` (one may throw — caught
 *      independently and logged on the diff row's `notes`).
 *   2. A `bracket_mix_runs` row is written (`target_kind='global_default'`)
 *      reflecting the Phase B value — unless Phase B is cold-start
 *      provisional (R4: provisional state is computed at read time, not
 *      stored).
 *   3. A `bracket_mix_dual_run_diffs` row records BOTH values + the
 *      Phase B run id (if any).
 *   4. The feature flag (`isPhaseBBracketMixEnabled()`) decides which
 *      mix is written to `globalAssumptions.bracket_mix` for the engine
 *      to read.
 *   5. Override-protect (R9): when `globalAssumptions.bracket_mix_override_run_id`
 *      is non-null, the `bracket_mix` column is NOT touched — override wins.
 *      The diff log is still written so Mgmt-Co users can see the would-be
 *      value.
 */

import { eq } from "drizzle-orm";

import { db as defaultDb } from "../../db";
import { logger } from "../../logger";
import { storage } from "../../storage";

import {
  bracketMixRuns,
  bracketMixDualRunDiffs,
  icpPeerCompanies,
  icpBrackets,
  globalAssumptions,
  type InsertBracketMixRun,
  type InsertBracketMixDualRunDiff,
  type BracketMixData,
  type GlobalAssumptions,
  type Property,
} from "@workspace/db";

import { aggregate as hugoAggregate, type ActiveBracket, type PeerRow } from "../../ai/ambient/minions/hugo";
import { assignBrackets } from "../../ai/icp/bracket-assignment-minion";
import { isPhaseBBracketMixEnabled } from "./featureFlag";

const TAG = "[service:bracketMix:recomputeGlobalDefault]";

/** evidence label written into the run + diff rows. */
const RUN_EVIDENCE_LABEL = "Phase B global default recompute (Hugo aggregator)";

export interface RecomputeSummary {
  /** Phase B aggregate Hugo produced this cycle. */
  phaseBMix: BracketMixData | null;
  /** Legacy property-level classifier output. */
  legacyMix: BracketMixData | null;
  /** Whether Phase B was a cold-start equal-weight (no run row persisted). */
  phaseBProvisional: boolean;
  /** Inserted bracket_mix_runs id, or null when phaseBProvisional was true. */
  phaseBRunId: number | null;
  /** Inserted bracket_mix_dual_run_diffs id. */
  diffRowId: number;
  /** True when the feature flag was on at recompute time. */
  phaseBFlagEnabled: boolean;
  /** True when at least one override-protected globalAssumptions row was skipped. */
  skippedOverrides: number;
  /** Number of globalAssumptions rows whose bracket_mix was updated. */
  globalAssumptionsUpdated: number;
}

export interface RecomputeDeps {
  db: typeof defaultDb;
  loadPeers: () => Promise<PeerRow[]>;
  loadActiveBrackets: () => Promise<ActiveBracket[]>;
  loadGlobalAssumptionsRows: () => Promise<GlobalAssumptions[]>;
  loadProperties: () => Promise<Property[]>;
  isPhaseBEnabled: () => boolean;
}

function defaultDeps(): RecomputeDeps {
  return {
    db: defaultDb,
    loadPeers: defaultLoadPeers,
    loadActiveBrackets: defaultLoadActiveBrackets,
    loadGlobalAssumptionsRows: defaultLoadGlobalAssumptionsRows,
    loadProperties: () => storage.getAllProperties(),
    isPhaseBEnabled: isPhaseBBracketMixEnabled,
  };
}

async function defaultLoadPeers(): Promise<PeerRow[]> {
  const rows = await defaultDb
    .select({
      id: icpPeerCompanies.id,
      isActive: icpPeerCompanies.isActive,
      rosterSizeEstimate: icpPeerCompanies.rosterSizeEstimate,
      brandArchetypeSplit: icpPeerCompanies.brandArchetypeSplit,
    })
    .from(icpPeerCompanies);
  return rows;
}

async function defaultLoadActiveBrackets(): Promise<ActiveBracket[]> {
  const rows = await defaultDb
    .select({
      slug: icpBrackets.slug,
      name: icpBrackets.name,
      archetypeLabel: icpBrackets.archetypeLabel,
      customerType: icpBrackets.customerType,
    })
    .from(icpBrackets)
    .where(eq(icpBrackets.isActive, true));
  return rows;
}

async function defaultLoadGlobalAssumptionsRows(): Promise<GlobalAssumptions[]> {
  return defaultDb.select().from(globalAssumptions);
}

/**
 * Run one global recompute cycle. Throws only on internal infrastructure
 * failure (DB unavailable). Per-path failures (Hugo or legacy) are caught
 * inline and surfaced through the returned summary.
 */
export async function recomputeGlobalDefault(
  deps: RecomputeDeps = defaultDeps(),
): Promise<RecomputeSummary> {
  const phaseBFlagEnabled = deps.isPhaseBEnabled();
  const notes: string[] = [];

  // Load the active bracket catalog + every globalAssumptions row up front;
  // both feed Phase B and legacy paths, and we'll iterate gaRows for
  // override-protect at write time anyway.
  const activeBrackets = await deps.loadActiveBrackets();
  const gaRows = await deps.loadGlobalAssumptionsRows();

  // ── 1. Compute Phase B (Hugo) — catch independently ──────────────────
  let phaseBMix: BracketMixData | null = null;
  let phaseBProvisional = false;
  try {
    const peers = await deps.loadPeers();
    const hugoResult = hugoAggregate({
      peers,
      activeBrackets,
      evidenceLabel: RUN_EVIDENCE_LABEL,
    });
    phaseBMix = hugoResult.mix;
    phaseBProvisional = hugoResult.provisional;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`${TAG} Hugo failed: ${msg}`);
    notes.push(`Hugo (Phase B) failure: ${msg}`);
  }

  // ── 2. Compute legacy property-level classifier — catch independently ─
  let legacyMix: BracketMixData | null = null;
  try {
    const properties = await deps.loadProperties();
    // Single-tenant Mgmt-Co assumption: the first GA row is the company
    // default the legacy classifier consults. assignBrackets tolerates
    // undefined when no row exists yet.
    legacyMix = assignBrackets(properties, gaRows[0]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`${TAG} legacy assignBrackets failed: ${msg}`);
    notes.push(`Legacy classifier failure: ${msg}`);
  }

  // ── 3. Persist runs + diff row + (conditionally) the engine value ────
  return deps.db.transaction(async (tx) => {
    let phaseBRunId: number | null = null;

    // Persist the Phase B run only when it produced a real (non-provisional)
    // mix. Cold-start provisional results are NOT stored — they are
    // re-derived at read time per R4.
    if (phaseBMix && !phaseBProvisional) {
      const runInsert: InsertBracketMixRun = {
        targetKind: "global_default",
        targetId: null,
        sources: null,
        mixValue: phaseBMix,
        provisional: false,
      };
      const [runRow] = await tx
        .insert(bracketMixRuns)
        .values(runInsert)
        .returning({ id: bracketMixRuns.id });
      if (!runRow) throw new Error("bracket_mix_runs insert returned no rows");
      phaseBRunId = runRow.id;
    } else if (phaseBProvisional) {
      notes.push("Phase B was cold-start provisional — no run row persisted (R4)");
    }

    // Always write the diff row, even when one side failed.
    const diffInsert: InsertBracketMixDualRunDiff = {
      phaseBMix: phaseBMix,
      legacyMix: legacyMix,
      phaseBRunId,
      notes: notes.length > 0 ? notes.join(" | ") : null,
    };
    const [diffRow] = await tx
      .insert(bracketMixDualRunDiffs)
      .values(diffInsert)
      .returning({ id: bracketMixDualRunDiffs.id });
    if (!diffRow) throw new Error("bracket_mix_dual_run_diffs insert returned no rows");

    // ── 4. Write the flag-selected mix to globalAssumptions rows ─────
    // Override-protect: skip any row whose bracket_mix_override_run_id is non-null.
    let updated = 0;
    let skipped = 0;
    const writeMix = phaseBFlagEnabled ? phaseBMix : legacyMix;

    if (writeMix !== null) {
      for (const row of gaRows) {
        if (row.bracketMixOverrideRunId !== null) {
          skipped++;
          continue;
        }
        await tx
          .update(globalAssumptions)
          .set({ bracketMix: writeMix, updatedAt: new Date() })
          .where(eq(globalAssumptions.id, row.id));
        updated++;
      }
    }

    return {
      phaseBMix,
      legacyMix,
      phaseBProvisional,
      phaseBRunId,
      diffRowId: diffRow.id,
      phaseBFlagEnabled,
      skippedOverrides: skipped,
      globalAssumptionsUpdated: updated,
    };
  });
}
