/**
 * intelligence-v2 — orchestrator for the split intelligence storage domain.
 *
 * The pre-split file was a single 1.2k-line class; that made any edit risky
 * because the constants / research-runs / proposals concerns were
 * interleaved and shared a transaction context that couldn't be cleanly
 * split. This file now wires three focused domain modules together while
 * keeping the public `IntelligenceV2Storage` shape identical for callers
 * (DatabaseStorage, IStorage, route handlers, etc.).
 *
 * Domain modules (./intelligence/):
 *   - constants.ts     — model-constant–adjacent tables (benchmarks, source
 *                        registry, scheduled workflows, watchdog, exit
 *                        multiples, refresh audit/settings, analyst
 *                        cooldowns, tax-bulletin cache, specialist-tool
 *                        freshness lookup).
 *   - research-runs.ts — research_runs + relaxation_traces + coverage_snapshots.
 *   - proposals.ts     — assumption guidance, decisions, change-log,
 *                        acknowledgments.
 *
 * All three accept an `IntelligenceTx` (see ./intelligence/tx.ts) so a
 * future caller can stitch a multi-domain operation into one Postgres
 * transaction via `IntelligenceTx.run((tx) => ...)`. The orchestrator
 * itself constructs each domain with `ROOT_TX`, the non-transactional
 * root executor, preserving the pre-split behaviour.
 *
 * Composition pattern: the domains are instantiated in the constructor and
 * every public method on each is rebound onto `this`. Combined with
 * declaration merging on `IntelligenceV2Storage`, callers see one flat
 * surface that matches the prior class — no signature changes downstream.
 */
import { ROOT_TX, type IntelligenceTx } from "./intelligence/tx";
import { ConstantsStorage } from "./intelligence/constants";
import { ResearchRunsStorage } from "./intelligence/research-runs";
import { ProposalsStorage } from "./intelligence/proposals";

export { IntelligenceRebeccaStorage } from "./intelligence-rebecca";
export { IntelligenceTx, ROOT_TX } from "./intelligence/tx";

/**
 * Single source of truth for which domain modules the orchestrator wires up.
 * Both the constructor below and the orchestrator audit test
 * (`tests/audit/intelligence-v2-orchestrator.test.ts`) iterate this list, so
 * adding a new domain here automatically extends the runtime composition AND
 * the gate-time audit — there is no second place to update.
 */
export const INTELLIGENCE_V2_DOMAIN_FACTORIES = [
  (tx: IntelligenceTx) => new ConstantsStorage(tx),
  (tx: IntelligenceTx) => new ResearchRunsStorage(tx),
  (tx: IntelligenceTx) => new ProposalsStorage(tx),
] as const;

// Declaration merging — the interface inherits every public method from
// the three domain classes so consumers (IStorage, DatabaseStorage, etc.)
// see them on `IntelligenceV2Storage` without manual delegate listings.
// `Omit` strips each domain's private tx field so TS doesn't demand
// implementers expose them; only the method surface flows through.
type ConstantsApi = Omit<ConstantsStorage, "_ctx">;
type ResearchRunsApi = Omit<ResearchRunsStorage, "_rtx">;
type ProposalsApi = Omit<ProposalsStorage, "_ptx">;

export interface IntelligenceV2Storage
  extends ConstantsApi, ResearchRunsApi, ProposalsApi {}

export class IntelligenceV2Storage {
  constructor() {
    const instances = INTELLIGENCE_V2_DOMAIN_FACTORIES.map((factory) => factory(ROOT_TX));

    // Bind every callable surface on each domain onto `this` so the
    // orchestrator exposes them as own bound properties. We walk both the
    // prototype (for plain method classes like research/proposals) and
    // own properties (ConstantsStorage installs its sub-domain methods as
    // own bound props in its constructor — see ./intelligence/constants.ts).
    // Re-binding via `.bind(otherThis)` by callers is a no-op (an already-
    // bound function ignores subsequent thisArgs) — DatabaseStorage's
    // `.bind(this.intelligenceV2)` continues to work unchanged.
    for (const instance of instances) {
      const seen = new Set<string>();
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
