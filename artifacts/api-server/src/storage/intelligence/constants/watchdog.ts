import {
  analystCooldowns,
  analystWatchdogBenchmarks,
  capitalRaiseBenchmarks,
  exitMultiples,
  referenceBrands,
  analystRefreshAuditLog,
  analystRefreshSettings,
  type AnalystWatchdogBenchmarks, type InsertAnalystWatchdogBenchmarks,
  type CapitalRaiseBenchmark, type InsertCapitalRaiseBenchmark,
  type ExitMultiple, type InsertExitMultiple,
  type ReferenceBrand, type InsertReferenceBrand,
  type AnalystRefreshAuditLog, type InsertAnalystRefreshAuditLog,
  type AnalystRefreshSettings, type InsertAnalystRefreshSettings,
} from "@workspace/db";
import { eq, and, desc, lte, sql } from "drizzle-orm";
import type { IntelligenceTx } from "../tx";

/**
 * WatchdogStorage — everything the analyst-refresh / Capital-Raise
 * Watchdog flow touches: per-user analyst cooldowns, per-user watchdog
 * benchmarks (seeded from DEFAULT_CAPITAL_RAISE_BENCHMARKS), the
 * shared capital-raise + exit-multiples tables the watchdog writes to,
 * and the refresh audit log + global refresh settings.
 *
 * These tables are co-located here because the cooldown gate, the
 * watchdog ingestion, and the audit-log finalisation all run together
 * inside one POST /api/analyst/refresh request.
 */
export class WatchdogStorage {
  constructor(public readonly _ctx: IntelligenceTx) {}

  // ── Analyst cooldown ─────────────────────────────────────────
  async getAnalystCooldownReservedAt(userId: number): Promise<Date | null> {
    const [row] = await this._ctx.db.select().from(analystCooldowns)
      .where(eq(analystCooldowns.userId, userId))
      .limit(1);
    return row?.reservedAt ?? null;
  }

  /**
   * Atomic admission control for the analyst refresh cooldown.
   *
   * INSERTs a fresh reservation, OR UPDATEs an existing one only when the
   * prior reservation is older than `cooldownMs`. Returns `granted=true`
   * when the slot is acquired (caller may run), or `granted=false` with
   * `retryAfterMs` when the cooldown is still active.
   *
   * This is the only correct primitive for serving multiple admin clicks
   * (or multiple app instances) without two of them passing the gate; a
   * separate read-then-reserve sequence would race.
   */
  async tryReserveAnalystCooldown(
    userId: number,
    now: Date,
    cooldownMs: number,
  ): Promise<{ granted: true } | { granted: false; retryAfterMs: number }> {
    const cutoff = new Date(now.getTime() - cooldownMs);
    const [row] = await this._ctx.db.insert(analystCooldowns)
      .values({ userId, reservedAt: now })
      .onConflictDoUpdate({
        target: analystCooldowns.userId,
        set: { reservedAt: now },
        setWhere: lte(analystCooldowns.reservedAt, cutoff),
      })
      .returning({ reservedAt: analystCooldowns.reservedAt });
    if (!row) {
      const [existing] = await this._ctx.db.select().from(analystCooldowns)
        .where(eq(analystCooldowns.userId, userId))
        .limit(1);
      const elapsed = existing ? now.getTime() - existing.reservedAt.getTime() : 0;
      const retryAfterMs = Math.max(0, cooldownMs - elapsed);
      return { granted: false, retryAfterMs };
    }
    return { granted: true };
  }

  /**
   * Test/admin hook — clears cooldown for one user, or all users if `userId`
   * is omitted. Production code should not call this.
   */
  async clearAnalystCooldown(userId?: number): Promise<void> {
    if (userId == null) {
      await this._ctx.db.delete(analystCooldowns);
    } else {
      await this._ctx.db.delete(analystCooldowns).where(eq(analystCooldowns.userId, userId));
    }
  }

  // ── Analyst Watchdog Benchmarks (per-user cache) ─────────────
  // Stub seeding: when no row exists for the user, insert one populated
  // from DEFAULT_CAPITAL_RAISE_BENCHMARKS. Future task swaps the seed
  // for an LLM-refreshed populator without changing the read path.
  async getAnalystWatchdogBenchmarks(userId: number): Promise<AnalystWatchdogBenchmarks> {
    const rows = await this._ctx.db.select().from(analystWatchdogBenchmarks)
      .where(eq(analystWatchdogBenchmarks.userId, userId))
      .limit(1);
    if (rows.length > 0) return rows[0];
    const { DEFAULT_CAPITAL_RAISE_BENCHMARKS } = await import("@shared/constants-funding");
    const seed: typeof analystWatchdogBenchmarks.$inferInsert = {
      userId,
      ...DEFAULT_CAPITAL_RAISE_BENCHMARKS,
      lastRefreshedAt: null,
      refreshedBy: "stub",
      sourceCount: 0,
      tokensUsed: 0,
    };
    const [inserted] = await this._ctx.db.insert(analystWatchdogBenchmarks).values(seed).returning();
    return inserted;
  }

  async upsertAnalystWatchdogBenchmarks(
    userId: number,
    row: Partial<InsertAnalystWatchdogBenchmarks>,
  ): Promise<AnalystWatchdogBenchmarks> {
    const existing = await this._ctx.db.select().from(analystWatchdogBenchmarks)
      .where(eq(analystWatchdogBenchmarks.userId, userId))
      .limit(1);
    if (existing.length > 0) {
      const [updated] = await this._ctx.db.update(analystWatchdogBenchmarks)
        .set({ ...row, updatedAt: new Date() })
        .where(eq(analystWatchdogBenchmarks.id, existing[0].id))
        .returning();
      return updated;
    }
    // Seed a base row first so every column has a value, then patch.
    const seeded = await this.getAnalystWatchdogBenchmarks(userId);
    const [updated] = await this._ctx.db.update(analystWatchdogBenchmarks)
      .set({ ...row, updatedAt: new Date() })
      .where(eq(analystWatchdogBenchmarks.id, seeded.id))
      .returning();
    return updated;
  }

  // ── Capital Raise Benchmarks ─────────────────────────────────
  async getCapitalRaiseBenchmarks(): Promise<CapitalRaiseBenchmark[]> {
    return this._ctx.db.select().from(capitalRaiseBenchmarks).orderBy(capitalRaiseBenchmarks.dimensionKey);
  }

  async getCapitalRaiseBenchmarkSummary(): Promise<{
    rows: CapitalRaiseBenchmark[];
    lastRefreshedAt: Date | null;
    sourceCount: number;
  }> {
    const rows = await this.getCapitalRaiseBenchmarks();
    const refreshed = rows.map(r => r.lastRefreshedAt).filter((d): d is Date => !!d);
    const lastRefreshedAt = refreshed.length ? new Date(Math.max(...refreshed.map(d => d.getTime()))) : null;
    const sourceCount = rows.reduce((s, r) => Math.max(s, r.sourceCount ?? 0), 0);
    return { rows, lastRefreshedAt, sourceCount };
  }

  async upsertCapitalRaiseBenchmark(data: InsertCapitalRaiseBenchmark): Promise<CapitalRaiseBenchmark> {
    const [existing] = await this._ctx.db.select().from(capitalRaiseBenchmarks)
      .where(eq(capitalRaiseBenchmarks.dimensionKey, data.dimensionKey)).limit(1);
    if (existing) {
      const [updated] = await this._ctx.db.update(capitalRaiseBenchmarks)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(capitalRaiseBenchmarks.id, existing.id))
        .returning();
      return updated;
    }
    const [inserted] = await this._ctx.db.insert(capitalRaiseBenchmarks)
      .values(data as typeof capitalRaiseBenchmarks.$inferInsert)
      .returning();
    return inserted;
  }

  /**
   * Batch write path used by the Capital-Raise Watchdog ingestion pipeline.
   * Each observation is upserted into `capital_raise_benchmarks` keyed by
   * `dimensionKey`. Existing rows inherit their label/unit when the watchdog
   * doesn't supply one; unrecognized dimensions (no existing row + missing
   * label) are skipped so a stray observation can't pollute the table.
   *
   * Note: writes are sequential, not wrapped in a single DB transaction. A
   * mid-loop failure can leave the table partially updated; the caller's
   * audit-log row records exactly which dimensions made it through (the
   * `applied` list) so the next watchdog run reconciles the rest.
   *
   * Returns the dimensionKeys that were applied vs. skipped so the caller can
   * log a precise diff and finalize the audit row accordingly.
   */
  async applyWatchdogCapitalRaiseObservations(
    observations: Array<{
      dimensionKey: string;
      label?: string | null;
      unit?: string | null;
      valueLow: number | null;
      valueMid: number | null;
      valueHigh: number | null;
    }>,
    opts: { sourceCount: number; recordedAt: Date },
  ): Promise<{ applied: CapitalRaiseBenchmark[]; skipped: string[] }> {
    const existingRows = await this.getCapitalRaiseBenchmarks();
    const byKey = new Map(existingRows.map(r => [r.dimensionKey, r] as const));

    const applied: CapitalRaiseBenchmark[] = [];
    const skipped: string[] = [];

    for (const obs of observations) {
      const prior = byKey.get(obs.dimensionKey);
      const label = obs.label ?? prior?.label ?? null;
      const unit = obs.unit ?? prior?.unit ?? "usd";
      if (!label) {
        skipped.push(obs.dimensionKey);
        continue;
      }
      const row = await this.upsertCapitalRaiseBenchmark({
        dimensionKey: obs.dimensionKey,
        label,
        unit,
        valueLow: obs.valueLow,
        valueMid: obs.valueMid,
        valueHigh: obs.valueHigh,
        sourceCount: opts.sourceCount,
        lastRefreshedAt: opts.recordedAt,
      });
      applied.push(row);
    }

    return { applied, skipped };
  }

  // ── Exit Multiples ───────────────────────────────────────────
  async getExitMultiples(): Promise<ExitMultiple[]> {
    return this._ctx.db.select().from(exitMultiples).orderBy(exitMultiples.dimensionKey);
  }

  /**
   * Batch write path used by the Exit-Multiples Watchdog ingestion pipeline.
   * Mirrors `applyWatchdogCapitalRaiseObservations` for the sibling
   * `exit_multiples` table: each observation is upserted keyed by
   * `dimensionKey`, existing rows inherit their label/unit when the watchdog
   * doesn't supply one, and unrecognized dimensions (no existing row +
   * missing label) are skipped so a stray observation can't pollute the
   * table.
   *
   * Note: writes are sequential, not wrapped in a single DB transaction —
   * a mid-loop failure can leave the table partially updated; the caller's
   * audit-log row records exactly which dimensions made it through (the
   * `applied` list) so the next watchdog run reconciles the rest.
   */
  async applyWatchdogExitMultiplesObservations(
    observations: Array<{
      dimensionKey: string;
      label?: string | null;
      unit?: string | null;
      valueLow: number | null;
      valueMid: number | null;
      valueHigh: number | null;
    }>,
    opts: { sourceCount: number; recordedAt: Date },
  ): Promise<{ applied: ExitMultiple[]; skipped: string[] }> {
    const existingRows = await this.getExitMultiples();
    const byKey = new Map(existingRows.map(r => [r.dimensionKey, r] as const));

    const applied: ExitMultiple[] = [];
    const skipped: string[] = [];

    for (const obs of observations) {
      const prior = byKey.get(obs.dimensionKey);
      const label = obs.label ?? prior?.label ?? null;
      const unit = obs.unit ?? prior?.unit ?? "x_revenue";
      if (!label) {
        skipped.push(obs.dimensionKey);
        continue;
      }
      const row = await this.upsertExitMultiple({
        dimensionKey: obs.dimensionKey,
        label,
        unit,
        valueLow: obs.valueLow,
        valueMid: obs.valueMid,
        valueHigh: obs.valueHigh,
        sourceCount: opts.sourceCount,
        lastRefreshedAt: opts.recordedAt,
      });
      applied.push(row);
    }

    return { applied, skipped };
  }

  async getExitMultiplesSummary(): Promise<{
    rows: ExitMultiple[];
    lastRefreshedAt: Date | null;
    sourceCount: number;
  }> {
    const rows = await this.getExitMultiples();
    const refreshed = rows.map(r => r.lastRefreshedAt).filter((d): d is Date => !!d);
    const lastRefreshedAt = refreshed.length ? new Date(Math.max(...refreshed.map(d => d.getTime()))) : null;
    const sourceCount = rows.reduce((s, r) => Math.max(s, r.sourceCount ?? 0), 0);
    return { rows, lastRefreshedAt, sourceCount };
  }

  async upsertExitMultiple(data: InsertExitMultiple): Promise<ExitMultiple> {
    const [existing] = await this._ctx.db.select().from(exitMultiples)
      .where(eq(exitMultiples.dimensionKey, data.dimensionKey)).limit(1);
    if (existing) {
      const [updated] = await this._ctx.db.update(exitMultiples)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(exitMultiples.id, existing.id))
        .returning();
      return updated;
    }
    const [inserted] = await this._ctx.db.insert(exitMultiples)
      .values(data as typeof exitMultiples.$inferInsert)
      .returning();
    return inserted;
  }

  // ── Analyst Refresh Audit Log ────────────────────────────────
  async createAnalystRefreshAuditLog(data: InsertAnalystRefreshAuditLog): Promise<AnalystRefreshAuditLog> {
    const [row] = await this._ctx.db.insert(analystRefreshAuditLog)
      .values(data as typeof analystRefreshAuditLog.$inferInsert)
      .returning();
    return row;
  }

  async finalizeAnalystRefreshAuditLog(
    id: number,
    patch: Partial<InsertAnalystRefreshAuditLog> & { finishedAt?: Date },
  ): Promise<AnalystRefreshAuditLog | undefined> {
    const [row] = await this._ctx.db.update(analystRefreshAuditLog)
      .set(patch)
      .where(eq(analystRefreshAuditLog.id, id))
      .returning();
    return row;
  }

  async getRecentAnalystRefreshAuditLogs(opts: { tableId?: string; userAgent?: string; sinceMs?: number; limit?: number } = {}): Promise<AnalystRefreshAuditLog[]> {
    const since = opts.sinceMs ? new Date(Date.now() - opts.sinceMs) : null;
    const conditions = [];
    if (opts.tableId) conditions.push(eq(analystRefreshAuditLog.tableId, opts.tableId));
    if (opts.userAgent) conditions.push(eq(analystRefreshAuditLog.userAgent, opts.userAgent));
    if (since) conditions.push(sql`${analystRefreshAuditLog.startedAt} > ${since}`);
    const where = conditions.length ? and(...conditions) : undefined;
    return this._ctx.db.select().from(analystRefreshAuditLog)
      .where(where)
      .orderBy(desc(analystRefreshAuditLog.startedAt))
      .limit(opts.limit ?? 50);
  }

  async countAnalystRefreshAttempts(opts: { adminId?: number; sinceMs: number }): Promise<number> {
    const since = new Date(Date.now() - opts.sinceMs);
    const conditions = [sql`${analystRefreshAuditLog.startedAt} > ${since}`];
    if (opts.adminId != null) conditions.push(eq(analystRefreshAuditLog.adminId, opts.adminId));
    const rows = await this._ctx.db.select({ c: sql<number>`count(*)::int` })
      .from(analystRefreshAuditLog)
      .where(and(...conditions));
    return rows[0]?.c ?? 0;
  }

  // ── Analyst Refresh Settings (singleton row id=1) ────────────
  async getAnalystRefreshSettings(): Promise<AnalystRefreshSettings> {
    const [row] = await this._ctx.db.select().from(analystRefreshSettings).where(eq(analystRefreshSettings.id, 1)).limit(1);
    if (row) return row;
    const [inserted] = await this._ctx.db.insert(analystRefreshSettings)
      .values({ id: 1, globalCadenceDays: 30 })
      .returning();
    return inserted;
  }

  async updateAnalystRefreshSettings(patch: InsertAnalystRefreshSettings): Promise<AnalystRefreshSettings> {
    await this.getAnalystRefreshSettings(); // ensure exists
    const [row] = await this._ctx.db.update(analystRefreshSettings)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(analystRefreshSettings.id, 1))
      .returning();
    return row;
  }

  // ── Reference Brands ─────────────────────────────────────────
  async getReferenceBrands(): Promise<ReferenceBrand[]> {
    return this._ctx.db.select().from(referenceBrands).orderBy(referenceBrands.brandName);
  }

  async getReferenceBrandsSummary(): Promise<{
    rows: ReferenceBrand[];
    lastRefreshedAt: Date | null;
    sourceCount: number;
  }> {
    const rows = await this.getReferenceBrands();
    const refreshed = rows.map(r => r.lastRefreshedAt).filter((d): d is Date => !!d);
    const lastRefreshedAt = refreshed.length ? new Date(Math.max(...refreshed.map(d => d.getTime()))) : null;
    // Source count: count rows that have at least one source URL
    const sourceCount = rows.filter(r => Array.isArray(r.sourceUrls) && r.sourceUrls.length > 0).length;
    return { rows, lastRefreshedAt, sourceCount };
  }

  /**
   * Full-replace: deletes all existing rows and inserts the new set atomically.
   * Called by the Analyst refresh endpoint; no diff/commit step.
   */
  async replaceAllReferenceBrands(brands: InsertReferenceBrand[]): Promise<ReferenceBrand[]> {
    await this._ctx.db.delete(referenceBrands);
    if (brands.length === 0) return [];
    return this._ctx.db.insert(referenceBrands)
      .values(brands as typeof referenceBrands.$inferInsert[])
      .returning();
  }

  /**
   * Seeds the reference_brands table from the static default set if it is
   * currently empty. Called on first deploy so the table is populated
   * before any admin triggers an Analyst refresh.
   */
  async seedReferenceBrandsIfEmpty(): Promise<{ seeded: boolean; count: number }> {
    const existing = await this.getReferenceBrands();
    if (existing.length > 0) return { seeded: false, count: existing.length };
    const now = new Date();
    const seeds = REFERENCE_BRANDS_SEED.map(b => ({ ...b, lastRefreshedAt: now }));
    const inserted = await this.replaceAllReferenceBrands(seeds);
    return { seeded: true, count: inserted.length };
  }
}

/**
 * Static seed data for reference_brands — used when the table is empty on
 * first deploy. Matches the 20 brands seeded via SQL migration but kept here
 * so the seeder can re-populate if the table is wiped before the first
 * Analyst refresh runs.
 *
 * NOTE: Wide variation across rows is intentional. Do not "normalize" these
 * — see artifacts/api-server/src/ai/skills/reference-brands.md for doctrine.
 */
const REFERENCE_BRANDS_SEED: Omit<InsertReferenceBrand, "lastRefreshedAt" | "refreshedByRunId">[] = [
  {
    brandName: "Axel Hotels",
    niche: "LGBT+ boutique lifestyle",
    positioningSummary: "Design-forward urban hotels celebrating LGBTQ+ culture and inclusivity with vibrant social spaces",
    guestSegment: "LGBTQ+ travelers and allies, design-conscious urban explorers",
    propertyCount: 11, keyCountMin: 60, keyCountMax: 200,
    geographicFocus: "Europe (Spain, Germany, Netherlands, UK, Argentina)",
    adrUsd: 195, occupancyPct: 0.82, revparUsd: 160,
    revenueRangeLowUsd: 5_000_000, revenueRangeHighUsd: 25_000_000,
    ownershipModel: "Owner-operated with selective franchise",
    acquisitionContext: "Organic growth; seeking PE-backed expansion",
    description: "Founded 2003 in Barcelona, Axel Hotels pioneered the 'hetero-friendly' boutique concept. Known for rooftop bars, design-forward rooms, and an inclusive party culture. ADR ~$180–210 in European markets.",
    referenceDisclaimer: true, dataYear: 2024,
    sourceUrls: ["https://axelhotels.com", "https://hospitalitynet.org/axel-hotels"],
  },
  {
    brandName: "Mama Shelter",
    niche: "Quirky design/lifestyle",
    positioningSummary: "Bold, irreverent design hotels with a strong F&B identity positioned as neighborhood social hubs",
    guestSegment: "Urban millennials, creatives, design-conscious leisure and business travelers",
    propertyCount: 25, keyCountMin: 55, keyCountMax: 180,
    geographicFocus: "Europe, Middle East, North America (Paris-centric)",
    adrUsd: 155, occupancyPct: 0.79, revparUsd: 122,
    revenueRangeLowUsd: 8_000_000, revenueRangeHighUsd: 40_000_000,
    ownershipModel: "Accor-owned (acquired 2014); founder Philippe Starck-designed concept",
    acquisitionContext: "Acquired by Accor; expansion via management agreements",
    description: "Created by Serge Trigano with Philippe Starck, Mama Shelter is renowned for playful interiors, rooftop bars, and vibrant restaurant concepts. Strong brand voice; now global via Accor's SBE portfolio.",
    referenceDisclaimer: true, dataYear: 2024,
    sourceUrls: ["https://mamashelter.com"],
  },
  {
    brandName: "Desire Resorts",
    niche: "Adults-only lifestyle/couples",
    positioningSummary: "Upscale clothing-optional resort experience for couples, emphasizing liberation and intimacy",
    guestSegment: "Couples seeking upscale adults-only and lifestyle/nudist experiences",
    propertyCount: 2, keyCountMin: 80, keyCountMax: 150,
    geographicFocus: "Mexico (Puerto Morelos, Riviera Maya)",
    adrUsd: 350, occupancyPct: 0.78, revparUsd: 273,
    revenueRangeLowUsd: 8_000_000, revenueRangeHighUsd: 20_000_000,
    ownershipModel: "Privately held; operates under management agreements",
    acquisitionContext: "Organic; niche brand with limited competition",
    description: "Desire Pearl and Desire Riviera Maya offer all-inclusive adults-only experiences with a lifestyle (swinger-friendly) positioning. High ADR reflects niche demand and all-inclusive bundling.",
    referenceDisclaimer: true, dataYear: 2024,
    sourceUrls: ["https://desireresorts.com"],
  },
  {
    brandName: "Selina",
    niche: "Co-living / co-working hybrid",
    positioningSummary: "Tech-enabled co-living and co-working hotel brand targeting digital nomads and remote workers",
    guestSegment: "Digital nomads, remote workers, backpackers, younger millennial/Gen Z travelers",
    propertyCount: 150, keyCountMin: 10, keyCountMax: 200,
    geographicFocus: "Global (Latin America, Europe, Middle East, Africa, Asia)",
    adrUsd: 85, occupancyPct: 0.62, revparUsd: 53,
    revenueRangeLowUsd: 40_000_000, revenueRangeHighUsd: 120_000_000,
    ownershipModel: "Publicly traded (NASDAQ: SLNA); asset-light lease model",
    acquisitionContext: "Rapid organic growth via long-term leases; now undergoing restructuring",
    description: "Selina disrupted the hostel market by layering co-working, programming, and community into converted properties globally. ADR is deliberately accessible; revenue model includes co-working day passes and F&B.",
    referenceDisclaimer: true, dataYear: 2024,
    sourceUrls: ["https://selina.com"],
  },
  {
    brandName: "Eleven Experience",
    niche: "Luxury adventure / experiential",
    positioningSummary: "Ultra-premium remote lodge and expedition brand delivering bespoke adventure experiences",
    guestSegment: "High-net-worth adventure seekers, couples celebrating milestones, fly-fishing and skiing enthusiasts",
    propertyCount: 9, keyCountMin: 6, keyCountMax: 25,
    geographicFocus: "USA (Colorado, Montana), Morocco, Greenland, Scotland",
    adrUsd: 650, occupancyPct: 0.72, revparUsd: 468,
    revenueRangeLowUsd: 5_000_000, revenueRangeHighUsd: 20_000_000,
    ownershipModel: "Privately held; owner-operated lodges",
    acquisitionContext: "Organic; founder-led boutique expansion",
    description: "Founded 2007, Eleven Experience operates remote fly-fishing lodges, ski chalets, and expedition camps at $600–800/night all-inclusive. Best-in-class guide programs and low room counts create exclusivity.",
    referenceDisclaimer: true, dataYear: 2024,
    sourceUrls: ["https://elevenexperience.com"],
  },
  {
    brandName: "Yotel",
    niche: "Tech-forward micro-hotel",
    positioningSummary: "Compact, tech-enabled hotels delivering premium sleep quality in high-traffic urban and airport locations",
    guestSegment: "Efficiency-focused business travelers, tech-savvy urban visitors, transit passengers",
    propertyCount: 22, keyCountMin: 55, keyCountMax: 669,
    geographicFocus: "USA, UK, Netherlands, Singapore, Japan, Turkey",
    adrUsd: 185, occupancyPct: 0.80, revparUsd: 148,
    revenueRangeLowUsd: 30_000_000, revenueRangeHighUsd: 90_000_000,
    ownershipModel: "Private equity backed (IHC, Starwood Capital previously)",
    acquisitionContext: "Expansion via management agreements and JVs; significant Asia-Pacific pipeline",
    description: "Yotel pioneered the cabin-hotel concept inspired by first-class airline cabins. Signature features include automated check-in robots (YOBOT), adjustable SmartBeds, and super-efficient room design.",
    referenceDisclaimer: true, dataYear: 2024,
    sourceUrls: ["https://yotel.com"],
  },
  {
    brandName: "1 Hotel",
    niche: "Sustainable luxury",
    positioningSummary: "Biophilic luxury hotels built around nature-inspired design and environmental sustainability",
    guestSegment: "Eco-conscious luxury travelers, design-forward urban guests",
    propertyCount: 12, keyCountMin: 100, keyCountMax: 400,
    geographicFocus: "USA (NY, Miami, Nashville, LA), Caribbean, China",
    adrUsd: 380, occupancyPct: 0.76, revparUsd: 289,
    revenueRangeLowUsd: 25_000_000, revenueRangeHighUsd: 80_000_000,
    ownershipModel: "SH Hotels & Resorts (Starwood Capital); management agreements",
    acquisitionContext: "PE-backed rapid growth; Starwood Capital vehicle",
    description: "1 Hotel launched in 2015 and redefined eco-luxury with living walls, reclaimed wood, organic amenities, and sustainability certifications. Strong F&B programming and rooftop bars drive non-rooms revenue.",
    referenceDisclaimer: true, dataYear: 2024,
    sourceUrls: ["https://1hotels.com"],
  },
  {
    brandName: "Ace Hotel",
    niche: "Indie cultural / creative",
    positioningSummary: "Neighborhood-rooted design hotels celebrating local arts, music, and creative culture",
    guestSegment: "Creatives, artists, musicians, independent-minded travelers, hipster millennials",
    propertyCount: 14, keyCountMin: 80, keyCountMax: 280,
    geographicFocus: "USA (NY, LA, Chicago, Portland, New Orleans), UK, Australia",
    adrUsd: 265, occupancyPct: 0.73, revparUsd: 193,
    revenueRangeLowUsd: 15_000_000, revenueRangeHighUsd: 55_000_000,
    ownershipModel: "Atelier Ace (management company); third-party ownership",
    acquisitionContext: "Management-contract model; selective growth",
    description: "Ace Hotel invented the indie hotel movement in 1999 (Seattle). Lobbies function as community hubs with coffee shops, vinyl DJs, and local art. High-profile collaborations and A-list cultural credibility.",
    referenceDisclaimer: true, dataYear: 2024,
    sourceUrls: ["https://acehotel.com"],
  },
  {
    brandName: "Graduate Hotels",
    niche: "College-town lifestyle",
    positioningSummary: "Experiential hotels in university towns celebrating campus culture, nostalgia, and local pride",
    guestSegment: "Alumni, parents, college sports fans, local business travelers, nostalgic millennials",
    propertyCount: 35, keyCountMin: 80, keyCountMax: 250,
    geographicFocus: "USA (30+ university markets)",
    adrUsd: 180, occupancyPct: 0.74, revparUsd: 133,
    revenueRangeLowUsd: 20_000_000, revenueRangeHighUsd: 70_000_000,
    ownershipModel: "AJ Capital Partners; sold to Hilton 2024 for $210M",
    acquisitionContext: "Acquired by Hilton 2024; prior PE ownership",
    description: "Graduate Hotels operates in 30+ US college markets. Each property is heavily themed around local university culture. Hilton acquisition validates the model at scale.",
    referenceDisclaimer: true, dataYear: 2024,
    sourceUrls: ["https://graduatehotels.com"],
  },
  {
    brandName: "citizenM",
    niche: "Affordable urban luxury / tech",
    positioningSummary: "Modular construction, tech-enabled affordable luxury hotels for the mobile global citizen",
    guestSegment: "Global frequent business travelers, tech-savvy millennials seeking design at accessible prices",
    propertyCount: 33, keyCountMin: 160, keyCountMax: 380,
    geographicFocus: "Europe, USA, Asia (Amsterdam HQ)",
    adrUsd: 195, occupancyPct: 0.85, revparUsd: 166,
    revenueRangeLowUsd: 30_000_000, revenueRangeHighUsd: 100_000_000,
    ownershipModel: "Private (Rattan Chadha family); majority sold to APG Asset Management",
    acquisitionContext: "Balance sheet development model; primarily fee-simple owned assets",
    description: "citizenM pioneered the XL bed + small room + grand lobby format using modular rooms. Industry-leading occupancy ~83–87%. EBITDA margins ~35%.",
    referenceDisclaimer: true, dataYear: 2024,
    sourceUrls: ["https://citizenm.com"],
  },
  {
    brandName: "Proper Hotels",
    niche: "Neighborhood luxury / design",
    positioningSummary: "Architecturally significant boutique luxury hotels rooted in their neighborhoods with strong F&B",
    guestSegment: "Design-conscious luxury travelers, local culture seekers, F&B enthusiasts",
    propertyCount: 7, keyCountMin: 110, keyCountMax: 270,
    geographicFocus: "USA (San Francisco, Santa Monica, Austin, San Jose)",
    adrUsd: 320, occupancyPct: 0.74, revparUsd: 237,
    revenueRangeLowUsd: 15_000_000, revenueRangeHighUsd: 50_000_000,
    ownershipModel: "Proper Hospitality (management); varied third-party ownership",
    acquisitionContext: "Management-contract model; selective urban development",
    description: "Proper Hotels operates architecturally distinctive luxury properties with flagship restaurant partners. Strong design pedigree from Roman and Williams. Formerly known as Commune Hotels.",
    referenceDisclaimer: true, dataYear: 2024,
    sourceUrls: ["https://properhotels.com"],
  },
  {
    brandName: "The Standard Hotels",
    niche: "Iconic design / social",
    positioningSummary: "Transgressive, design-forward lifestyle hotels known for bold architecture, nightlife, and cultural programming",
    guestSegment: "Fashion-forward travelers, nightlife seekers, media/entertainment industry",
    propertyCount: 18, keyCountMin: 60, keyCountMax: 350,
    geographicFocus: "USA (LA, NYC, Miami), Europe (London, Ibiza), Asia",
    adrUsd: 285, occupancyPct: 0.71, revparUsd: 202,
    revenueRangeLowUsd: 20_000_000, revenueRangeHighUsd: 60_000_000,
    ownershipModel: "Andre Balazs Properties (originally); sold to Ennismore/Accor JV 2024",
    acquisitionContext: "Sold to Accor/Ennismore 2024; management agreement model going forward",
    description: "The Standard is known for boundary-pushing design (High Line NY, Meatpacking), rooftop nightlife, and celebrity culture. Acquired by Ennismore to complement Gleneagles, Hoxton, and 25hours.",
    referenceDisclaimer: true, dataYear: 2024,
    sourceUrls: ["https://standardhotels.com"],
  },
  {
    brandName: "Freehand Hotels",
    niche: "Social design / affordable lifestyle",
    positioningSummary: "Design-forward social hotels offering shared and private accommodations in cultural neighborhoods",
    guestSegment: "Social travelers, design-savvy budget-to-mid-range guests, hostel graduates",
    propertyCount: 6, keyCountMin: 100, keyCountMax: 250,
    geographicFocus: "USA (NY, Chicago, Miami, LA)",
    adrUsd: 185, occupancyPct: 0.76, revparUsd: 141,
    revenueRangeLowUsd: 8_000_000, revenueRangeHighUsd: 25_000_000,
    ownershipModel: "Generator Hostels (acquired 2019); Queensway Group backed",
    acquisitionContext: "Acquired by Generator; integrated into lifestyle portfolio",
    description: "Freehand blends hostel energy with boutique hotel amenities with dormitory and private rooms. Lobby bars (the Broken Shaker) are local cultural institutions. High F&B revenue relative to rooms.",
    referenceDisclaimer: true, dataYear: 2024,
    sourceUrls: ["https://freehandhotels.com"],
  },
  {
    brandName: "Autocamp",
    niche: "Glamping / nature-luxury",
    positioningSummary: "Upscale glamping with Airstream trailers, canvas suites, and custom cabins in national park-adjacent locations",
    guestSegment: "Nature-loving affluent couples and families, outdoor enthusiasts seeking comfort",
    propertyCount: 12, keyCountMin: 20, keyCountMax: 100,
    geographicFocus: "USA (Yosemite, Joshua Tree, Catskills, Cape Cod, Smoky Mountains)",
    adrUsd: 325, occupancyPct: 0.71, revparUsd: 231,
    revenueRangeLowUsd: 5_000_000, revenueRangeHighUsd: 20_000_000,
    ownershipModel: "Private (KSL Capital Partners backed)",
    acquisitionContext: "PE-backed build-out; land leases from national parks and private landowners",
    description: "Autocamp pioneered the premium glamping format using refurbished Airstream trailers. RevPAR outperforms comparable limited-service hotels. Strong advance booking; shoulder-season challenge.",
    referenceDisclaimer: true, dataYear: 2024,
    sourceUrls: ["https://autocamp.com"],
  },
  {
    brandName: "21c Museum Hotels",
    niche: "Art-infused boutique luxury",
    positioningSummary: "Contemporary art museum integrated with boutique luxury hotels in secondary US markets",
    guestSegment: "Art collectors, cultural tourists, corporate events, design-forward leisure travelers",
    propertyCount: 12, keyCountMin: 90, keyCountMax: 220,
    geographicFocus: "USA (Louisville, Bentonville, Cincinnati, Durham, etc.)",
    adrUsd: 240, occupancyPct: 0.72, revparUsd: 173,
    revenueRangeLowUsd: 10_000_000, revenueRangeHighUsd: 35_000_000,
    ownershipModel: "Accor (acquired 2018 via 21c founders and MGallery)",
    acquisitionContext: "Acquired by Accor; management agreement model",
    description: "Founded by Laura Lee Brown and Steve Wilson (bourbon heirs), 21c pioneered the museum-hotel concept in secondary markets. Penthouse spaces double as gallery space. Strong F&B and events revenue.",
    referenceDisclaimer: true, dataYear: 2024,
    sourceUrls: ["https://21cmuseumhotels.com"],
  },
  {
    brandName: "Nomad Hotel",
    niche: "Rooftop culture / urban luxury",
    positioningSummary: "Lush, eclectic luxury boutique hotels celebrated for iconic rooftop bars and Instagrammable aesthetics",
    guestSegment: "Fashionable urban professionals, F&B enthusiasts, social media-savvy luxury travelers",
    propertyCount: 4, keyCountMin: 140, keyCountMax: 250,
    geographicFocus: "USA (New York, Los Angeles, Las Vegas), UK (London)",
    adrUsd: 340, occupancyPct: 0.70, revparUsd: 238,
    revenueRangeLowUsd: 10_000_000, revenueRangeHighUsd: 35_000_000,
    ownershipModel: "Sydell Group (management); third-party ownership",
    acquisitionContext: "Management-contract model; expansion stalled post-COVID",
    description: "NoMad Hotel (Madison Square Park NYC flagship) set the standard for urban luxury F&B-driven hospitality. Daniel Humm's restaurant, rooftop bar, and lobby bar generate significant ancillary revenue. ADR ~$300–380.",
    referenceDisclaimer: true, dataYear: 2024,
    sourceUrls: ["https://thenomadhotel.com"],
  },
  {
    brandName: "Life House",
    niche: "Tech-enabled design boutique",
    positioningSummary: "Technology-first lifestyle hotel operator converting independent boutiques into a branded network",
    guestSegment: "Tech-savvy independent travelers, design-conscious leisure guests",
    propertyCount: 18, keyCountMin: 20, keyCountMax: 80,
    geographicFocus: "USA (major leisure markets: Miami, Portland, Hudson, etc.)",
    adrUsd: 195, occupancyPct: 0.77, revparUsd: 150,
    revenueRangeLowUsd: 5_000_000, revenueRangeHighUsd: 18_000_000,
    ownershipModel: "Private (VC-backed: YC, Thrive Capital, others)",
    acquisitionContext: "Asset-light management and revenue-sharing; conversion of independent hotels",
    description: "Life House raised $50M+ to build a tech stack for independent boutique hotels. Operates as a revenue-optimization and management platform. Lower key counts per property reflect independent boutique conversions.",
    referenceDisclaimer: true, dataYear: 2024,
    sourceUrls: ["https://lifehousehotels.com"],
  },
  {
    brandName: "Zoku",
    niche: "Extended stay / urban living",
    positioningSummary: "Hybrid work-live hotel spaces for extended-stay travelers blending home comfort with hotel services",
    guestSegment: "Extended-stay business travelers, expats, remote workers seeking furnished urban apartments",
    propertyCount: 6, keyCountMin: 130, keyCountMax: 220,
    geographicFocus: "Europe (Amsterdam, Paris, Vienna, Copenhagen, London)",
    adrUsd: 160, occupancyPct: 0.82, revparUsd: 131,
    revenueRangeLowUsd: 8_000_000, revenueRangeHighUsd: 25_000_000,
    ownershipModel: "Private (Dutch family office + institutional investors)",
    acquisitionContext: "Organic development; plans for 50 cities by 2030",
    description: "Zoku invented the 'loft' format combining a compact sleeping area with a full work-live space in a foldable configuration. Social rooftops and communal dining drive community. Exceptional occupancy via weekly/monthly pricing.",
    referenceDisclaimer: true, dataYear: 2024,
    sourceUrls: ["https://livezoku.com"],
  },
  {
    brandName: "Dream Hotel Group",
    niche: "Trendy upscale lifestyle",
    positioningSummary: "Aspirational lifestyle hotels with vibrant nightlife, bold design, and celebrity-adjacent social scenes",
    guestSegment: "Upscale leisure travelers, nightlife seekers, entertainment industry, bachelorette/bachelor groups",
    propertyCount: 12, keyCountMin: 90, keyCountMax: 300,
    geographicFocus: "USA (NY, Nashville, Palm Springs), India, Thailand, Bahrain",
    adrUsd: 275, occupancyPct: 0.72, revparUsd: 198,
    revenueRangeLowUsd: 12_000_000, revenueRangeHighUsd: 45_000_000,
    ownershipModel: "PHM Hospitality (management); varied third-party ownership",
    acquisitionContext: "Management-contract led; selective international JVs",
    description: "Dream Hotel Group operates lifestyle hotels with a nightlife-centric identity. Strong F&B and beverage revenue. Nashville and Palm Springs properties capture high-growth leisure demand.",
    referenceDisclaimer: true, dataYear: 2024,
    sourceUrls: ["https://dreamhotels.com"],
  },
  {
    brandName: "Hästens Sleep Spa Hotel",
    niche: "Ultra-luxury wellness / sleep",
    positioningSummary: "World's first sleep-focused luxury hotel featuring bespoke Hästens beds and comprehensive sleep wellness programs",
    guestSegment: "Ultra-affluent wellness travelers, sleep-disorder sufferers, luxury experience collectors",
    propertyCount: 1, keyCountMin: 11, keyCountMax: 11,
    geographicFocus: "Portugal (Covilhã)",
    adrUsd: 1800, occupancyPct: 0.65, revparUsd: 1170,
    revenueRangeLowUsd: 3_000_000, revenueRangeHighUsd: 8_000_000,
    ownershipModel: "Hästens brand-owned concept hotel",
    acquisitionContext: "Single flagship property; proof-of-concept for potential IP licensing",
    description: "The Hästens Sleep Spa Hotel (2021) pushed the niche wellness concept to its extreme: every suite features a $400,000+ Hästens Vividus bed and the $2,000+/night rate includes sleep coaching. ADR/RevPAR reflects ultra-premium niche positioning.",
    referenceDisclaimer: true, dataYear: 2024,
    sourceUrls: ["https://hastens.com/sleep-spa-hotel"],
  },
];
