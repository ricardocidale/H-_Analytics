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
import { loginSchema, adminLoginSchema, userResponse, fullName, logAndSendError } from "./helpers";
import { ensureDefaultScenario } from "./scenario-helpers";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { UserRole } from "@shared/constants";
import seedUsersConfig from "../seed-users.json" with { type: "json" };

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
      return res.status(429).json({ error: "Too many login attempts. Please try again in 15 minutes." });
    }

    const user = await storage.getUserByEmail(sanitizeEmail(email));
    if (!user) {
      recordLoginAttempt(clientIp, false);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (!user.passwordHash) {
      recordLoginAttempt(clientIp, false);
      return res.status(401).json({ error: "Please sign in with Google" });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      recordLoginAttempt(clientIp, false);
      return res.status(401).json({ error: "Invalid credentials" });
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
        return res.status(400).json({ error: "Invalid request" });
      }
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      await handleCredentialLogin(validation.data.email, validation.data.password, clientIp, res);
    } catch (error: unknown) {
      logAndSendError(res, "Login failed", error);
    }
  });

  app.post("/api/auth/admin-login", async (req, res) => {
    try {
      const adminSeed = seedUsersConfig.users.find(u => u.role === UserRole.ADMIN);
      if (!adminSeed) {
        return res.status(401).json({ error: "No admin user configured" });
      }
      const validation = adminLoginSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(401).json({ error: "Password required" });
      }
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      await handleCredentialLogin(adminSeed.email, validation.data.password, clientIp, res);
    } catch (error: unknown) {
      logAndSendError(res, "Admin login failed", error);
    }
  });

  app.post("/api/auth/dev-login", async (req, res) => {
    try {
      if (process.env.NODE_ENV === "production") {
        return res.status(403).json({ error: "Dev login disabled in production" });
      }
      const adminSeed = seedUsersConfig.users.find(u => u.role === UserRole.ADMIN);
      if (!adminSeed) {
        return res.status(401).json({ error: "No admin user configured" });
      }
      const user = await storage.getUserByEmail(adminSeed.email);
      if (!user) {
        return res.status(401).json({ error: "Admin user not found" });
      }
      if (!user.passwordHash) {
        return res.status(401).json({ error: "Please sign in with Google" });
      }
      const adminPassword = process.env[adminSeed.envVar] || process.env.PASSWORD_DEFAULT;
      if (!adminPassword) {
        return res.status(401).json({ error: "Admin password not configured in env" });
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
      res.json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Logout failed", error);
    }
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    const u = getAuthUser(req);
    let companyName: string | null = null;
    if (u.companyId) {
      const comp = await storage.getCompany(u.companyId);
      if (comp) companyName = comp.name;
    }
    res.json({
      user: userResponse(u, { companyName })
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
    email: z.string().email().max(255).optional(),
    company: z.string().max(100).optional(),
    title: z.string().max(100).optional(),
  });

  app.patch("/api/profile", requireAuth, async (req, res) => {
    try {
      const validation = updateProfileSchema.safeParse(req.body);
      if (!validation.success) {
        const error = fromZodError(validation.error);
        return res.status(400).json({ error: error.message });
      }
      
      const updates: { firstName?: string; lastName?: string; email?: string; company?: string; title?: string } = {};
      if (validation.data.firstName !== undefined) updates.firstName = validation.data.firstName.trim();
      if (validation.data.lastName !== undefined) updates.lastName = validation.data.lastName.trim();
      if (validation.data.email !== undefined) {
        const protectedEmails = seedUsersConfig.users
          .filter(u => u.role === UserRole.ADMIN || u.role === UserRole.CHECKER)
          .map(u => u.email.toLowerCase());
        if (protectedEmails.includes(getAuthUser(req).email.toLowerCase())) {
          return res.status(403).json({ error: "System account emails cannot be changed" });
        }
        const newEmail = sanitizeEmail(validation.data.email);
        if (newEmail !== getAuthUser(req).email) {
          const existingUser = await storage.getUserByEmail(newEmail);
          if (existingUser && existingUser.id !== getAuthUser(req).id) {
            return res.status(400).json({ error: "Email already in use" });
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
        const error = fromZodError(validation.error);
        return res.status(400).json({ error: error.message });
      }

      const user = await storage.getUserById(getAuthUser(req).id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (!user.passwordHash) {
        return res.status(401).json({ error: "Your account uses Google sign-in and does not have a password set" });
      }

      const validPassword = await verifyPassword(validation.data.currentPassword, user.passwordHash);
      if (!validPassword) {
        return res.status(401).json({ error: "Current password is incorrect" });
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
        return res.status(400).json({ error: fromZodError(validation.error).message });
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
        return res.status(400).json({ error: fromZodError(validation.error).message });
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
        return res.status(400).json({ error: fromZodError(validation.error).message });
      }
      if (validation.data.themeId !== null) {
        const theme = await storage.getDesignTheme(validation.data.themeId);
        if (!theme) {
          return res.status(404).json({ error: "Theme not found" });
        }
      }
      const user = await storage.updateUserSelectedTheme(getAuthUser(req).id, validation.data.themeId);
      res.json({ selectedThemeId: user.selectedThemeId });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update theme preference", error);
    }
  });
}
