import type { Express } from "express";
import { storage } from "../storage";
import { 
  requireAuth, 
  isRateLimited, 
  sanitizeEmail, 
  verifyPassword, 
  recordLoginAttempt, 
  generateSessionId, 
  getSessionExpiryDate, 
  setSessionCookie, 
  clearSessionCookie,
  hashPassword,
  getAuthUser
} from "../auth";
import { loginSchema, adminLoginSchema, userResponse, logAndSendError, zodErrorMessage } from "./helpers";
import { ensureDefaultScenario } from "./scenario-helpers";
import { z } from "zod";
import { isAdminRole } from "@shared/constants";
import seedUsersConfig from "../seed-users.json" with { type: "json" };
import { isPublishedDeployment } from "../providers/config";
import {
  HTTP_400_BAD_REQUEST,
  HTTP_401_UNAUTHORIZED,
  HTTP_403_FORBIDDEN,
  HTTP_404_NOT_FOUND,
  HTTP_429_TOO_MANY_REQUESTS,
  VARCHAR_SHORT_MAX,
} from "../constants";

export function register(app: Express) {
  // ────────────────────────────────────────────────────────────
  // AUTHENTICATION ROUTES
  // Login: validates credentials → creates session → sets HTTP-only cookie
  // Logout: deletes session + clears cookie
  // GET /api/me: returns the currently authenticated user (session-based)
  // Rate-limiting: IP-based throttle on failed login attempts
  // ────────────────────────────────────────────────────────────

  async function handleCredentialLogin(email: string, password: string, clientIp: string, res: import("express").Response) {
    if (isRateLimited(clientIp)) {
      return res.status(HTTP_429_TOO_MANY_REQUESTS).json({ error: "Too many login attempts. Please try again in 15 minutes." });
    }

    const user = await storage.getUserByEmail(sanitizeEmail(email));
    if (!user) {
      recordLoginAttempt(clientIp, false);
      return res.status(HTTP_401_UNAUTHORIZED).json({ error: "Invalid credentials" });
    }

    if (!user.passwordHash) {
      recordLoginAttempt(clientIp, false);
      return res.status(HTTP_401_UNAUTHORIZED).json({ error: "Please sign in with Google" });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      recordLoginAttempt(clientIp, false);
      return res.status(HTTP_401_UNAUTHORIZED).json({ error: "Invalid credentials" });
    }

    recordLoginAttempt(clientIp, true);
    const sessionId = generateSessionId();
    const expiresAt = getSessionExpiryDate();
    await storage.createSession(user.id, sessionId, expiresAt);
    await storage.createLoginLog(user.id, sessionId, clientIp);
    ensureDefaultScenario(user.id).catch(() => { /* ignore: default scenario seeding is non-blocking */ });
    setSessionCookie(res, sessionId);
    res.json({ user: userResponse(user) });
  }

  app.post("/api/auth/login", async (req, res) => {
    try {
      const validation = loginSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid request" });
      }
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      await handleCredentialLogin(validation.data.email, validation.data.password, clientIp, res);
    } catch (error: unknown) {
      logAndSendError(res, "Login failed", error);
    }
  });

  app.post("/api/auth/admin-login", async (req, res) => {
    try {
      const adminSeed = seedUsersConfig.users.find(u => isAdminRole(u.role));
      if (!adminSeed) {
        return res.status(HTTP_401_UNAUTHORIZED).json({ error: "No admin user configured" });
      }
      const validation = adminLoginSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(HTTP_401_UNAUTHORIZED).json({ error: "Password required" });
      }
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      await handleCredentialLogin(adminSeed.email, validation.data.password, clientIp, res);
    } catch (error: unknown) {
      logAndSendError(res, "Admin login failed", error);
    }
  });

  // Public — no auth required. Tells the login page whether the
  // logo quick-login affordance should be wired up. Mirrors the gate on
  // the dev-login route below so the client and server stay in sync
  // regardless of how the web bundle was built.
  app.get("/api/public/dev-login-available", (_req, res) => {
    res.json({ available: !isPublishedDeployment() });
  });

  app.post("/api/auth/dev-login", async (req, res) => {
    try {
      // Gate on REPLIT_DEPLOYMENT (set only on published deployments) rather
      // than NODE_ENV, because the dev preview can serve a built bundle with
      // NODE_ENV=production. The published deployment is the only place this
      // route must be unreachable.
      if (isPublishedDeployment()) {
        return res.status(HTTP_403_FORBIDDEN).json({ error: "Dev login disabled in production" });
      }
      // Pin the dev-login target to the first super_admin entry (Ricardo).
      // Using `super_admin` rather than the broader `isAdminRole` keeps this
      // deterministic even if other admin-tier users are added later.
      const adminSeed = seedUsersConfig.users.find(u => u.role === "super_admin");
      if (!adminSeed) {
        return res.status(HTTP_401_UNAUTHORIZED).json({ error: "No super_admin user configured in seed-users.json" });
      }
      const user = await storage.getUserByEmail(adminSeed.email);
      if (!user) {
        return res.status(HTTP_401_UNAUTHORIZED).json({ error: `Super admin user ${adminSeed.email} not found in DB — run seeds` });
      }
      if (!user.passwordHash) {
        return res.status(HTTP_401_UNAUTHORIZED).json({ error: `Super admin ${adminSeed.email} has no password hash — sign in with Google or seed a password` });
      }
      const adminPassword = process.env[adminSeed.envVar] || process.env.PASSWORD_DEFAULT;
      if (!adminPassword) {
        return res.status(HTTP_401_UNAUTHORIZED).json({ error: `Admin password env var ${adminSeed.envVar} (or PASSWORD_DEFAULT) is not set` });
      }
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      await handleCredentialLogin(adminSeed.email, adminPassword, clientIp, res);
    } catch (error: unknown) {
      logAndSendError(res, "Dev login failed", error);
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    try {
      if (req.sessionId) {
        await storage.updateLogoutTime(req.sessionId);
        await storage.deleteSession(req.sessionId);
      }
      clearSessionCookie(res);
      res.setHeader("Cache-Control", "no-store");
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Logout failed", error);
    }
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    const u = getAuthUser(req);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      user: userResponse(u)
    });
  });

  // ────────────────────────────────────────────────────────────
  // USER PROFILE ROUTES
  // Self-service endpoints: any authenticated user can update their own profile,
  // change their password, or select a design theme. No admin privileges needed.
  // ────────────────────────────────────────────────────────────
  
  const updateProfileSchema = z.object({
    firstName: z.string().max(50).optional(),
    lastName: z.string().max(50).optional(),
    email: z.string().email().max(VARCHAR_SHORT_MAX).optional(),
    company: z.string().max(100).optional(),
    title: z.string().max(100).optional(),
    rebeccaOptOut: z.boolean().optional(),
    rebeccaRailOpen: z.boolean().optional(),
  });

  app.patch("/api/profile", requireAuth, async (req, res) => {
    try {
      const validation = updateProfileSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(validation.error) });
      }
      
      const updates: { firstName?: string; lastName?: string; email?: string; company?: string; title?: string; rebeccaOptOut?: boolean; rebeccaRailOpen?: boolean } = {};
      if (validation.data.firstName !== undefined) updates.firstName = validation.data.firstName.trim();
      if (validation.data.lastName !== undefined) updates.lastName = validation.data.lastName.trim();
      if (validation.data.rebeccaOptOut !== undefined) updates.rebeccaOptOut = validation.data.rebeccaOptOut;
      if (validation.data.rebeccaRailOpen !== undefined) updates.rebeccaRailOpen = validation.data.rebeccaRailOpen;
      if (validation.data.email !== undefined) {
        const protectedEmails = seedUsersConfig.users
          .filter(u => isAdminRole(u.role))
          .map(u => u.email.toLowerCase());
        if (protectedEmails.includes(getAuthUser(req).email.toLowerCase())) {
          return res.status(HTTP_403_FORBIDDEN).json({ error: "System account emails cannot be changed" });
        }
        const newEmail = sanitizeEmail(validation.data.email);
        if (newEmail !== getAuthUser(req).email) {
          const existingUser = await storage.getUserByEmail(newEmail);
          if (existingUser && existingUser.id !== getAuthUser(req).id) {
            return res.status(HTTP_400_BAD_REQUEST).json({ error: "Email already in use" });
          }
          updates.email = newEmail;
        }
      }
      if (validation.data.company !== undefined) updates.company = validation.data.company.trim();
      if (validation.data.title !== undefined) updates.title = validation.data.title.trim();
      
      const user = await storage.updateUserProfile(getAuthUser(req).id, updates);
      res.json(userResponse(user));
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update profile", error);
    }
  });

  const changePasswordSchema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "Password must contain uppercase, lowercase, and number"),
  });

  app.patch("/api/profile/password", requireAuth, async (req, res) => {
    try {
      const validation = changePasswordSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(validation.error) });
      }

      const user = await storage.getUserById(getAuthUser(req).id);
      if (!user) {
        return res.status(HTTP_404_NOT_FOUND).json({ error: "User not found" });
      }

      if (!user.passwordHash) {
        return res.status(HTTP_401_UNAUTHORIZED).json({ error: "Your account uses Google sign-in and does not have a password set" });
      }

      const validPassword = await verifyPassword(validation.data.currentPassword, user.passwordHash);
      if (!validPassword) {
        return res.status(HTTP_401_UNAUTHORIZED).json({ error: "Current password is incorrect" });
      }

      const newPasswordHash = await hashPassword(validation.data.newPassword);
      await storage.updateUserPassword(getAuthUser(req).id, newPasswordHash);
      
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to change password", error);
    }
  });

  app.patch("/api/profile/tour-prompt", requireAuth, async (req, res) => {
    try {
      const schema = z.object({ hide: z.boolean() });
      const validation = schema.safeParse(req.body);
      if (!validation.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(validation.error) });
      }
      await storage.updateUserHideTourPrompt(getAuthUser(req).id, validation.data.hide);
      res.json({ hideTourPrompt: validation.data.hide });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update preference", error);
    }
  });

  app.patch("/api/profile/appearance", requireAuth, async (req, res) => {
    try {
      const schema = z.object({
        colorMode: z.enum(["light", "auto", "dark"]).nullable().optional(),
        bgAnimation: z.enum(["enabled", "auto", "disabled"]).nullable().optional(),
        fontPreference: z.enum(["default", "sans", "system", "dyslexic"]).nullable().optional(),
      });
      const validation = schema.safeParse(req.body);
      if (!validation.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(validation.error) });
      }
      const user = await storage.updateUserAppearance(getAuthUser(req).id, {
        colorMode: validation.data.colorMode,
        bgAnimation: validation.data.bgAnimation,
        fontPreference: validation.data.fontPreference,
      });
      res.json({ colorMode: user.colorMode, bgAnimation: user.bgAnimation, fontPreference: user.fontPreference });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update appearance preferences", error);
    }
  });

  app.patch("/api/profile/theme", requireAuth, async (req, res) => {
    try {
      const schema = z.object({ themeId: z.number().nullable() });
      const validation = schema.safeParse(req.body);
      if (!validation.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(validation.error) });
      }
      if (validation.data.themeId !== null) {
        const theme = await storage.getDesignTheme(validation.data.themeId);
        if (!theme) {
          return res.status(HTTP_404_NOT_FOUND).json({ error: "Theme not found" });
        }
      }
      const user = await storage.updateUserSelectedTheme(getAuthUser(req).id, validation.data.themeId);
      res.json({ selectedThemeId: user.selectedThemeId });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update theme preference", error);
    }
  });
}
