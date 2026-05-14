import type { Express } from "express";
import { requireSuperAdmin } from "../../auth";
import { db } from "../../db";
import { seedDefaults } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logAndSendError } from "../helpers";

const SYSTEM_ENTITY_TYPE = "system";
const SYSTEM_ENTITY_KEY = "auth";
const LOGIN_SCREEN_FIELD = "login_screen_enabled";

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

export function registerSystemAuthRoutes(app: Express) {
  /**
   * Public — the login page fetches this before rendering the form so it can
   * show an "access restricted" message when the login screen is disabled.
   * Intentionally unauthenticated: the client has no session yet.
   */
  app.get("/api/system/login-config", async (_req, res) => {
    try {
      const loginScreenEnabled = await readLoginScreenEnabled();
      res.json({ loginScreenEnabled });
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
        const loginScreenEnabled = await readLoginScreenEnabled();
        res.json({ loginScreenEnabled });
      } catch (err) {
        logAndSendError(res, "Failed to read auth settings", err);
      }
    }
  );

  /** Super-admin write — toggles the login screen on or off */
  app.patch(
    "/api/admin/system/auth-settings",
    requireSuperAdmin,
    async (req, res) => {
      try {
        const { loginScreenEnabled } = req.body as { loginScreenEnabled?: unknown };
        if (typeof loginScreenEnabled !== "boolean") {
          return res.status(400).json({ error: "loginScreenEnabled must be a boolean" });
        }

        await db
          .insert(seedDefaults)
          .values({
            entityType: SYSTEM_ENTITY_TYPE,
            entityKey: SYSTEM_ENTITY_KEY,
            fieldName: LOGIN_SCREEN_FIELD,
            seedValue: loginScreenEnabled,
          })
          .onConflictDoUpdate({
            target: [
              seedDefaults.entityType,
              seedDefaults.entityKey,
              seedDefaults.fieldName,
            ],
            set: { seedValue: loginScreenEnabled },
          });

        req.log.info(
          { loginScreenEnabled, actor: req.user?.email },
          "login screen setting updated"
        );
        res.json({ loginScreenEnabled });
      } catch (err) {
        logAndSendError(res, "Failed to update auth settings", err);
      }
    }
  );
}
