/**
 * Phase B effective-mix read path + override-aware writer
 *
 * U6 of the ICP bracket-mix peer-derived rebuild plan
 * (docs/plans/2026-05-13-001-feat-icp-bracket-mix-peer-derived-phase-b-plan.md).
 *
 * Three exports:
 *
 *   - `effectiveBracketMix(companyId)` (R7, R9): the canonical read function.
 *     Returns `{ mix, source, provisional }`. When the row has an active
 *     override (`bracket_mix_override_run_id IS NOT NULL`), the override's
 *     run is the source. Otherwise the latest `target_kind='global_default'`
 *     run is the source. When no run rows exist, returns equal-weight +
 *     `provisional: true`.
 *
 *   - `writeEffectiveBracketMix(companyId, mix, opts)`: shared writer used
 *     by ALL writers of `globalAssumptions.bracket_mix`. Respects the
 *     `override-protect` rule unless `opts.kind === 'override-set'` (in
 *     which case it ESTABLISHES the override). Per Phase C design
 *     decision Option A, an admin direct-write to a row with an active
 *     override UPGRADES to override status (creates a new
 *     `bracket_mix_runs` row, links via `bracket_mix_override_run_id`)
 *     rather than failing or silently clobbering.
 *
 *   - `clearBracketMixOverride(companyId)`: clears the FK and re-mirrors
 *     the latest `target_kind='global_default'` mix into
 *     `globalAssumptions.bracket_mix` so the engine read stays consistent
 *     (R8).
 */

import { eq, and, desc, isNull } from "drizzle-orm";

import { db as defaultDb } from "../../db";
import { logger } from "../../logger";
import {
  bracketMixRuns,
  globalAssumptions,
  icpBrackets,
  type BracketMixData,
  type BracketEntry,
  type InsertBracketMixRun,
} from "@workspace/db";

const TAG = "[service:bracketMix:effective]";

/** Sentinel kinds used when the shared writer is called. */
export type WriteKind =
  | "override-set"     // Tiago company override run id → globalAssumptions.
  | "override-promote" // direct admin write to a row that already has an override.
  | "manual-assign";   // direct admin write to a row WITHOUT an override.

export type EffectiveSource =
  | "override"
  | "global"
  | "provisional";

export interface EffectiveBracketMix {
  mix: BracketMixData;
  source: EffectiveSource;
  /** True for the cold-start equal-weight fallback (R4). */
  provisional: boolean;
  /** Underlying bracket_mix_runs.id when a real run was found; null when provisional. */
  runId: number | null;
}

// ── effectiveBracketMix ─────────────────────────────────────────────────────

/**
 * Resolve the effective bracket mix for a Mgmt-Co (global_assumptions.id).
 *
 * Order:
 *   1. If `bracket_mix_override_run_id` is non-null, read that run's
 *      mix_value and return `source='override'`.
 *   2. Else read the most recent `target_kind='global_default'` run; if
 *      one exists, return `source='global'`.
 *   3. Else compute equal-weight across active brackets and return
 *      `source='provisional'`, `provisional=true`.
 */
export async function effectiveBracketMix(
  companyId: number,
  database: typeof defaultDb = defaultDb,
): Promise<EffectiveBracketMix> {
  const [ga] = await database
    .select({
      id: globalAssumptions.id,
      bracketMixOverrideRunId: globalAssumptions.bracketMixOverrideRunId,
    })
    .from(globalAssumptions)
    .where(eq(globalAssumptions.id, companyId));

  if (ga?.bracketMixOverrideRunId !== null && ga?.bracketMixOverrideRunId !== undefined) {
    const [run] = await database
      .select({ id: bracketMixRuns.id, mixValue: bracketMixRuns.mixValue })
      .from(bracketMixRuns)
      .where(eq(bracketMixRuns.id, ga.bracketMixOverrideRunId));
    if (run) {
      return { mix: run.mixValue, source: "override", provisional: false, runId: run.id };
    }
    // Sentinel FK exists but the run row vanished — treat as no override
    // and fall through to global lookup.
    logger.warn(`${TAG} dangling override FK ${ga.bracketMixOverrideRunId} for ga=${companyId}`);
  }

  const [latestGlobal] = await database
    .select({ id: bracketMixRuns.id, mixValue: bracketMixRuns.mixValue })
    .from(bracketMixRuns)
    .where(
      and(
        eq(bracketMixRuns.targetKind, "global_default"),
        isNull(bracketMixRuns.targetId),
      ),
    )
    .orderBy(desc(bracketMixRuns.runAt))
    .limit(1);

  if (latestGlobal) {
    return {
      mix: latestGlobal.mixValue,
      source: "global",
      provisional: false,
      runId: latestGlobal.id,
    };
  }

  const equalWeightMix = await coldStartEqualWeight(database);
  return { mix: equalWeightMix, source: "provisional", provisional: true, runId: null };
}

async function coldStartEqualWeight(
  database: typeof defaultDb,
): Promise<BracketMixData> {
  const brackets = await database
    .select({
      slug: icpBrackets.slug,
      name: icpBrackets.name,
      archetypeLabel: icpBrackets.archetypeLabel,
      customerType: icpBrackets.customerType,
    })
    .from(icpBrackets)
    .where(eq(icpBrackets.isActive, true));

  const equalWeight = brackets.length > 0 ? 1 / brackets.length : 0;
  const entries: BracketEntry[] = brackets.map((b) => ({
    id: b.slug,
    name: b.name,
    archetypeLabel: b.archetypeLabel,
    serviceConsumption: b.customerType === "str" ? "str" : "hotel",
    weight: equalWeight,
  }));
  return {
    entries,
    assignedAt: new Date().toISOString(),
    evidence: "Cold-start equal-weight — no peer or company override available (provisional)",
  };
}

// ── writeEffectiveBracketMix (override-aware shared writer) ─────────────────

export interface WriteEffectiveBracketMixArgs {
  companyId: number;
  mix: BracketMixData;
  kind: WriteKind;
  /**
   * When kind === 'override-set', the existing bracket_mix_runs.id created
   * by U3's Tiago runForCompanyOverride; the writer links this id via
   * globalAssumptions.bracket_mix_override_run_id and mirrors mix into
   * globalAssumptions.bracket_mix.
   */
  overrideRunId?: number;
  /**
   * Free-form evidence label used when the writer needs to insert a fresh
   * `bracket_mix_runs` row (Option A direct-admin-write upgrade path).
   */
  evidenceLabel?: string;
}

export interface WriteEffectiveBracketMixResult {
  /** The (possibly new) bracket_mix_runs id this write produced or referenced. */
  runId: number | null;
  /** Source semantics for the new state. */
  source: EffectiveSource;
}

/**
 * Single chokepoint for every writer of globalAssumptions.bracket_mix.
 *
 * Routing rules:
 *   - `kind='override-set'`: caller supplies overrideRunId (a row Tiago
 *     produced via runForCompanyOverride). The writer mirrors the run's
 *     mix to globalAssumptions.bracket_mix AND sets bracket_mix_override_run_id.
 *   - `kind='manual-assign'`:
 *       - No override active on the row → write the mix directly to
 *         globalAssumptions.bracket_mix; leave override FK alone (NULL).
 *       - Override IS active → Option A: insert a fresh
 *         bracket_mix_runs row (target_kind='company') wrapping this mix,
 *         link via bracket_mix_override_run_id, and mirror.
 *   - `kind='override-promote'`: explicit caller variant of the
 *     manual-assign override-active path (same semantics as above; the
 *     two names just disambiguate caller intent in logs).
 */
export async function writeEffectiveBracketMix(
  args: WriteEffectiveBracketMixArgs,
  database: typeof defaultDb = defaultDb,
): Promise<WriteEffectiveBracketMixResult> {
  const { companyId, mix, kind, overrideRunId, evidenceLabel } = args;

  return database.transaction(async (tx) => {
    const [ga] = await tx
      .select({
        id: globalAssumptions.id,
        bracketMixOverrideRunId: globalAssumptions.bracketMixOverrideRunId,
      })
      .from(globalAssumptions)
      .where(eq(globalAssumptions.id, companyId));

    if (!ga) {
      throw new Error(`global_assumptions row ${companyId} not found`);
    }

    if (kind === "override-set") {
      if (overrideRunId === undefined) {
        throw new Error("writeEffectiveBracketMix: override-set requires overrideRunId");
      }
      await tx
        .update(globalAssumptions)
        .set({
          bracketMix: mix,
          bracketMixOverrideRunId: overrideRunId,
          updatedAt: new Date(),
        })
        .where(eq(globalAssumptions.id, companyId));
      return { runId: overrideRunId, source: "override" };
    }

    const overrideActive = ga.bracketMixOverrideRunId !== null;
    const shouldUpgradeToOverride = overrideActive || kind === "override-promote";

    if (shouldUpgradeToOverride) {
      // Option A: admin direct-write while override is active becomes a new
      // override (preserves admin agency, never silently clobbers).
      const insert: InsertBracketMixRun = {
        targetKind: "company",
        targetId: companyId,
        model: "manual",
        sources: null,
        mixValue: mix,
        provisional: false,
      };
      const [run] = await tx
        .insert(bracketMixRuns)
        .values(insert)
        .returning({ id: bracketMixRuns.id });
      if (!run) throw new Error("bracket_mix_runs insert returned no rows");

      await tx
        .update(globalAssumptions)
        .set({
          bracketMix: mix,
          bracketMixOverrideRunId: run.id,
          updatedAt: new Date(),
        })
        .where(eq(globalAssumptions.id, companyId));

      logger.info(
        `${TAG} manual write upgraded to override for ga=${companyId} → runId=${run.id} ` +
          `(was override-active=${overrideActive}; ${evidenceLabel ?? "no label"})`,
      );
      return { runId: run.id, source: "override" };
    }

    // No override active and not promoting — mirror the value into the
    // global slot. The engine reads from globalAssumptions.bracket_mix; we
    // do NOT create a bracket_mix_runs row for plain admin writes because
    // U5's orchestrator owns the provenance trail for global_default rows.
    await tx
      .update(globalAssumptions)
      .set({ bracketMix: mix, updatedAt: new Date() })
      .where(eq(globalAssumptions.id, companyId));
    return { runId: null, source: "global" };
  });
}

// ── clearBracketMixOverride ────────────────────────────────────────────────

/**
 * Clear an active override and re-mirror the latest target_kind='global_default'
 * run into globalAssumptions.bracket_mix (R8).
 *
 * Returns whether an override was active before this call (false → no-op).
 */
export async function clearBracketMixOverride(
  companyId: number,
  database: typeof defaultDb = defaultDb,
): Promise<{ wasActive: boolean; mirroredFromRunId: number | null }> {
  return database.transaction(async (tx) => {
    const [ga] = await tx
      .select({
        id: globalAssumptions.id,
        bracketMixOverrideRunId: globalAssumptions.bracketMixOverrideRunId,
      })
      .from(globalAssumptions)
      .where(eq(globalAssumptions.id, companyId));
    if (!ga) {
      throw new Error(`global_assumptions row ${companyId} not found`);
    }
    if (ga.bracketMixOverrideRunId === null) {
      return { wasActive: false, mirroredFromRunId: null };
    }

    const [latestGlobal] = await tx
      .select({ id: bracketMixRuns.id, mixValue: bracketMixRuns.mixValue })
      .from(bracketMixRuns)
      .where(
        and(
          eq(bracketMixRuns.targetKind, "global_default"),
          isNull(bracketMixRuns.targetId),
        ),
      )
      .orderBy(desc(bracketMixRuns.runAt))
      .limit(1);

    // If no global_default run exists, fall back to equal-weight so the
    // engine read continues to make sense. We don't persist provisional
    // state per R4 — we set bracket_mix to the equal-weight value but
    // leave bracket_mix_override_run_id NULL.
    const mirroredMix = latestGlobal?.mixValue ?? (await coldStartEqualWeight(tx as unknown as typeof defaultDb));

    await tx
      .update(globalAssumptions)
      .set({
        bracketMix: mirroredMix,
        bracketMixOverrideRunId: null,
        updatedAt: new Date(),
      })
      .where(eq(globalAssumptions.id, companyId));

    return {
      wasActive: true,
      mirroredFromRunId: latestGlobal?.id ?? null,
    };
  });
}
