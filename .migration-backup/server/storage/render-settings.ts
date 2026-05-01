import { renderSettings, type RenderSetting, type InsertRenderSetting, type UpdateRenderSetting } from "@shared/schema";
import { db } from "../db";
import { eq, asc } from "drizzle-orm";

export class RenderSettingsStorage {
  async getAllRenderSettings(): Promise<RenderSetting[]> {
    return await db.select().from(renderSettings).orderBy(asc(renderSettings.styleKey));
  }

  async getRenderSetting(styleKey: string): Promise<RenderSetting | undefined> {
    const [setting] = await db.select().from(renderSettings)
      .where(eq(renderSettings.styleKey, styleKey));
    return setting || undefined;
  }

  async upsertRenderSetting(data: InsertRenderSetting): Promise<RenderSetting> {
    const existing = await this.getRenderSetting(data.styleKey);
    if (existing) {
      const [updated] = await db.update(renderSettings)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(renderSettings.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(renderSettings)
      .values(data as typeof renderSettings.$inferInsert)
      .returning();
    return created;
  }

  async updateRenderSetting(styleKey: string, data: UpdateRenderSetting): Promise<RenderSetting | undefined> {
    const [updated] = await db.update(renderSettings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(renderSettings.styleKey, styleKey))
      .returning();
    return updated || undefined;
  }

  async seedFromJson(configs: Record<string, {
    model: string;
    promptPrefix: string;
    promptSuffix: string;
    params: Record<string, unknown>;
    isImg2Img?: boolean;
    requiresSourceImage?: boolean;
    promptOptional?: boolean;
  }>): Promise<void> {
    for (const [styleKey, config] of Object.entries(configs)) {
      const existing = await this.getRenderSetting(styleKey);
      if (existing) continue;

      const label = styleKey
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");

      await db.insert(renderSettings)
        .values({
          styleKey,
          label,
          model: config.model,
          promptPrefix: config.promptPrefix,
          promptSuffix: config.promptSuffix,
          params: config.params,
          isImg2Img: config.isImg2Img ?? false,
          requiresSourceImage: config.requiresSourceImage ?? false,
          promptOptional: config.promptOptional ?? false,
          isEnabled: true,
          autoEnhanceEnabled: true,
          rateLimitPerMinute: 5,
          defaultImageSize: "1024x1024",
          defaultQuality: 95,
        } as typeof renderSettings.$inferInsert)
        .returning();
    }
  }
}
