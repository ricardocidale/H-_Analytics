/**
 * FinancialStorage — orchestrator for the financial-domain storage surface.
 *
 * The pre-split file was a single 538-line class that interleaved global
 * assumptions, scenario CRUD, scenario load (with helper functions), per-
 * scenario property overrides, and pass-through delegations to fee + sharing
 * storage. This file now wires six focused submodules together while keeping
 * the public `FinancialStorage` shape identical for callers (DatabaseStorage,
 * IStorage, route handlers, etc.).
 *
 * Submodules:
 *   - ./financial/global-assumptions.ts — GlobalAssumptionsStorage
 *   - ./financial/scenarios-crud.ts     — ScenariosCrudStorage (+ best-effort
 *                                          vector-store indexing)
 *   - ./financial/scenarios-load.ts     — ScenariosLoadStorage (loadScenario
 *                                          + stable/destructive helpers + fee
 *                                          + service-template sync)
 *   - ./financial/property-overrides.ts — PropertyOverridesStorage
 *   - ./financial-fees.ts               — FinancialFeeStorage (compareScenarios
 *                                          + fee category CRUD)
 *   - ./financial-sharing.ts            — FinancialSharingStorage (sharing,
 *                                          access, results — itself an
 *                                          orchestrator over four submodules)
 *
 * Composition pattern: each submodule is instantiated once, and every
 * callable surface (prototype + own properties — needed because
 * FinancialSharingStorage installs its sub-domain methods as own bound
 * properties in its constructor) is rebound onto `this`. Combined with
 * declaration merging on `FinancialStorage`, callers see one flat surface
 * that matches the prior class verbatim — no signature changes downstream.
 */
import { GlobalAssumptionsStorage } from "./financial/global-assumptions";
import { ScenariosCrudStorage } from "./financial/scenarios-crud";
import { ScenariosLoadStorage } from "./financial/scenarios-load";
import { PropertyOverridesStorage } from "./financial/property-overrides";
import { FinancialFeeStorage } from "./financial-fees";
import { FinancialSharingStorage } from "./financial-sharing";

/**
 * Single source of truth for which submodules the orchestrator wires up.
 * Both the constructor below and the orchestrator audit test
 * (`tests/audit/financial-orchestrator.test.ts`) iterate this list, so
 * adding a new submodule here automatically extends the runtime
 * composition AND the gate-time audit — no second place to update.
 */
export const FINANCIAL_DOMAIN_FACTORIES = [
  () => new GlobalAssumptionsStorage(),
  () => new ScenariosCrudStorage(),
  () => new ScenariosLoadStorage(),
  () => new PropertyOverridesStorage(),
  () => new FinancialFeeStorage(),
  () => new FinancialSharingStorage(),
] as const;

export interface FinancialStorage
  extends GlobalAssumptionsStorage,
    ScenariosCrudStorage,
    ScenariosLoadStorage,
    PropertyOverridesStorage,
    FinancialFeeStorage,
    FinancialSharingStorage {}

export class FinancialStorage {
  constructor() {
    for (const factory of FINANCIAL_DOMAIN_FACTORIES) {
      const instance = factory();
      const seen = new Set<string>();
      // Walk both the prototype (for plain method classes) AND own properties
      // (FinancialSharingStorage is itself an orchestrator that installs its
      // sub-domain methods as own bound props in its constructor).
      const sources: Array<Record<string, unknown>> = [
        instance as unknown as Record<string, unknown>,
        Object.getPrototypeOf(instance) as Record<string, unknown>,
      ];
      for (const src of sources) {
        for (const name of Object.getOwnPropertyNames(src)) {
          if (name === "constructor" || seen.has(name)) continue;
          const value = src[name];
          if (typeof value !== "function") continue;
          seen.add(name);
          (this as Record<string, unknown>)[name] = (value as (...a: unknown[]) => unknown).bind(instance);
        }
      }
    }
  }
}
