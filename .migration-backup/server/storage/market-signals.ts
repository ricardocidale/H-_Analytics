/**
 * Market Signals Storage — Submarket Supply Pipeline + STR Ordinance Events.
 *
 * Storage interface for the two normalized tables introduced in Task #810.
 * Both surfaces are property-anchored (one row → one project / event for
 * a given property's submarket / locality); upserts are idempotent on the
 * (propertyId, name+title) tuple so repeated Specialist refreshes do not
 * pile up duplicates.
 */

import { db } from "../db";
import { eq, and, desc, asc } from "drizzle-orm";
import {
  submarketSupplyProjects,
  strOrdinanceEvents,
  type SubmarketSupplyProject,
  type InsertSubmarketSupplyProject,
  type StrOrdinanceEvent,
  type InsertStrOrdinanceEvent,
} from "@shared/schema";

export class MarketSignalsStorage {
  // ── Supply Pipeline Projects ─────────────────────────────────────

  async listSupplyProjectsForProperty(propertyId: number): Promise<SubmarketSupplyProject[]> {
    return await db.select().from(submarketSupplyProjects)
      .where(eq(submarketSupplyProjects.propertyId, propertyId))
      .orderBy(asc(submarketSupplyProjects.openingYear), desc(submarketSupplyProjects.keyCount));
  }

  async insertSupplyProject(data: InsertSupplyProjectInput): Promise<SubmarketSupplyProject> {
    const [row] = await db.insert(submarketSupplyProjects)
      .values(data as typeof submarketSupplyProjects.$inferInsert)
      .returning();
    return row;
  }

  async upsertSupplyProject(data: InsertSupplyProjectInput): Promise<SubmarketSupplyProject> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(submarketSupplyProjects)
        .where(and(
          eq(submarketSupplyProjects.propertyId, data.propertyId),
          eq(submarketSupplyProjects.name, data.name),
        ))
        .limit(1)
        .for("update");

      if (existing) {
        const [updated] = await tx.update(submarketSupplyProjects)
          .set({
            submarketKey: data.submarketKey,
            brand: data.brand ?? null,
            segment: data.segment ?? null,
            keyCount: data.keyCount ?? 0,
            status: data.status ?? "planned",
            openingYear: data.openingYear ?? null,
            distanceKm: data.distanceKm ?? null,
            source: data.source ?? null,
            sourceUrl: data.sourceUrl ?? null,
            conviction: data.conviction ?? "medium",
            notes: data.notes ?? null,
            lastRefreshedAt: data.lastRefreshedAt ?? new Date(),
            updatedAt: new Date(),
          })
          .where(eq(submarketSupplyProjects.id, existing.id))
          .returning();
        return updated;
      }
      const [inserted] = await tx.insert(submarketSupplyProjects)
        .values({ ...data, lastRefreshedAt: data.lastRefreshedAt ?? new Date() } as typeof submarketSupplyProjects.$inferInsert)
        .returning();
      return inserted;
    });
  }

  async deleteSupplyProject(id: number, propertyId: number): Promise<void> {
    await db.delete(submarketSupplyProjects)
      .where(and(eq(submarketSupplyProjects.id, id), eq(submarketSupplyProjects.propertyId, propertyId)));
  }

  // ── STR Ordinance Events ─────────────────────────────────────────

  async listStrEventsForProperty(propertyId: number): Promise<StrOrdinanceEvent[]> {
    return await db.select().from(strOrdinanceEvents)
      .where(eq(strOrdinanceEvents.propertyId, propertyId))
      .orderBy(desc(strOrdinanceEvents.eventDate));
  }

  async insertStrEvent(data: InsertStrEventInput): Promise<StrOrdinanceEvent> {
    const [row] = await db.insert(strOrdinanceEvents)
      .values(data as typeof strOrdinanceEvents.$inferInsert)
      .returning();
    return row;
  }

  async upsertStrEvent(data: InsertStrEventInput): Promise<StrOrdinanceEvent> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(strOrdinanceEvents)
        .where(and(
          eq(strOrdinanceEvents.propertyId, data.propertyId),
          eq(strOrdinanceEvents.title, data.title),
          eq(strOrdinanceEvents.eventDate, data.eventDate),
        ))
        .limit(1)
        .for("update");

      if (existing) {
        const [updated] = await tx.update(strOrdinanceEvents)
          .set({
            localityKey: data.localityKey,
            summary: data.summary ?? null,
            eventType: data.eventType,
            direction: data.direction ?? "stable",
            source: data.source ?? null,
            sourceUrl: data.sourceUrl ?? null,
            conviction: data.conviction ?? "medium",
            rulesSnapshot: data.rulesSnapshot ?? null,
            lastRefreshedAt: data.lastRefreshedAt ?? new Date(),
            updatedAt: new Date(),
          })
          .where(eq(strOrdinanceEvents.id, existing.id))
          .returning();
        return updated;
      }
      const [inserted] = await tx.insert(strOrdinanceEvents)
        .values({ ...data, lastRefreshedAt: data.lastRefreshedAt ?? new Date() } as typeof strOrdinanceEvents.$inferInsert)
        .returning();
      return inserted;
    });
  }

  async deleteStrEvent(id: number, propertyId: number): Promise<void> {
    await db.delete(strOrdinanceEvents)
      .where(and(eq(strOrdinanceEvents.id, id), eq(strOrdinanceEvents.propertyId, propertyId)));
  }
}

export type InsertSupplyProjectInput = InsertSubmarketSupplyProject & {
  propertyId: number;
  submarketKey: string;
  name: string;
};

export type InsertStrEventInput = InsertStrOrdinanceEvent & {
  propertyId: number;
  localityKey: string;
  title: string;
  eventDate: string;
  eventType: string;
};
