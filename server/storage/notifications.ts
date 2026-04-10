import { db } from "../db";
import { alertRules, notificationLogs, notificationPreferences, notificationSettings } from "@shared/schema";
import type { AlertRule, InsertAlertRule, InsertNotificationLog, NotificationLog, NotificationPreference, NotificationSetting } from "@shared/schema";
import { eq, desc, and, or } from "drizzle-orm";

export class NotificationStorage {
  async getAllAlertRules(): Promise<AlertRule[]> {
    return db.select().from(alertRules).orderBy(desc(alertRules.createdAt));
  }

  async getActiveAlertRulesForProperty(propertyId: number): Promise<AlertRule[]> {
    return db.select().from(alertRules).where(
      and(
        eq(alertRules.isActive, true),
        or(
          eq(alertRules.scope, "all"),
          eq(alertRules.scope, "portfolio"),
          and(eq(alertRules.scope, "specific"), eq(alertRules.propertyId, propertyId))
        )
      )
    );
  }

  async createAlertRule(data: InsertAlertRule): Promise<AlertRule> {
    const [rule] = await db.insert(alertRules).values(data).returning();
    return rule;
  }

  async updateAlertRule(id: number, data: Partial<InsertAlertRule & { lastTriggeredAt: Date | null }>): Promise<AlertRule | undefined> {
    const [rule] = await db.update(alertRules).set({ ...data, updatedAt: new Date() }).where(eq(alertRules.id, id)).returning();
    return rule;
  }

  async deleteAlertRule(id: number): Promise<void> {
    await db.delete(alertRules).where(eq(alertRules.id, id));
  }

  async getNotificationLogs(limit = 100): Promise<NotificationLog[]> {
    return db.select().from(notificationLogs).orderBy(desc(notificationLogs.createdAt)).limit(limit);
  }

  async createNotificationLog(data: InsertNotificationLog): Promise<NotificationLog> {
    const [log] = await db.insert(notificationLogs).values(data).returning();
    return log;
  }

  async getNotificationPreferences(userId: number): Promise<NotificationPreference[]> {
    return db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId));
  }

  async upsertNotificationPreference(userId: number, eventType: string, channel: string, enabled: boolean): Promise<void> {
    const existing = await db.select().from(notificationPreferences).where(
      and(
        eq(notificationPreferences.userId, userId),
        eq(notificationPreferences.eventType, eventType),
        eq(notificationPreferences.channel, channel)
      )
    ).limit(1);

    if (existing.length > 0) {
      await db.update(notificationPreferences).set({ enabled }).where(eq(notificationPreferences.id, existing[0].id));
    } else {
      await db.insert(notificationPreferences).values({ userId, eventType, channel, enabled });
    }
  }

  async getNotificationSetting(key: string): Promise<string | null> {
    const [row] = await db.select().from(notificationSettings).where(eq(notificationSettings.settingKey, key)).limit(1);
    return row?.settingValue ?? null;
  }

  async setNotificationSetting(key: string, value: string | null): Promise<void> {
    const [existing] = await db.select().from(notificationSettings).where(eq(notificationSettings.settingKey, key)).limit(1);
    if (existing) {
      await db.update(notificationSettings).set({ settingValue: value, updatedAt: new Date() }).where(eq(notificationSettings.id, existing.id));
    } else {
      await db.insert(notificationSettings).values({ settingKey: key, settingValue: value });
    }
  }

  async getAllNotificationSettings(): Promise<NotificationSetting[]> {
    return db.select().from(notificationSettings);
  }
}
