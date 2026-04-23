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

/**
 * Storage-shape we depend on. Kept as a structural type so this module does
 * not pull the whole `IStorage` interface (and its many transitive imports)
 * into the engine layer.
 */
export interface PrerequisiteStorage {
  getAllProperties(userId?: number): Promise<Array<{ id: number; name?: string | null }>>;
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

// ── Built-in evaluators ────────────────────────────────────────────────

/**
 * `all-properties-financials-computed` — minimum scaffolding evaluator.
 *
 * Today this checks property presence in the user's scope (shared portfolio
 * + user-owned). The "financials computed" flag does not yet have a
 * persisted column on `properties`; once it does, this evaluator should be
 * upgraded to read that column instead of property presence. The fail mode
 * is loud, not silent — that is the contract: never report `ok` for a
 * prerequisite we cannot actually verify.
 *
 * If the user has zero properties, the prerequisite fails with a clear
 * reason; specialists that explicitly want "no properties is fine" should
 * not toggle this prerequisite on.
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
    return { ok: true };
  },
);
