import { users, sessions, userDefaultProperties, type User, type InsertUser, type Session } from "@shared/schema";
import { db } from "../db";
import { eq, and, gt, lt } from "drizzle-orm";
import { stripAutoFields } from "./utils";
import { encryptToken, decryptToken } from "../lib/token-encryption";

export class UserStorage {
  /** Look up a user by their numeric ID. Returns undefined if not found. */
  async getUserById(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  /** Look up a user by email (case-insensitive). Used during login. */
  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    return user || undefined;
  }

  /** Look up a user by phone number. */
  async getUserByPhoneNumber(phoneNumber: string): Promise<User | undefined> {
    const normalized = phoneNumber.replace(/[^\d+]/g, '');
    const [user] = await db.select().from(users).where(eq(users.phoneNumber, normalized));
    return user || undefined;
  }

  /** Create a new user. Email is always lowercased for case-insensitive lookup. */
  async createUser(data: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        email: data.email.toLowerCase(),
        passwordHash: data.passwordHash,
        role: data.role,
        firstName: data.firstName,
        lastName: data.lastName,
        company: data.company,
        title: data.title,
      })
      .returning();
    return user;
  }

  /** List all users, ordered by creation date. Used by the admin user management panel. */
  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(users.createdAt);
  }

  /**
   * Update a user's password hash and immediately invalidate all their sessions
   * so they must re-authenticate with the new password.
   */
  async updateUserPassword(id: number, passwordHash: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, id));
      await tx.delete(sessions).where(eq(sessions.userId, id));
    });
  }

  async updateUserProfile(id: number, data: { firstName?: string; lastName?: string; email?: string; company?: string; title?: string; canManageScenarios?: boolean }): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ ...stripAutoFields(data as Record<string, unknown>), updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  /** Set the user's preferred color theme. Pass null to revert to the group/default theme. */
  async updateUserSelectedTheme(id: number, themeId: number | null): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ selectedThemeId: themeId, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserAppearance(id: number, prefs: { colorMode?: string | null; bgAnimation?: string | null; fontPreference?: string | null }): Promise<User> {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (prefs.colorMode !== undefined) updates.colorMode = prefs.colorMode;
    if (prefs.bgAnimation !== undefined) updates.bgAnimation = prefs.bgAnimation;
    if (prefs.fontPreference !== undefined) updates.fontPreference = prefs.fontPreference;
    const [user] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return user;
  }

  async updateUserHideTourPrompt(id: number, hide: boolean): Promise<void> {
    await db.update(users).set({ hideTourPrompt: hide, updatedAt: new Date() }).where(eq(users.id, id));
  }

  /** Change a user's role (admin, user, checker, investor). Admin-only operation. */
  async updateUserRole(id: number, role: string): Promise<void> {
    await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, id));
  }

  async updateUserGoogleId(id: number, googleId: string): Promise<void> {
    await db.update(users).set({ googleId, updatedAt: new Date() }).where(eq(users.id, id));
  }

  async updateUserGoogleTokens(id: number, data: {
    googleAccessToken: string;
    googleRefreshToken?: string;
    googleTokenExpiry?: Date;
  }): Promise<void> {
    const updates: Record<string, unknown> = {
      googleAccessToken: encryptToken(data.googleAccessToken),
      updatedAt: new Date(),
    };
    if (data.googleRefreshToken !== undefined) updates.googleRefreshToken = encryptToken(data.googleRefreshToken);
    if (data.googleTokenExpiry !== undefined) updates.googleTokenExpiry = data.googleTokenExpiry;
    await db.update(users).set(updates).where(eq(users.id, id));
  }

  async getDecryptedGoogleTokens(id: number): Promise<{
    accessToken: string | null;
    refreshToken: string | null;
    tokenExpiry: Date | null;
  }> {
    const user = await this.getUserById(id);
    if (!user) return { accessToken: null, refreshToken: null, tokenExpiry: null };
    return {
      accessToken: user.googleAccessToken ? decryptToken(user.googleAccessToken) : null,
      refreshToken: user.googleRefreshToken ? decryptToken(user.googleRefreshToken) : null,
      tokenExpiry: user.googleTokenExpiry,
    };
  }

  // Sessions
  /** Create a new login session (called after successful authentication). */
  async createSession(userId: number, sessionId: string, expiresAt: Date): Promise<Session> {
    const [session] = await db
      .insert(sessions)
      .values({ id: sessionId, userId, expiresAt })
      .returning();
    return session;
  }

  /**
   * Validate a session cookie: find the session, verify it hasn't expired,
   * and return it joined with the user record. This runs on every authenticated request.
   */
  async getSession(sessionId: string): Promise<(Session & { user: User }) | undefined> {
    const [result] = await db
      .select({
        sessions: {
          id: sessions.id,
          userId: sessions.userId,
          expiresAt: sessions.expiresAt,
          createdAt: sessions.createdAt,
        },
        users: {
          id: users.id,
          email: users.email,
          passwordHash: users.passwordHash,
          role: users.role,
          firstName: users.firstName,
          lastName: users.lastName,
          company: users.company,
          title: users.title,
          selectedThemeId: users.selectedThemeId,
          phoneNumber: users.phoneNumber,
          googleId: users.googleId,
          googleAccessToken: users.googleAccessToken,
          googleRefreshToken: users.googleRefreshToken,
          googleTokenExpiry: users.googleTokenExpiry,
          hideTourPrompt: users.hideTourPrompt,
          canManageScenarios: users.canManageScenarios,
          colorMode: users.colorMode,
          bgAnimation: users.bgAnimation,
          fontPreference: users.fontPreference,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        },
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())));
    
    if (!result) return undefined;
    return { ...result.sessions, user: result.users };
  }

  /** Delete a single session (user-initiated logout). */
  async deleteSession(sessionId: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
  }

  /** Bulk-delete expired sessions. Called hourly by the cleanup interval in server/index.ts. */
  async deleteExpiredSessions(): Promise<number> {
    const result = await db.delete(sessions).where(lt(sessions.expiresAt, new Date())).returning();
    return result.length;
  }

  async getUserDefaultPropertyIds(userId: number): Promise<number[]> {
    const rows = await db.select().from(userDefaultProperties)
      .where(and(eq(userDefaultProperties.userId, userId), eq(userDefaultProperties.isActive, true)));
    return rows.map(r => r.propertyId);
  }

  async setUserDefaultPropertyIds(userId: number, propertyIds: number[]): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(userDefaultProperties).where(eq(userDefaultProperties.userId, userId));
      if (propertyIds.length > 0) {
        await tx.insert(userDefaultProperties).values(
          propertyIds.map(pid => ({ userId, propertyId: pid, isActive: true }))
        );
      }
    });
  }
}
