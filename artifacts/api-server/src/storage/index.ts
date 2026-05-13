/**
 * storage/index — IStorage interface + DatabaseStorage implementation.
 *
 * IStorage is the single abstraction boundary between route handlers and the
 * database. All routes import `storage` (a DatabaseStorage instance) and call
 * methods on IStorage — they never import Drizzle ORM directly.
 *
 * Domain split: DatabaseStorage composes 24 focused sub-storage classes via
 * the `STORAGE_DOMAIN_FACTORIES` registry. Each sub-class lives in its own
 * file (./users, ./properties, etc.); `financial`, `admin-resource`, and
 * `intelligence-v2` are themselves orchestrators over further submodules.
 *
 * Composition pattern: each domain is instantiated once, and every callable
 * surface (prototype methods + own properties — needed because the nested
 * orchestrators install their sub-domain methods as own bound props in
 * their constructors) is rebound onto `this`. Combined with declaration
 * merging on `IStorage`, callers see one flat surface — no signature
 * changes vs the pre-split per-method-binding implementation.
 *
 * Public field exception: `intelligenceV2` is exposed as a public field
 * because two external sites (server/routes/admin/specialist-tools.ts and
 * tests/server/specialist-identity-propagation.test.ts) reach into it
 * directly. Removing that field would be a breaking signature change.
 */
import { db, pool } from "../db";
import { users, sessions, marketResearch, prospectiveProperties, savedSearches, properties, globalAssumptions, loginLogs, activityLogs, verificationRuns, scenarios, scenarioAccess, notificationPreferences, documentExtractions, conversations, calculationAuditLogs } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UserStorage } from "./users";
import { PropertyStorage } from "./properties";
import { FinancialStorage } from "./financial";
import { AdminStorage } from "./admin";
import { ActivityStorage } from "./activity";
import { ResearchStorage } from "./research";
import { PhotoStorage } from "./photos";
import { DocumentStorage } from "./documents";
import { ServiceStorage } from "./services";
import { NotificationStorage } from "./notifications";
import { IntegrationStorage } from "./integrations";
import { IntelligenceV2Storage, IntelligenceRebeccaStorage } from "./intelligence-v2";
import { PropertyUrlStorage } from "./property-urls";
import { PropertyDdStorage } from "./property-dd";
import { CalcAuditStorage, type ICalcAuditStorage } from "./calc-audit";
import { RenderSettingsStorage } from "./render-settings";
import { ModelConstantsStorage } from "./model-constants";
import { ModelCanonicalsStorage } from "./model-canonicals";
import { AdminResourceStorage } from "./admin-resource";
import { SpecialistConfigStorage } from "./specialist-config";
import { SpecialistIdentityStorage } from "./specialist-identity";
import { MediaStorageImpl, type MediaStorage } from "./media";
import { SchedulerRunsStorageImpl, type SchedulerRunsStorage } from "./scheduler-runs";
import { MinionSelfTestRunsStorageImpl, type MinionSelfTestRunsStorage } from "./minion-self-test-runs";
import { SelfTestLogsStorageImpl, type SelfTestLogsStorage } from "./self-test-logs";
import { StorageDriftSweepRunsStorageImpl, type StorageDriftSweepRunsStorage } from "./storage-drift-sweep-runs";
import { PropertyDescriptorDriftLogStorageImpl, type PropertyDescriptorDriftLogStorage } from "./property-descriptor-drift-log";
import { MarketSignalsStorage } from "./market-signals";
import { PropertyDeckPayloadStorageImpl, type PropertyDeckPayloadStorage } from "./property-deck-payloads";
import { BulkDraftRunsStorageImpl, type BulkDraftRunsStorage } from "./bulk-draft-runs";
import { LbSlidesStorageImpl, type LbSlidesStorage } from "./lb-slides";
import { MarketRatesStorage } from "./market-rates";
import { ReferenceDataStorage } from "./reference-data";

export interface IStorage extends
  UserStorage,
  PropertyStorage,
  FinancialStorage,
  AdminStorage,
  ActivityStorage,
  ResearchStorage,
  PhotoStorage,
  DocumentStorage,
  ServiceStorage,
  NotificationStorage,
  IntegrationStorage,
  IntelligenceV2Storage,
  IntelligenceRebeccaStorage,
  PropertyUrlStorage,
  PropertyDdStorage,
  ICalcAuditStorage,
  RenderSettingsStorage,
  ModelConstantsStorage,
  ModelCanonicalsStorage,
  AdminResourceStorage,
  SpecialistConfigStorage,
  SpecialistIdentityStorage,
  MediaStorage,
  SchedulerRunsStorage,
  MinionSelfTestRunsStorage,
  SelfTestLogsStorage,
  StorageDriftSweepRunsStorage,
  PropertyDescriptorDriftLogStorage,
  MarketSignalsStorage,
  PropertyDeckPayloadStorage,
  BulkDraftRunsStorage,
  LbSlidesStorage,
  MarketRatesStorage,
  ReferenceDataStorage {
  deleteUser(id: number): Promise<void>;
  getDbHealth(): Promise<{ serverTime: string; pool: { total: number; idle: number; waiting: number }; migrationsReady: boolean }>;
}

/**
 * Single source of truth for which sub-storage modules DatabaseStorage wires up.
 *
 * Both the constructor below and the orchestrator audit test
 * (`tests/audit/database-storage-orchestrator.test.ts`) iterate this list, so
 * adding a new sub-storage here automatically extends the runtime composition
 * AND the gate-time audit — no second place to update.
 *
 * NOTE: `intelligenceV2` is constructed separately as a public field (see
 * class body) and then included in this list so its methods are bound onto
 * `this` as well. The same instance is used for both purposes.
 */
function buildDomainFactories(intelligenceV2: IntelligenceV2Storage) {
  return [
    () => new UserStorage(),
    () => new PropertyStorage(),
    () => new FinancialStorage(),
    () => new AdminStorage(),
    () => new ActivityStorage(),
    () => new ResearchStorage(),
    () => new PhotoStorage(),
    () => new DocumentStorage(),
    () => new ServiceStorage(),
    () => new NotificationStorage(),
    () => new IntegrationStorage(),
    () => intelligenceV2,
    () => new IntelligenceRebeccaStorage(),
    () => new PropertyUrlStorage(),
    () => new PropertyDdStorage(),
    () => new CalcAuditStorage(),
    () => new RenderSettingsStorage(),
    () => new ModelConstantsStorage(),
    () => new ModelCanonicalsStorage(),
    () => new AdminResourceStorage(),
    () => new SpecialistConfigStorage(),
    () => new SpecialistIdentityStorage(),
    () => new MediaStorageImpl(),
    () => new SchedulerRunsStorageImpl(),
    () => new MinionSelfTestRunsStorageImpl(),
    () => new SelfTestLogsStorageImpl(),
    () => new StorageDriftSweepRunsStorageImpl(),
    () => new PropertyDescriptorDriftLogStorageImpl(),
    () => new MarketSignalsStorage(),
    () => new PropertyDeckPayloadStorageImpl(),
    () => new BulkDraftRunsStorageImpl(),
    () => new LbSlidesStorageImpl(),
    () => new MarketRatesStorage(),
    () => new ReferenceDataStorage(),
  ] as const;
}

// Declaration merging — DatabaseStorage's methods are installed by the
// constructor as own bound properties (via the STORAGE_DOMAIN_FACTORIES
// loop). This interface tells TypeScript to treat every IStorage method as
// present on DatabaseStorage so the `implements IStorage` check passes and
// `storage.foo()` calls in routes resolve at compile time.
export interface DatabaseStorage extends IStorage {}

export class DatabaseStorage implements IStorage {
  // Public field — two external call sites (server/routes/admin/specialist-tools.ts
  // + tests/server/specialist-identity-propagation.test.ts) reach into this directly.
  intelligenceV2 = new IntelligenceV2Storage();

  constructor() {
    const factories = buildDomainFactories(this.intelligenceV2);
    // Track which method-name came from which factory index — first writer wins
    // (no current collisions; this exists so future collisions surface clearly
    // in the audit test rather than silently overwriting).
    for (const factory of factories) {
      const instance = factory();
      const seen = new Set<string>();
      // Walk own properties first (nested orchestrators install bound methods
      // there) then fall through to the prototype for plain method classes.
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
          // Don't clobber existing methods (deleteUser, getDbHealth, or an
          // earlier factory's identically-named method — first registered wins).
          if (Object.prototype.hasOwnProperty.call(this, name)) continue;
          (this as Record<string, unknown>)[name] = (value as (...a: unknown[]) => unknown).bind(instance);
        }
      }
    }
  }

  /**
   * Delete a user and ALL related data in a single transaction.
   * Cascading deletes remove sessions, scenarios, research, properties,
   * assumptions, login logs, activity logs, and verification runs.
   */
  async deleteUser(id: number): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(sessions).where(eq(sessions.userId, id));
      await tx.delete(scenarioAccess).where(eq(scenarioAccess.ownerId, id));
      await tx.delete(scenarioAccess).where(eq(scenarioAccess.granteeId, id));
      await tx.delete(scenarios).where(eq(scenarios.userId, id));
      await tx.delete(marketResearch).where(eq(marketResearch.userId, id));
      await tx.delete(prospectiveProperties).where(eq(prospectiveProperties.userId, id));
      await tx.delete(savedSearches).where(eq(savedSearches.userId, id));
      await tx.delete(notificationPreferences).where(eq(notificationPreferences.userId, id));
      await tx.delete(documentExtractions).where(eq(documentExtractions.userId, id));
      await tx.delete(conversations).where(eq(conversations.userId, id));
      await tx.delete(properties).where(eq(properties.userId, id));
      await tx.delete(globalAssumptions).where(eq(globalAssumptions.userId, id));
      await tx.delete(loginLogs).where(eq(loginLogs.userId, id));
      await tx.delete(activityLogs).where(eq(activityLogs.userId, id));
      await tx.delete(verificationRuns).where(eq(verificationRuns.userId, id));
      await tx.delete(calculationAuditLogs).where(eq(calculationAuditLogs.userId, id));
      await tx.delete(users).where(eq(users.id, id));
    });
  }

  async getDbHealth(): Promise<{ serverTime: string; pool: { total: number; idle: number; waiting: number }; migrationsReady: boolean }> {
    const result = await pool.query("SELECT NOW() AS server_time");
    const migResult = await pool.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'properties') AS ready"
    );
    return {
      serverTime: result.rows[0]?.server_time,
      pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount },
      migrationsReady: migResult.rows[0]?.ready === true,
    };
  }
}
