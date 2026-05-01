/**
 * FinancialSharingStorage — orchestrator for the scenario-sharing surface.
 *
 * Composition: this orchestrator wires four focused submodules under
 * `./financial-sharing/` into the same flat public surface the pre-split
 * class exposed. Composition mirrors `server/storage/intelligence/constants.ts`
 * and `server/storage/admin-resource.ts`.
 *
 * Submodules (./financial-sharing/):
 *   - listing.ts — getAllScenarios + createScenarioForUser + getScenarioCountByUser
 *                  (cross-user listing, materialization-from-current-state)
 *   - shares.ts  — scenario_shares CRUD (legacy share-with-target table)
 *   - access.ts  — scenario_access CRUD + the user-facing
 *                  "what's been shared with me" reader methods that union
 *                  scenario_shares and scenario_access in one place
 *   - results.ts — scenario_results upsert + latest-result lookup
 *
 * The composition pattern: each submodule is instantiated once, and every
 * prototype method is rebound onto `this`. Combined with declaration merging
 * on `FinancialSharingStorage`, callers (FinancialStorage orchestrator,
 * route handlers, tests) see one flat surface that matches the prior
 * monolithic class verbatim — no signature changes downstream.
 */
import { FinancialSharingListingStorage } from "./financial-sharing/listing";
import { FinancialSharingSharesStorage } from "./financial-sharing/shares";
import { FinancialSharingAccessStorage } from "./financial-sharing/access";
import { FinancialSharingResultsStorage } from "./financial-sharing/results";

/**
 * Single source of truth for which submodules the orchestrator wires up.
 * Both the constructor below and the orchestrator audit test
 * (`tests/audit/financial-sharing-orchestrator.test.ts`) iterate this list,
 * so adding a new submodule here automatically extends the runtime
 * composition AND the gate-time audit — no second place to update.
 */
export const FINANCIAL_SHARING_DOMAIN_FACTORIES = [
  () => new FinancialSharingListingStorage(),
  () => new FinancialSharingSharesStorage(),
  () => new FinancialSharingAccessStorage(),
  () => new FinancialSharingResultsStorage(),
] as const;

export interface FinancialSharingStorage
  extends FinancialSharingListingStorage,
    FinancialSharingSharesStorage,
    FinancialSharingAccessStorage,
    FinancialSharingResultsStorage {}

export class FinancialSharingStorage {
  constructor() {
    for (const factory of FINANCIAL_SHARING_DOMAIN_FACTORIES) {
      const instance = factory();
      const proto = Object.getPrototypeOf(instance) as object;
      for (const name of Object.getOwnPropertyNames(proto)) {
        if (name === "constructor") continue;
        const value = (proto as Record<string, unknown>)[name];
        if (typeof value !== "function") continue;
        (this as Record<string, unknown>)[name] = (value as (...a: unknown[]) => unknown).bind(instance);
      }
    }
  }
}
