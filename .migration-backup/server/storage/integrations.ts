import { db } from "../db";
import { externalIntegrations, type ExternalIntegration, type InsertExternalIntegration, type UpdateExternalIntegration } from "@shared/schema";
import { eq, asc } from "drizzle-orm";

export class IntegrationStorage {
  async getExternalIntegrations(kind?: string): Promise<ExternalIntegration[]> {
    if (kind) {
      return db.select().from(externalIntegrations).where(eq(externalIntegrations.kind, kind)).orderBy(asc(externalIntegrations.sortOrder));
    }
    return db.select().from(externalIntegrations).orderBy(asc(externalIntegrations.kind), asc(externalIntegrations.sortOrder));
  }

  async getExternalIntegration(id: number): Promise<ExternalIntegration | undefined> {
    const [row] = await db.select().from(externalIntegrations).where(eq(externalIntegrations.id, id));
    return row;
  }

  async createExternalIntegration(data: InsertExternalIntegration): Promise<ExternalIntegration> {
    const [row] = await db.insert(externalIntegrations).values(data).returning();
    return row;
  }

  async updateExternalIntegration(id: number, data: UpdateExternalIntegration): Promise<ExternalIntegration | undefined> {
    const [row] = await db.update(externalIntegrations).set(data).where(eq(externalIntegrations.id, id)).returning();
    return row;
  }

  async deleteExternalIntegration(id: number): Promise<void> {
    await db.delete(externalIntegrations).where(eq(externalIntegrations.id, id));
  }

  async toggleExternalIntegration(id: number, isEnabled: boolean): Promise<ExternalIntegration | undefined> {
    const [row] = await db.update(externalIntegrations).set({ isEnabled }).where(eq(externalIntegrations.id, id)).returning();
    return row;
  }

  async getIntegrationEnabledMap(): Promise<Record<string, boolean>> {
    const rows = await db.select({ serviceKey: externalIntegrations.serviceKey, isEnabled: externalIntegrations.isEnabled }).from(externalIntegrations);
    const map: Record<string, boolean> = {};
    for (const r of rows) {
      map[r.serviceKey] = r.isEnabled;
    }
    return map;
  }
}
