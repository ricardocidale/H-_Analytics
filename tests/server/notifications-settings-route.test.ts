/**
 * PUT /api/notifications/settings — allowlist tests for the org-wide
 * Quiet hours kill switches surfaced on NotificationsTab → Channels.
 *
 * Each Quiet hours toggle on the admin UI maps to one notification
 * settings key. The route guards writes with a hard allowlist, so any
 * key the UI is allowed to flip MUST be listed there or the PUT will
 * 400 with "Unknown setting keys: …" and the toggle silently fails to
 * persist. This test pins the three current Quiet hours keys + the
 * `resend_enabled` master switch so a key drift is caught at CI time
 * instead of in production.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";

const setNotificationSetting = vi.fn();
const getNotificationSettings = vi.fn();

vi.mock("../../server/storage", () => ({
  storage: {
    setNotificationSetting: (k: string, v: string | null) => setNotificationSetting(k, v),
    getNotificationSettings: () => getNotificationSettings(),
  },
}));

vi.mock("../../server/auth", () => ({
  requireAuth: (_req: Request, _res: Response, next: NextFunction) => next(),
  requireAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
  getAuthUser: () => ({ id: 1, role: "super_admin", email: "admin@example.com" }),
}));

vi.mock("../../server/routes/helpers", () => ({
  logAndSendError: (res: Response, msg: string, err: unknown) => {
    res.status(500).json({ error: msg, detail: String(err) });
  },
  parseRouteId: (raw: string) => Number(raw),
}));

vi.mock("../../server/integrations/resend", () => ({
  testResendConnection: vi.fn(),
  sendReportShareEmail: vi.fn(),
  sendScenarioSummaryEmail: vi.fn(),
  sendNotificationEmail: vi.fn(),
}));

vi.mock("../../server/notifications/vector-latency-alert", () => ({
  resolveVectorLatencyConfig: vi.fn(),
  VECTOR_LATENCY_CHART_PATH: "/admin/vector-latency",
}));

vi.mock("../../server/providers/config", () => ({
  getAppUrl: () => "https://example.test",
}));

vi.mock("../../server/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
  log: vi.fn(),
}));

import * as notificationRoutes from "../../server/routes/notifications";

function makeApp() {
  const app = express();
  app.use(express.json());
  notificationRoutes.register(app);
  return app;
}

beforeEach(() => {
  setNotificationSetting.mockReset();
  getNotificationSettings.mockReset();
  setNotificationSetting.mockResolvedValue(undefined);
  getNotificationSettings.mockResolvedValue({});
});

describe("PUT /api/notifications/settings — Quiet hours kill-switch allowlist", () => {
  const QUIET_HOURS_KEYS = [
    "specialist_quality_band_change_disabled",
    "constants_refresh_digest_disabled",
    "llm_registry_refresh_disabled",
  ];

  for (const key of QUIET_HOURS_KEYS) {
    it(`accepts ${key} and persists it via storage.setNotificationSetting`, async () => {
      const app = makeApp();
      const res = await request(app)
        .put("/api/notifications/settings")
        .send({ [key]: "true" });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
      expect(setNotificationSetting).toHaveBeenCalledWith(key, "true");
    });
  }

  it("rejects an unknown setting key with 400 and never writes", async () => {
    const app = makeApp();
    const res = await request(app)
      .put("/api/notifications/settings")
      .send({ totally_made_up_key: "true" });
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toMatch(/Unknown setting keys/);
    expect(setNotificationSetting).not.toHaveBeenCalled();
  });

  it("still accepts the master resend_enabled switch", async () => {
    const app = makeApp();
    const res = await request(app)
      .put("/api/notifications/settings")
      .send({ resend_enabled: "false" });
    expect(res.status).toBe(200);
    expect(setNotificationSetting).toHaveBeenCalledWith("resend_enabled", "false");
  });
});
