import { activityLogs, verificationRuns, loginLogs, users, sessions, type ActivityLog, type InsertActivityLog, type VerificationRun, type InsertVerificationRun, type LoginLog, type User, type Session } from "@shared/schema";
import { db } from "../db";
import { eq, desc, gte, lte, and, lt, gt, count, inArray, type SQL } from "drizzle-orm";

/** Filters for querying activity logs (admin panel). */
export interface ActivityLogFilters {
  userId?: number;
  entityType?: string;
  actions?: string[];
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export class ActivityStorage {
  // ── Activity Logs (Audit Trail) ──────────────────────────────

  /** Insert a new activity log entry for user action tracking. */
  async createActivityLog(data: InsertActivityLog): Promise<ActivityLog> {
    const [log] = await db
      .insert(activityLogs)
      .values(data as typeof activityLogs.$inferInsert)
      .returning();
    return log;
  }

  /**
   * Query activity logs with optional filters (user, entity type, date range)
   * and pagination. Returns logs joined with user info for display in admin panel.
   */
  async getActivityLogs(filters: ActivityLogFilters): Promise<(ActivityLog & { user: User })[]> {
    const conditions: SQL[] = [];
    if (filters.userId) conditions.push(eq(activityLogs.userId, filters.userId));
    if (filters.entityType) conditions.push(eq(activityLogs.entityType, filters.entityType));
    if (filters.actions?.length) conditions.push(inArray(activityLogs.action, filters.actions));
    if (filters.from) conditions.push(gte(activityLogs.createdAt, filters.from));
    if (filters.to) conditions.push(lte(activityLogs.createdAt, filters.to));

    const query = db
      .select()
      .from(activityLogs)
      .innerJoin(users, eq(activityLogs.userId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(activityLogs.createdAt))
      .limit(filters.limit ?? 50)
      .offset(filters.offset ?? 0);

    const results = await query;
    return results.map(r => ({ ...r.activity_logs, user: r.users }));
  }



  // ── Verification Runs (Financial Audit History) ──────────────

  /** Persist a verification run result for historical tracking and compliance. */
  async createVerificationRun(data: InsertVerificationRun): Promise<VerificationRun> {
    const [run] = await db
      .insert(verificationRuns)
      .values(data as typeof verificationRuns.$inferInsert)
      .returning();

    const [{ total }] = await db
      .select({ total: count() })
      .from(verificationRuns);
    if (total > 50) {
      const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      await db.delete(verificationRuns).where(lt(verificationRuns.createdAt, cutoff));
    }
    return run;
  }

  /**
   * List recent verification runs for the admin panel. Excludes the `results`
   * field (which can be megabytes of JSON) to keep list queries fast.
   */
  async getVerificationRuns(limit = 20): Promise<Omit<VerificationRun, 'results'>[]> {
    const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        id: verificationRuns.id,
        userId: verificationRuns.userId,
        totalChecks: verificationRuns.totalChecks,
        passed: verificationRuns.passed,
        failed: verificationRuns.failed,
        auditOpinion: verificationRuns.auditOpinion,
        overallStatus: verificationRuns.overallStatus,
        createdAt: verificationRuns.createdAt,
      })
      .from(verificationRuns)
      .where(gte(verificationRuns.createdAt, cutoff))
      .orderBy(desc(verificationRuns.createdAt))
      .limit(limit);
    return rows;
  }

  /** Fetch a single verification run with the full results JSON (can be large). */
  async getVerificationRun(id: number): Promise<VerificationRun | undefined> {
    const [run] = await db.select().from(verificationRuns).where(eq(verificationRuns.id, id));
    return run || undefined;
  }

  // ── Login Logs ──────────────────────────────────────────────

  async createLoginLog(userId: number, sessionId: string, ipAddress?: string): Promise<LoginLog> {
    const [log] = await db
      .insert(loginLogs)
      .values({ userId, sessionId, ipAddress })
      .returning();
    return log;
  }
  
  /** Stamp the logout time on a login log entry. Called when the user logs out. */
  async updateLogoutTime(sessionId: string): Promise<void> {
    await db
      .update(loginLogs)
      .set({ logoutAt: new Date() })
      .where(eq(loginLogs.sessionId, sessionId));
  }
  
  /** Fetch recent login history (last 90 days) with user info, for the admin panel. */
  async getLoginLogs(limit = 500): Promise<(LoginLog & { user: User })[]> {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    
    const results = await db
      .select()
      .from(loginLogs)
      .innerJoin(users, eq(loginLogs.userId, users.id))
      .where(gte(loginLogs.loginAt, ninetyDaysAgo))
      .orderBy(desc(loginLogs.loginAt))
      .limit(limit);
    return results.map(r => ({ ...r.login_logs, user: r.users }));
  }

  /** Delete login logs older than the given number of days. Returns count of deleted rows. */
  async deleteOldLoginLogs(retentionDays = 180): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);
    const [{ deleted }] = await db.select({ deleted: count() }).from(loginLogs).where(lt(loginLogs.loginAt, cutoff));
    if (deleted > 0) {
      await db.delete(loginLogs).where(lt(loginLogs.loginAt, cutoff));
    }
    return deleted;
  }

  // ── Active Sessions (Admin Session Management) ──────────────

  /** List all currently valid (non-expired) sessions with user info. Admin panel uses this. */
  async getActiveSessions(limit = 200): Promise<(Session & { user: User })[]> {
    const results = await db
      .select()
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(gt(sessions.expiresAt, new Date()))
      .orderBy(desc(sessions.createdAt))
      .limit(limit);
    return results.map(r => ({ ...r.sessions, user: r.users }));
  }

  /** Admin force-logout: terminate a specific session, immediately logging the user out. */
  async forceDeleteSession(sessionId: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
  }
}
