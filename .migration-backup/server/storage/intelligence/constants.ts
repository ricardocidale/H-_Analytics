/**
 * ConstantsStorage — orchestrator that composes the five focused
 * sub-modules under `./constants/` into the same flat public surface the
 * pre-split class exposed.
 *
 * Sub-modules (./constants/):
 *   - sources.ts             — source registry + call logs + key
 *                              rotations + pipeline policies.
 *   - scheduled-workflows.ts — scheduled research workflows.
 *   - tax-bulletin-cache.ts  — Helena's tax-bulletin diff cache.
 *   - watchdog.ts            — analyst cooldown, watchdog benchmarks,
 *                              capital-raise benchmarks, exit multiples,
 *                              analyst refresh audit log + settings.
 *   - benchmarks.ts          — benchmark snapshots, hospitality, market
 *                              ADR, seasonal/event/airport calendars,
 *                              labor + F&B benchmarks, specialist-tool
 *                              freshness lookup.
 *
 * Each sub-module accepts an `IntelligenceTx` so a future caller can
 * stitch a multi-domain operation into one Postgres transaction via
 * `IntelligenceTx.run((tx) => ...)`. The orchestrator instantiates each
 * domain with the supplied tx (defaulting to `ROOT_TX` for the
 * non-transactional root executor) and rebinds every prototype method
 * onto `this`. Combined with declaration merging on `ConstantsStorage`,
 * the public surface matches the prior monolithic class verbatim.
 */
import type { IntelligenceTx } from "./tx";
import { ROOT_TX } from "./tx";
import { SourcesStorage } from "./constants/sources";
import { ScheduledWorkflowsStorage } from "./constants/scheduled-workflows";
import { TaxBulletinCacheStorage } from "./constants/tax-bulletin-cache";
import { WatchdogStorage } from "./constants/watchdog";
import { BenchmarksStorage } from "./constants/benchmarks";

type SourcesApi = Omit<SourcesStorage, "_ctx">;
type ScheduledWorkflowsApi = Omit<ScheduledWorkflowsStorage, "_ctx">;
type TaxBulletinCacheApi = Omit<TaxBulletinCacheStorage, "_ctx">;
type WatchdogApi = Omit<WatchdogStorage, "_ctx">;
type BenchmarksApi = Omit<BenchmarksStorage, "_ctx">;

export interface ConstantsStorage
  extends SourcesApi, ScheduledWorkflowsApi, TaxBulletinCacheApi, WatchdogApi, BenchmarksApi {}

export class ConstantsStorage {
  constructor(tx: IntelligenceTx = ROOT_TX) {
    const domains = [
      new SourcesStorage(tx),
      new ScheduledWorkflowsStorage(tx),
      new TaxBulletinCacheStorage(tx),
      new WatchdogStorage(tx),
      new BenchmarksStorage(tx),
    ] as const;

    for (const instance of domains) {
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
