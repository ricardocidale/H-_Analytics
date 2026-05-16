import { db } from "../db";
import { portfolios, properties } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import type { Portfolio, InsertPortfolio, Property } from "@workspace/db";

export class PortfolioStorage {
  async getPortfolios(userId: number): Promise<Portfolio[]> {
    return db.select().from(portfolios).where(eq(portfolios.userId, userId));
  }

  async getPortfolio(id: number, userId: number): Promise<Portfolio | undefined> {
    const rows = await db.select().from(portfolios)
      .where(and(eq(portfolios.id, id), eq(portfolios.userId, userId)));
    return rows[0];
  }

  async createPortfolio(data: InsertPortfolio): Promise<Portfolio> {
    const rows = await db.insert(portfolios).values(data).returning();
    return rows[0];
  }

  async updatePortfolio(
    id: number,
    userId: number,
    data: Partial<Pick<Portfolio, "name" | "description">>,
  ): Promise<Portfolio | undefined> {
    const rows = await db.update(portfolios)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(portfolios.id, id), eq(portfolios.userId, userId)))
      .returning();
    return rows[0];
  }

  async deletePortfolio(id: number, userId: number): Promise<void> {
    await db.delete(portfolios)
      .where(and(eq(portfolios.id, id), eq(portfolios.userId, userId)));
  }

  async getPortfolioProperties(portfolioId: number, userId: number): Promise<Property[]> {
    return db.select().from(properties)
      .where(and(
        eq(properties.portfolioId, portfolioId),
        eq(properties.userId, userId),
      ));
  }
}
