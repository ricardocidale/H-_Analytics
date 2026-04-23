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
import { ROOT_TX } from "./intelligence/tx";
import { ConstantsStorage } from "./intelligence/constants";
import { ResearchRunsStorage } from "./intelligence/research-runs";
import { ProposalsStorage } from "./intelligence/proposals";

export { IntelligenceRebeccaStorage } from "./intelligence-rebecca";
export { IntelligenceTx, ROOT_TX } from "./intelligence/tx";

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
    const constants = new ConstantsStorage(ROOT_TX);
    const research = new ResearchRunsStorage(ROOT_TX);
    const proposals = new ProposalsStorage(ROOT_TX);

    // Bind each domain's prototype methods onto `this` so the orchestrator
    // exposes them as own bound properties. Re-binding via `.bind(otherThis)`
    // by callers is a no-op (an already-bound function ignores subsequent
    // thisArgs) — DatabaseStorage's `.bind(this.intelligenceV2)` continues
    // to work unchanged.
    for (const instance of [constants, research, proposals] as const) {
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
