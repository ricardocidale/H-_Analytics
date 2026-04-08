import type { Express } from "express";
import { OAuth2Client } from "google-auth-library";
import { storage } from "../storage";
import {
  generateSessionId,
  getSessionExpiryDate,
  setSessionCookie,
  sanitizeEmail,
} from "../auth";
import { logger } from "../logger";
import { ensureDefaultScenario } from "./scenario-helpers";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

function isGoogleAuthConfigured(): boolean {
  return !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

const pendingStates = new Map<string, { createdAt: number; userId?: number; purpose?: string }>();

setInterval(() => {
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  const keys = Array.from(pendingStates.keys());
  for (const key of keys) {
    const val = pendingStates.get(key);
    if (val && val.createdAt < fiveMinAgo) pendingStates.delete(key);
  }
}, 60 * 1000);

function getBaseUrl(): string {
  if (process.env.BASE_URL) return process.env.BASE_URL;
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  return 'https://h-analysis.com';
}

function buildOAuth2Client() {
  const baseUrl = getBaseUrl();
  return new OAuth2Client(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    `${baseUrl}/api/auth/google/callback`
  );
}

function buildDriveOAuth2Client() {
  const baseUrl = getBaseUrl();
  return new OAuth2Client(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    `${baseUrl}/api/auth/google/drive/callback`
  );
}

export function registerGoogleAuthRoutes(app: Express) {
  if (!isGoogleAuthConfigured()) {
    logger.warn("Google OAuth routes disabled: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set", "google-auth");
    return;
  }
  app.get("/api/auth/google", async (req, res) => {
    try {
      const state = crypto.randomUUID();
      pendingStates.set(state, { createdAt: Date.now() });

      const oAuth2Client = buildOAuth2Client();
      const authorizeUrl = oAuth2Client.generateAuthUrl({
        access_type: "offline",
        scope: ["openid", "email", "profile"],
        state,
        prompt: "select_account",
      });

      logger.info(`Google auth: redirecting to Google (baseUrl=${process.env.BASE_URL || 'https://h-analysis.com'})`, "auth");
      res.redirect(authorizeUrl);
    } catch (error) {
      logger.error(`Google auth redirect error: ${error instanceof Error ? error.message : error}`, "auth");
      res.redirect("/login?error=google_unavailable");
    }
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    try {
      const { state, code, error: oauthError } = req.query;

      logger.info(`Google callback query: state=${state ? "present" : "missing"}, code=${code ? "present" : "missing"}, error=${oauthError || "none"}`, "auth");

      if (oauthError) {
        logger.error(`Google OAuth error: ${oauthError} (desc: ${req.query.error_description || "none"})`, "auth");
        return res.redirect("/login?error=google_failed");
      }

      if (!state || typeof state !== "string" || !pendingStates.has(state)) {
        logger.error(`Google callback: invalid state (pending states count: ${pendingStates.size})`, "auth");
        return res.redirect("/login?error=invalid_state");
      }

      if (!code || typeof code !== "string") {
        logger.error("Google callback: missing authorization code", "auth");
        return res.redirect("/login?error=google_failed");
      }

      pendingStates.delete(state);

      const oAuth2Client = buildOAuth2Client();
      const { tokens } = await oAuth2Client.getToken(code);
      oAuth2Client.setCredentials(tokens);

      if (!tokens.id_token) {
        return res.redirect("/login?error=no_email");
      }

      const ticket = await oAuth2Client.verifyIdToken({
        idToken: tokens.id_token,
        audience: GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        return res.redirect("/login?error=no_email");
      }

      if (payload.email_verified === false) {
        return res.redirect("/login?error=email_not_verified");
      }

      const email = sanitizeEmail(payload.email);
      const user = await storage.getUserByEmail(email);

      if (!user) {
        logger.info(`Google sign-in attempt with unregistered email: ${email}`, "auth");
        return res.redirect("/login?error=no_account");
      }

      if (user.googleId && payload.sub && user.googleId !== payload.sub) {
        logger.error(`Google ID mismatch for user ${user.id}: stored=${user.googleId}, incoming=${payload.sub}`, "auth");
        return res.redirect("/login?error=google_id_mismatch");
      }

      if (payload.sub && !user.googleId) {
        try {
          await storage.updateUserGoogleId(user.id, payload.sub);
        } catch (e) {
          logger.error(`Failed to store googleId for user ${user.id}: ${e}`, "auth");
        }
      }

      const sessionId = generateSessionId();
      const expiresAt = getSessionExpiryDate();
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      await storage.createSession(user.id, sessionId, expiresAt);
      await storage.createLoginLog(user.id, sessionId, clientIp);
      ensureDefaultScenario(user.id).catch(() => { /* ignore: default scenario seeding is non-blocking */ });
      setSessionCookie(res, sessionId);

      logger.info(`Google sign-in successful: ${email} (userId: ${user.id})`, "auth");
      res.redirect("/");
    } catch (error) {
      logger.error(`Google auth callback error: ${error instanceof Error ? error.message : error}`, "auth");
      res.redirect("/login?error=google_failed");
    }
  });

  app.get("/api/auth/google/drive", async (req, res) => {
    try {
      if (!req.user) {
        return res.redirect("/login");
      }

      const state = crypto.randomUUID();
      pendingStates.set(state, { createdAt: Date.now(), userId: req.user.id, purpose: "drive" });

      const oAuth2Client = buildDriveOAuth2Client();
      const authorizeUrl = oAuth2Client.generateAuthUrl({
        access_type: "offline",
        scope: [
          "openid",
          "email",
          "profile",
          "https://www.googleapis.com/auth/drive.file",
        ],
        state,
        prompt: "consent",
      });

      logger.info(`Google Drive connect: redirecting user ${req.user.id} to Google`, "auth");
      res.redirect(authorizeUrl);
    } catch (error) {
      logger.error(`Google Drive redirect error: ${error instanceof Error ? error.message : error}`, "auth");
      res.redirect("/drive?error=drive_unavailable");
    }
  });

  app.get("/api/auth/google/drive/callback", async (req, res) => {
    try {
      const { state, code, error: oauthError } = req.query;

      if (oauthError) {
        logger.error(`Google Drive OAuth error: ${oauthError}`, "auth");
        return res.redirect("/drive?error=drive_failed");
      }

      if (!state || typeof state !== "string" || !pendingStates.has(state)) {
        logger.error("Google Drive callback: invalid state", "auth");
        return res.redirect("/drive?error=invalid_state");
      }

      if (!code || typeof code !== "string") {
        logger.error("Google Drive callback: missing authorization code", "auth");
        return res.redirect("/drive?error=drive_failed");
      }

      const stateData = pendingStates.get(state)!;
      if (stateData.purpose !== "drive" || !stateData.userId) {
        logger.error("Google Drive callback: state purpose mismatch or missing userId", "auth");
        pendingStates.delete(state);
        return res.redirect("/drive?error=invalid_state");
      }

      const userId = stateData.userId;
      pendingStates.delete(state);

      const oAuth2Client = buildDriveOAuth2Client();
      const { tokens } = await oAuth2Client.getToken(code);

      if (!tokens.access_token) {
        logger.error("Google Drive callback: no access token returned", "auth");
        return res.redirect("/drive?error=drive_failed");
      }

      await storage.updateUserGoogleTokens(userId, {
        googleAccessToken: tokens.access_token,
        googleRefreshToken: tokens.refresh_token || undefined,
        googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
        googleDriveConnected: true,
      });

      logger.info(`Google Drive connected for user ${userId}`, "auth");
      res.redirect("/drive?success=connected");
    } catch (error) {
      logger.error(`Google Drive callback error: ${error instanceof Error ? error.message : error}`, "auth");
      res.redirect("/drive?error=drive_failed");
    }
  });
}
