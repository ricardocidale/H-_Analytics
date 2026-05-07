/**
 * Prerequisite evaluator registry — runtime "is this satisfied?" checks for
 * the prerequisites declared in `prerequisites.ts`.
 *
 * The library (`prerequisites.ts`) is pure metadata — id, label, description.
 * This file binds each id to an evaluator function that returns
 * `{ ok: true }` or `{ ok: false, reason }`. Specialists (or the route
 * gates that fan out to them) call `evaluatePrerequisites(ids, ctx)` to
 * decide whether to dispatch.
 *
 * Adding a prerequisite:
 *   1. Declare metadata in `prerequisites.ts`.
 *   2. Attach to the relevant Specialists in `specialist-catalog.ts`.
 *   3. Register an evaluator here (or it will be reported as
 *      "no evaluator registered" — a hard fail, not a silent pass).
 */
import { isPrerequisiteId, type PrerequisiteId } from "./prerequisites";
import {
  SPECIALIST_CATALOG,
  getRefreshCadenceDaysForConstant,
  getSpecialistForConstant,
} from "./specialist-catalog";
import { REGISTERED_CONSTANT_KEYS } from "@norfolk/shared/model-constants-registry";

/**
 * Storage-shape we depend on. Kept as a structural type so this module does
 * not pull the whole `IStorage` interface (and its many transitive imports)
 * into the engine layer. Real `IStorage` satisfies this shape; tests pass a
 * minimal fake.
 */
export interface PrereqProperty {
  id: number;
  name?: string | null;
  /** Per-property "financial model fully computed" timestamp; null = never. */
  financialsComputedAt?: Date | null;
  /** Other property fields are addressable as dot-paths (see findMissing). */
  [key: string]: unknown;
}

export interface PrereqResearchRun {
  completedAt?: Date | null;
  startedAt?: Date | null;
}

export interface PrerequisiteStorage {
  getAllProperties(userId?: number): Promise<PrereqProperty[]>;
  /** True iff at least one active management-company row exists. */
  hasManagementCompanyProfile(): Promise<boolean>;
  /** Latest successful research_run for a constants (key, locality) tuple. */
  getLatestSuccessfulRunForConstant(
    constantKey: string,
    country: string | null,
    subdivision: string | null,
  ): Promise<PrereqResearchRun | undefined>;
  /** Union of hard-required field keys across the given Specialist ids. */
  listHardRequiredFieldKeysForSpecialists(
    specialistIds: readonly string[],
  ): Promise<string[]>;
  /**
   * Per-Specialist admin overrides for the scheduled Constants refresh
   * cadence (in days), keyed by Specialist id. Specialists without an
   * override are absent from the map; the prerequisite evaluator falls
   * back to the catalog default in that case. Wired through
   * `specialist_configs.refresh_cadence_days` (admin-editable on the
   * Specialist page → Cadence card).
   */
  getRefreshCadenceOverrides(): Promise<Map<string, number>>;
}

export interface PrerequisiteContext {
  storage: PrerequisiteStorage;
  userId: number;
}

export interface PrerequisiteResult {
  ok: boolean;
  /** Human-readable reason rendered in the gate failure response. */
  reason?: string;
}

export type PrerequisiteEvaluator = (
  ctx: PrerequisiteContext,
) => Promise<PrerequisiteResult>;

const evaluators: Partial<Record<PrerequisiteId, PrerequisiteEvaluator>> = {};

export function registerPrerequisiteEvaluator(
  id: PrerequisiteId,
  fn: PrerequisiteEvaluator,
): void {
  evaluators[id] = fn;
}

export function getPrerequisiteEvaluator(
  id: string,
): PrerequisiteEvaluator | undefined {
  if (!isPrerequisiteId(id)) return undefined;
  return evaluators[id];
}

/**
 * Evaluate every prerequisite id whose toggle is on (`true`). Returns the
 * full list of failures so the caller can show all of them at once instead
 * of forcing the user through one-at-a-time fixes.
 *
 * A toggle for an unregistered prerequisite id is treated as a hard fail
 * (silent passes are forbidden — see `replit.md` failure-mode guidance).
 */
export async function evaluatePrerequisites(
  toggledOnIds: string[],
  ctx: PrerequisiteContext,
): Promise<{ id: string; reason: string }[]> {
  const failures: { id: string; reason: string }[] = [];
  for (const id of toggledOnIds) {
    const evaluator = getPrerequisiteEvaluator(id);
    if (!evaluator) {
      failures.push({
        id,
        reason: `Prerequisite "${id}" is enforced but no evaluator is registered. Add one in engine/analyst/registry/prerequisite-registry.ts.`,
      });
      continue;
    }
    try {
      const result = await evaluator(ctx);
      if (!result.ok) {
        failures.push({ id, reason: result.reason ?? `Prerequisite "${id}" not satisfied.` });
      }
    } catch (err: unknown) {
      failures.push({
        id,
        reason: `Prerequisite "${id}" evaluator threw: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
  return failures;
}

// ── Internal helpers ───────────────────────────────────────────────────

/** Resolve a dot-path against an arbitrary value. Returns undefined on miss. */
function resolvePath(obj: unknown, path: string): unknown {
  const segments = path.split(".");
  let cur: unknown = obj;
  for (const seg of segments) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
    if (cur === undefined) return undefined;
  }
  return cur;
}

/**
 * Returns the subset of `keys` that are "missing" on `obj`. Missing =
 * `null | undefined | "" | NaN`. Mirrors the helper in
 * `engine/analyst/surface/mgmt-co/index.ts` so the prerequisite gate uses
 * the same definition of "populated" the per-Specialist required-fields
 * gate uses — there can't be two different answers to "is this field set".
 */
function missingKeys(obj: unknown, keys: readonly string[]): string[] {
  const missing: string[] = [];
  for (const k of keys) {
    const v = resolvePath(obj, k);
    if (v === null || v === undefined) { missing.push(k); continue; }
    if (typeof v === "string" && v.trim() === "") { missing.push(k); continue; }
    if (typeof v === "number" && Number.isNaN(v)) { missing.push(k); continue; }
  }
  return missing;
}

function summarizeNames(items: string[], max = 3): string {
  if (items.length <= max) return items.join(", ");
  return `${items.slice(0, max).join(", ")}, +${items.length - max} more`;
}

/** Property-subject Specialist ids (declared in the catalog). */
function propertySubjectSpecialistIds(): string[] {
  return SPECIALIST_CATALOG.filter((d) => d.subject === "property").map((d) => d.id);
}

// ── Built-in evaluators ────────────────────────────────────────────────

/**
 * `all-properties-financials-computed` — every property in scope must have a
 * non-null `financialsComputedAt` timestamp. Replaces the old "property
 * presence" smoke check now that the column exists on `properties`. Fails
 * loudly with the count + first few offenders so the operator knows exactly
 * which properties to compute before retrying.
 */
registerPrerequisiteEvaluator(
  "all-properties-financials-computed",
  async ({ storage, userId }) => {
    const props = await storage.getAllProperties(userId);
    if (props.length === 0) {
      return {
        ok: false,
        reason: "No properties in scope. Add at least one property before running this Specialist.",
      };
    }
    const uncomputed = props.filter((p) => !p.financialsComputedAt);
    if (uncomputed.length > 0) {
      const names = uncomputed.map((p) => p.name?.trim() || `property #${p.id}`);
      return {
        ok: false,
        reason: `${uncomputed.length} of ${props.length} property(ies) have no computed financial statement: ${summarizeNames(names)}. Run the financial model on each before this Specialist.`,
      };
    }
    return { ok: true };
  },
);

/**
 * `all-properties-required-fields-complete` — every property in scope must
 * satisfy the union of hard-required field keys declared by the
 * property-subject Specialists' configs (specialist_configs.fieldRequirements
 * with fall back to the legacy `requiredFields` column). When no
 * property-subject Specialist has any hard requirements yet, the gate
 * passes — the operator hasn't asked for anything to be enforced.
 */
registerPrerequisiteEvaluator(
  "all-properties-required-fields-complete",
  async ({ storage, userId }) => {
    const props = await storage.getAllProperties(userId);
    if (props.length === 0) {
      return {
        ok: false,
        reason: "No properties in scope. Add at least one property before running this Specialist.",
      };
    }
    const requiredKeys = await storage.listHardRequiredFieldKeysForSpecialists(
      propertySubjectSpecialistIds(),
    );
    if (requiredKeys.length === 0) return { ok: true };
    const offenders: string[] = [];
    for (const p of props) {
      const missing = missingKeys(p, requiredKeys);
      if (missing.length > 0) {
        const label = p.name?.trim() || `property #${p.id}`;
        offenders.push(`${label} (missing: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "…" : ""})`);
      }
    }
    if (offenders.length > 0) {
      return {
        ok: false,
        reason: `${offenders.length} of ${props.length} property(ies) missing required fields: ${summarizeNames(offenders)}.`,
      };
    }
    return { ok: true };
  },
);

/**
 * `company-profile-saved` — at least one active management-company row must
 * exist. The mgmt-co Specialists reason about the operator's company; if
 * the profile has never been saved the run is a zero-state guess.
 */
registerPrerequisiteEvaluator(
  "company-profile-saved",
  async ({ storage }) => {
    const present = await storage.hasManagementCompanyProfile();
    if (!present) {
      return {
        ok: false,
        reason: "No management-company profile saved yet. Save the company profile (name, segment, target market) before running this Specialist.",
      };
    }
    return { ok: true };
  },
);

/**
 * `constants-refreshed-within-cadence` — every owned Model Constant must
 * have a successful refresh within the owning Specialist's cadence at the
 * United States baseline locality. Constants without a declared cadence
 * (catalog `refreshCadenceDays` undefined) are skipped — they are admin-
 * on-demand only and not subject to staleness.
 *
 * We check the US baseline rather than every override locality on purpose:
 * the scheduled refresh job (server/jobs/specialist-constants-refresh.ts)
 * keys the cadence off the baseline plus opted-in overrides; the baseline
 * is the universal "have we ever touched this in the cadence window"
 * heuristic that catches the operationally common "nobody has refreshed
 * anything in a month" failure mode without dragging the gate into per-
 * locality bookkeeping.
 *
 * Cadence source: this gate uses the admin-tunable
 * `specialist_configs.refresh_cadence_days` override (set on the
 * Specialist page → Cadence card) when present, falling back to the
 * catalog's declared `refreshCadenceDays` per Specialist when no
 * override is configured. The scheduler reads the same override map
 * (`getRefreshCadenceOverrides`), so tightening or loosening the
 * cadence in admin moves the gate and the scheduled refresh together
 * — a Specialist whose override is `null` keeps behaving exactly as
 * it did before this setting was added.
 */
registerPrerequisiteEvaluator(
  "constants-refreshed-within-cadence",
  async ({ storage }) => {
    const stale: string[] = [];
    const now = Date.now();
    const overrides = await storage.getRefreshCadenceOverrides();
    for (const key of REGISTERED_CONSTANT_KEYS) {
      const owner = getSpecialistForConstant(key);
      const catalogCadence = getRefreshCadenceDaysForConstant(key);
      // Admin override only applies when the catalog declares a cadence —
      // otherwise the constant is admin-on-demand only and not subject to
      // staleness, regardless of any stale override that might be set.
      if (catalogCadence == null) continue;
      const overrideCadence = owner ? overrides.get(owner.id) ?? null : null;
      const cadenceDays = overrideCadence ?? catalogCadence;
      const latest = await storage.getLatestSuccessfulRunForConstant(key, "United States", null);
      if (!latest) {
        stale.push(`${key} (never refreshed)`);
        continue;
      }
      const ts = latest.completedAt ?? latest.startedAt ?? null;
      if (!ts) {
        stale.push(`${key} (no timestamp)`);
        continue;
      }
      const ageDays = (now - new Date(ts).getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays >= cadenceDays) {
        stale.push(`${key} (${Math.floor(ageDays)}d old, cadence ${cadenceDays}d)`);
      }
    }
    if (stale.length > 0) {
      return {
        ok: false,
        reason: `${stale.length} constant(s) overdue for refresh: ${summarizeNames(stale)}. Run the Constants refresh job (or refresh manually) before this Specialist.`,
      };
    }
    return { ok: true };
  },
);
