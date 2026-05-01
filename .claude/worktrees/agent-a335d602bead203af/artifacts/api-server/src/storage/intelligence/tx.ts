import { db } from "../../db";

/**
 * IntelligenceTx — transaction-scoped session object that hands a single
 * Drizzle executor (the root `db` or a live tx handle) to every domain
 * module under `server/storage/intelligence/`.
 *
 * Why this exists (precursor for splitting `intelligence-v2.ts`): until
 * IntelligenceTx existed, the constants / research-runs / proposals
 * methods all reached for the global `db` directly, so a multi-domain
 * operation could not be wrapped in one Postgres transaction without
 * surgery on every call site. Domains now accept an IntelligenceTx and
 * route every query through `tx.db`, which means
 * `IntelligenceTx.run((tx) => ...)` can stitch several domains into one
 * transaction without changing their bodies.
 *
 * The orchestrator (`IntelligenceV2Storage`) instantiates each domain
 * with `ROOT_TX`, the non-transactional root executor — preserving the
 * pre-split behaviour for every existing caller.
 */
type RootDb = typeof db;
type TxHandle = Parameters<Parameters<RootDb["transaction"]>[0]>[0];
export type IntelligenceDb = RootDb | TxHandle;

export class IntelligenceTx {
  constructor(public readonly db: IntelligenceDb) {}

  /**
   * Execute `fn` inside a fresh Postgres transaction; the IntelligenceTx
   * passed in is bound to the transaction handle so any domain methods
   * that receive it participate in the same tx (drizzle uses savepoints
   * for nested calls to `.transaction()`).
   */
  static run<T>(fn: (tx: IntelligenceTx) => Promise<T>): Promise<T> {
    return db.transaction(async (handle) => fn(new IntelligenceTx(handle)));
  }
}

/**
 * Root, non-transactional executor — used by the orchestrator so the
 * per-domain method bodies behave identically to the pre-split file.
 */
export const ROOT_TX = new IntelligenceTx(db);
