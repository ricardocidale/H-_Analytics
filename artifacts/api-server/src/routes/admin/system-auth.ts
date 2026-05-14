import type { Express } from "express";
import { requireSuperAdmin } from "../../auth";
import { db } from "../../db";
import { seedDefaults } from "@workspace/db";
import { eq, and, or } from "drizzle-orm";
import { logAndSendError } from "../helpers";
import { isPublishedDeployment } from "../../providers/config";

const SYSTEM_ENTITY_TYPE = "system";
const SYSTEM_ENTITY_KEY = "auth";
const LOGIN_SCREEN_FIELD = "login_screen_enabled";
const MOTD_ENABLED_FIELD = "motd_enabled";
const MOTD_TEXT_FIELD = "motd_text";
const AUTO_LOGIN_FIELD = "auto_login_enabled";
const MOTD_MAX_LENGTH = 280;

async function readLoginScreenEnabled(): Promise<boolean> {
  const rows = await db
    .select()
    .from(seedDefaults)
    .where(
      and(
        eq(seedDefaults.entityType, SYSTEM_ENTITY_TYPE),
        eq(seedDefaults.entityKey, SYSTEM_ENTITY_KEY),
        eq(seedDefaults.fieldName, LOGIN_SCREEN_FIELD)
      )
    )
    .limit(1);

  if (rows.length === 0) return true;
  const val = rows[0].seedValue;
  return val !== false && val !== "false";
}

async function readMotd(): Promise<{ enabled: boolean; text: string }> {
  const rows = await db
    .select()
    .from(seedDefaults)
    .where(
      and(
        eq(seedDefaults.entityType, SYSTEM_ENTITY_TYPE),
        eq(seedDefaults.entityKey, SYSTEM_ENTITY_KEY),
        or(
          eq(seedDefaults.fieldName, MOTD_ENABLED_FIELD),
          eq(seedDefaults.fieldName, MOTD_TEXT_FIELD)
        )
      )
    );

  let enabled = false;
  let text = "";
  for (const row of rows) {
    if (row.fieldName === MOTD_ENABLED_FIELD) {
      enabled = row.seedValue === true || row.seedValue === "true";
    } else if (row.fieldName === MOTD_TEXT_FIELD) {
      text = typeof row.seedValue === "string" ? row.seedValue : "";
    }
  }
  return { enabled, text };
}

async function readAutoLoginEnabled(): Promise<boolean> {
  const rows = await db
    .select()
    .from(seedDefaults)
    .where(
      and(
        eq(seedDefaults.entityType, SYSTEM_ENTITY_TYPE),
        eq(seedDefaults.entityKey, SYSTEM_ENTITY_KEY),
        eq(seedDefaults.fieldName, AUTO_LOGIN_FIELD)
      )
    )
    .limit(1);

  if (rows.length === 0) return false;
  const val = rows[0].seedValue;
  return val === true || val === "true";
}

async function upsertSeedDefault(fieldName: string, value: unknown): Promise<void> {
  await db
    .insert(seedDefaults)
    .values({
      entityType: SYSTEM_ENTITY_TYPE,
      entityKey: SYSTEM_ENTITY_KEY,
      fieldName,
      seedValue: value,
    })
    .onConflictDoUpdate({
      target: [seedDefaults.entityType, seedDefaults.entityKey, seedDefaults.fieldName],
      set: { seedValue: value },
    });
}

export function registerSystemAuthRoutes(app: Express) {
  /**
   * Public — the login page fetches this before rendering the form so it can
   * show an "access restricted" message when the login screen is disabled,
   * and to render the message of the day on the right panel.
   * Intentionally unauthenticated: the client has no session yet.
   */
  app.get("/api/system/login-config", async (_req, res) => {
    try {
      const [loginScreenEnabled, motd, autoLoginEnabledInDb] = await Promise.all([
        readLoginScreenEnabled(),
        readMotd(),
        readAutoLoginEnabled(),
      ]);
      // Only expose auto-login to the client in non-production environments.
      // The /api/auth/dev-login endpoint enforces the same gate server-side,
      // so this is a belt-and-suspenders defence against accidental DB state.
      const autoLoginEnabled = !isPublishedDeployment() && autoLoginEnabledInDb;
      res.json({ loginScreenEnabled, motd, autoLoginEnabled });
    } catch (err) {
      logAndSendError(res, "Failed to read login config", err);
    }
  });

  /** Super-admin read */
  app.get(
    "/api/admin/system/auth-settings",
    requireSuperAdmin,
    async (_req, res) => {
      try {
        const [loginScreenEnabled, motd, autoLoginEnabled] = await Promise.all([
          readLoginScreenEnabled(),
          readMotd(),
          readAutoLoginEnabled(),
        ]);
        res.json({ loginScreenEnabled, motd, autoLoginEnabled });
      } catch (err) {
        logAndSendError(res, "Failed to read auth settings", err);
      }
    }
  );

  /** Super-admin write — toggles login screen and/or updates MOTD */
  app.patch(
    "/api/admin/system/auth-settings",
    requireSuperAdmin,
    async (req, res) => {
      try {
        const { loginScreenEnabled, motdEnabled, motdText, autoLoginEnabled } = req.body as {
          loginScreenEnabled?: unknown;
          motdEnabled?: unknown;
          motdText?: unknown;
          autoLoginEnabled?: unknown;
        };

        if (loginScreenEnabled !== undefined) {
          if (typeof loginScreenEnabled !== "boolean") {
            return res.status(400).json({ error: "loginScreenEnabled must be a boolean" });
          }
          await upsertSeedDefault(LOGIN_SCREEN_FIELD, loginScreenEnabled);
        }

        if (motdEnabled !== undefined) {
          if (typeof motdEnabled !== "boolean") {
            return res.status(400).json({ error: "motdEnabled must be a boolean" });
          }
          await upsertSeedDefault(MOTD_ENABLED_FIELD, motdEnabled);
        }

        if (motdText !== undefined) {
          if (typeof motdText !== "string") {
            return res.status(400).json({ error: "motdText must be a string" });
          }
          if (motdText.length > MOTD_MAX_LENGTH) {
            return res.status(400).json({ error: `motdText must be ${MOTD_MAX_LENGTH} characters or fewer` });
          }
          await upsertSeedDefault(MOTD_TEXT_FIELD, motdText);
        }

        if (autoLoginEnabled !== undefined) {
          if (typeof autoLoginEnabled !== "boolean") {
            return res.status(400).json({ error: "autoLoginEnabled must be a boolean" });
          }
          await upsertSeedDefault(AUTO_LOGIN_FIELD, autoLoginEnabled);
        }

        req.log.info(
          { loginScreenEnabled, motdEnabled, motdTextLength: typeof motdText === "string" ? motdText.length : undefined, autoLoginEnabled, actor: req.user?.email },
          "auth settings updated"
        );

        const [updatedLoginScreenEnabled, updatedMotd, updatedAutoLoginEnabled] = await Promise.all([
          readLoginScreenEnabled(),
          readMotd(),
          readAutoLoginEnabled(),
        ]);
        res.json({ loginScreenEnabled: updatedLoginScreenEnabled, motd: updatedMotd, autoLoginEnabled: updatedAutoLoginEnabled });
      } catch (err) {
        logAndSendError(res, "Failed to update auth settings", err);
      }
    }
  );
}
