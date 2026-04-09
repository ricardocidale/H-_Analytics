import { marketResearch, prospectiveProperties, savedSearches, globalAssumptions, type MarketResearch, type InsertMarketResearch, type ProspectiveProperty, type InsertProspectiveProperty, type SavedSearch, type InsertSavedSearch } from "@shared/schema";
import { db } from "../db";
import { eq, and, desc, isNull, or, sql } from "drizzle-orm";

export class ResearchStorage {
  // ── Market Research ──────────────────────────────────────────────

  /**
   * Find the most recent research report matching the given type and optional
   * userId/propertyId filters. Returns the latest by updatedAt.
   */
  async getMarketResearch(type: string, userId?: number, propertyId?: number): Promise<MarketResearch | undefined> {
    const conditions = [eq(marketResearch.type, type)];
    if (userId) conditions.push(or(eq(marketResearch.userId, userId), isNull(marketResearch.userId))!);
    if (propertyId) conditions.push(eq(marketResearch.propertyId, propertyId));
    
    const [result] = await db.select().from(marketResearch)
      .where(and(...conditions))
      .orderBy(desc(marketResearch.updatedAt))
      .limit(1);
    return result || undefined;
  }
  
  /** List all research reports visible to a user (their own + shared/seed reports). */
  async getAllMarketResearch(userId?: number, limit = 500): Promise<MarketResearch[]> {
    if (userId) {
      return await db.select().from(marketResearch)
        .where(or(eq(marketResearch.userId, userId), isNull(marketResearch.userId)))
        .orderBy(desc(marketResearch.updatedAt))
        .limit(limit);
    }
    return await db.select().from(marketResearch).orderBy(desc(marketResearch.updatedAt)).limit(limit);
  }
  
  /**
   * Create or update a market research report. If a report with the same type,
   * userId, and propertyId already exists, update its content and LLM model;
   * otherwise insert a new one. This prevents duplicate reports from piling up.
   */
  async upsertMarketResearch(data: InsertMarketResearch): Promise<MarketResearch> {
    return await db.transaction(async (tx) => {
      const conditions = [eq(marketResearch.type, data.type!)];
      if (data.userId) conditions.push(eq(marketResearch.userId, data.userId));
      if (data.propertyId) conditions.push(eq(marketResearch.propertyId, data.propertyId));

      const [existing] = await tx.select().from(marketResearch)
        .where(and(...conditions))
        .limit(1)
        .for("update");

      if (existing) {
        const [updated] = await tx.update(marketResearch)
          .set({
            title: data.title,
            content: data.content,
            llmModel: data.llmModel,
            updatedAt: new Date()
          })
          .where(eq(marketResearch.id, existing.id))
          .returning();
        return updated;
      } else {
        const [inserted] = await tx.insert(marketResearch)
          .values(data as typeof marketResearch.$inferInsert)
          .returning();
        return inserted;
      }
    });
  }
  
  async getLastFullResearchRefresh(_userId: number): Promise<Date | null> {
    const [row] = await db.select({ lastFullResearchRefresh: globalAssumptions.lastFullResearchRefresh })
      .from(globalAssumptions)
      .where(isNull(globalAssumptions.userId))
      .orderBy(desc(globalAssumptions.id))
      .limit(1);
    return row?.lastFullResearchRefresh ?? null;
  }

  async markFullResearchRefresh(_userId: number): Promise<void> {
    const [sharedRow] = await db.select({ id: globalAssumptions.id })
      .from(globalAssumptions)
      .where(isNull(globalAssumptions.userId))
      .orderBy(desc(globalAssumptions.id))
      .limit(1);
    if (sharedRow) {
      await db.update(globalAssumptions)
        .set({ lastFullResearchRefresh: new Date() })
        .where(eq(globalAssumptions.id, sharedRow.id));
    }
  }

  // ── Prospective Properties (Property Finder Favorites) ────────

  /** Get all properties a user has favorited from the Property Finder search. */
  async getProspectiveProperties(userId: number): Promise<ProspectiveProperty[]> {
    return await db.select().from(prospectiveProperties)
      .where(eq(prospectiveProperties.userId, userId))
      .orderBy(desc(prospectiveProperties.savedAt));
  }
  
  /**
   * Save a property listing as a favorite. If the user already saved this
   * exact listing (same externalId), return the existing record instead of
   * creating a duplicate.
   */
  async addProspectiveProperty(data: InsertProspectiveProperty): Promise<ProspectiveProperty> {
    const existing = await db.select().from(prospectiveProperties)
      .where(and(
        eq(prospectiveProperties.userId, data.userId),
        eq(prospectiveProperties.externalId, data.externalId)
      ))
      .limit(1);
    
    if (existing.length > 0) {
      return existing[0];
    }
    
    const [prop] = await db.insert(prospectiveProperties)
      .values(data as typeof prospectiveProperties.$inferInsert)
      .returning();
    return prop;
  }
  
  /** Remove a favorited property. Only the owning user can delete their own favorites. */
  async deleteProspectiveProperty(id: number, userId: number): Promise<void> {
    await db.delete(prospectiveProperties)
      .where(and(eq(prospectiveProperties.id, id), eq(prospectiveProperties.userId, userId)));
  }
  
  /** Update the user's notes on a favorited property (e.g., "Great location, needs renovation"). */
  async updateProspectivePropertyNotes(id: number, userId: number, notes: string): Promise<ProspectiveProperty | undefined> {
    const [prop] = await db.update(prospectiveProperties)
      .set({ notes })
      .where(and(eq(prospectiveProperties.id, id), eq(prospectiveProperties.userId, userId)))
      .returning();
    return prop || undefined;
  }

  // ── Saved Searches ──────────────────────────────────────────────

  /** Get all saved property search criteria for a user. */
  async getSavedSearches(userId: number): Promise<SavedSearch[]> {
    return await db.select().from(savedSearches)
      .where(eq(savedSearches.userId, userId))
      .orderBy(desc(savedSearches.savedAt));
  }

  /** Save a set of search criteria so the user can quickly re-run the search later. */
  async addSavedSearch(data: InsertSavedSearch): Promise<SavedSearch> {
    const [search] = await db.insert(savedSearches)
      .values(data as typeof savedSearches.$inferInsert)
      .returning();
    return search;
  }

  /** Delete a saved search. Only the owning user can delete their own searches. */
  async deleteSavedSearch(id: number, userId: number): Promise<void> {
    await db.delete(savedSearches)
      .where(and(eq(savedSearches.id, id), eq(savedSearches.userId, userId)));
  }
}
