import { designThemes, logos, assetDescriptions, researchQuestions, type DesignTheme, type InsertDesignTheme, type Logo, type InsertLogo, type AssetDescription, type ResearchQuestion, type InsertResearchQuestion } from "@shared/schema";
import { db } from "../db";
import { eq, desc } from "drizzle-orm";
import { stripAutoFields } from "./utils";

export class AdminStorage {
  // ── Design Themes ──────────────────────────────────────────────

  /** List all design themes, ordered by creation date. */
  async getAllDesignThemes(): Promise<DesignTheme[]> {
    return await db.select().from(designThemes).orderBy(designThemes.createdAt);
  }

  /** Fetch a single theme by ID. Used when resolving a user's selected theme. */
  async getDesignTheme(id: number): Promise<DesignTheme | undefined> {
    const [theme] = await db.select().from(designThemes).where(eq(designThemes.id, id));
    return theme || undefined;
  }

  /** Get the theme marked as isDefault=true. Fallback when no user/group preference exists. */
  async getDefaultDesignTheme(): Promise<DesignTheme | undefined> {
    const [theme] = await db.select().from(designThemes).where(eq(designThemes.isDefault, true));
    return theme || undefined;
  }

  /** Create a new color theme with a name, description, and array of named colors. */
  async createDesignTheme(data: InsertDesignTheme): Promise<DesignTheme> {
    const [theme] = await db
      .insert(designThemes)
      .values({
        name: data.name,
        description: data.description,
        colors: data.colors,
        iconSet: "lucide",
        isDefault: data.isDefault || false,
      })
      .returning();
    return theme;
  }

  /** Update a theme's name, description, colors, or isDefault status. */
  async updateDesignTheme(id: number, data: Partial<InsertDesignTheme> & { isDefault?: boolean }): Promise<DesignTheme | undefined> {
    if (data.isDefault === true) {
      await db.update(designThemes).set({ isDefault: false }).where(eq(designThemes.isDefault, true));
    }
    const [theme] = await db
      .update(designThemes)
      .set({ ...stripAutoFields(data as Record<string, unknown>), updatedAt: new Date() })
      .where(eq(designThemes.id, id))
      .returning();
    return theme || undefined;
  }

  /** Delete a theme. System themes and the default theme are protected. */
  async deleteDesignTheme(id: number): Promise<void> {
    const [theme] = await db.select().from(designThemes).where(eq(designThemes.id, id));
    if (theme?.isSystem) throw new Error("System themes cannot be deleted");
    if (theme?.isDefault) throw new Error("Cannot delete the default theme — please set another theme as default first");
    await db.delete(designThemes).where(eq(designThemes.id, id));
  }

  // ── Logos ──────────────────────────────────────────────────

  /** List all uploaded logos, ordered by creation date. */
  async getAllLogos(): Promise<Logo[]> {
    return await db.select().from(logos).orderBy(logos.createdAt);
  }

  /** Fetch a logo by ID. Used when resolving a user group's assigned logo. */
  async getLogo(id: number): Promise<Logo | undefined> {
    const [logo] = await db.select().from(logos).where(eq(logos.id, id));
    return logo || undefined;
  }

  /** Get the logo marked as isDefault=true. Fallback when no group-specific logo exists. */
  async getDefaultLogo(): Promise<Logo | undefined> {
    const [logo] = await db.select().from(logos).where(eq(logos.isDefault, true));
    return logo || undefined;
  }

  /** Register a new logo (name, company name, and object storage URL). */
  async createLogo(data: InsertLogo): Promise<Logo> {
    const [logo] = await db.insert(logos).values(data).returning();
    return logo;
  }

  async setDefaultLogo(id: number): Promise<void> {
    const [target] = await db.select({ id: logos.id }).from(logos).where(eq(logos.id, id));
    if (!target) throw new Error("Logo not found");
    await db.update(logos).set({ isDefault: false }).where(eq(logos.isDefault, true));
    await db.update(logos).set({ isDefault: true }).where(eq(logos.id, id));
  }

  async getAppLogo(): Promise<Logo | undefined> {
    const [logo] = await db.select().from(logos).where(eq(logos.isAppLogo, true));
    return logo || undefined;
  }

  async setAppLogo(id: number): Promise<void> {
    const [target] = await db.select({ id: logos.id }).from(logos).where(eq(logos.id, id));
    if (!target) throw new Error("Logo not found");
    await db.update(logos).set({ isAppLogo: false }).where(eq(logos.isAppLogo, true));
    await db.update(logos).set({ isAppLogo: true }).where(eq(logos.id, id));
  }

  /** Remove a logo. The default logo is protected by the route handler, not here. */
  async deleteLogo(id: number): Promise<void> {
    await db.delete(logos).where(eq(logos.id, id));
  }

  // ── Property Descriptions ──────────────────────────────────────

  /** List all asset descriptions, ordered by creation date. */
  async getAllAssetDescriptions(): Promise<AssetDescription[]> {
    return await db.select().from(assetDescriptions).orderBy(assetDescriptions.createdAt);
  }

  // ── Research Questions ──────────────────────────────────────

  /** Get all admin-configured research questions, sorted by display order. */
  async getAllResearchQuestions(): Promise<ResearchQuestion[]> {
    return db.select().from(researchQuestions).orderBy(researchQuestions.sortOrder, researchQuestions.id);
  }

  /** Create a new research question. Auto-assigns the next sort order if not provided. */
  async createResearchQuestion(data: InsertResearchQuestion): Promise<ResearchQuestion> {
    const maxOrder = await db.select().from(researchQuestions).orderBy(desc(researchQuestions.sortOrder)).limit(1);
    const nextOrder = (maxOrder[0]?.sortOrder ?? -1) + 1;
    const [q] = await db.insert(researchQuestions).values({
      question: data.question,
      sortOrder: data.sortOrder ?? nextOrder,
    }).returning();
    return q;
  }

  /** Update the text of an existing research question. */
  async updateResearchQuestion(id: number, question: string): Promise<ResearchQuestion | undefined> {
    const [q] = await db.update(researchQuestions).set({ question }).where(eq(researchQuestions.id, id)).returning();
    return q;
  }

  /** Delete a research question. Subsequent AI prompts will no longer include it. */
  async deleteResearchQuestion(id: number): Promise<void> {
    await db.delete(researchQuestions).where(eq(researchQuestions.id, id));
  }

}
