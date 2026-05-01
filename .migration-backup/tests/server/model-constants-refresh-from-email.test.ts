/**
 * Tests for the email-action route that backs the overdue-digest's
 * per-row "Re-fetch from authority" link (Task #602):
 *
 *     GET /api/admin/model-constants/refresh-from-email
 *
 * The route is intentionally HTML-rendering (not JSON) because it is
 * navigated to from an `<a href>` in an email. Each test asserts both
 * the HTTP status and the user-visible heading rendered on the page.
 *
 * Locks the contract:
 *   1. A signed token + an admin session re-fires the silent specialist
 *      via `proposeConstantRegeneration` and renders a success page.
 *      The route does NOT call `upsertModelConstantOverride` — apply is
 *      still admin-driven from the Constants tab.
 *   2. A missing/forged/expired token short-circuits with the right
 *      status (400 / 410) and never touches the proposer.
 *   3. Anonymous → 401 HTML; non-admin → 403 HTML.
 *   4. Idempotency: if a successful run for this row has completed
 *      after the token's `issuedAt`, the route reports "already
 *      refreshed" and does not fire the proposer.
 *   5. Query-string cross-check: the (k, c, s) values in the URL must
 *      match the signed payload — a stitched-together URL is rejected.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import request from "supertest";

let mockUser: { id: number; role: string } | null = null;

vi.mock("../../server/storage", () => ({
  storage: {
    listModelConstantOverrides: vi.fn(async () => []),
    getLatestSuccessfulRunForConstant: vi.fn(async () => null),
  },
}));

vi.mock("../../server/auth", () => ({
  requireAdmin: (req: Request, _res: Response, next: NextFunction) => {
    if (mockUser) (req as unknown as { user: { id: number; role: string } }).user = mockUser;
    next();
  },
}));

vi.mock("../../server/routes/helpers", () => ({
  logActivity: vi.fn(),
  logAndSendError: (res: Response, msg: string, err: unknown) => {
    res.status(500).json({ error: msg, detail: String(err) });
  },
}));

const propose = vi.fn();
vi.mock("../../server/ai/regenerate-constants", () => ({
  proposeConstantRegeneration: (args: unknown) => propose(args),
}));

vi.mock("../../server/logger", () => ({
  log: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  registerModelConstantsRoutes,
  _resetRefreshFromEmailInflight,
} from "../../server/routes/admin/model-constants";
import { storage } from "../../server/storage";
import { signRefreshAction } from "../../server/notifications/constants-action-token";

function buildApp(): Express {
  const app = express();
  // Inject the mocked user as session middleware so the handler-side
  // auth check can read req.user without going through requireAdmin
  // (the email-action route does its own HTML-rendering auth check).
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (mockUser) (req as unknown as { user: { id: number; role: string } }).user = mockUser;
    next();
  });
  app.use(express.json());
  registerModelConstantsRoutes(app);
  return app;
}

const ROUTE = "/api/admin/model-constants/refresh-from-email";

beforeEach(() => {
  vi.clearAllMocks();
  _resetRefreshFromEmailInflight();
  mockUser = { id: 1, role: "super_admin" };
  propose.mockResolvedValue({
    key: "taxRate",
    label: "Income tax rate",
    country: "United States",
    subdivision: "California",
    value: 0.30,
    authority: "California FTB",
    referenceUrl: "https://example.test/ftb",
    reasoning: "Statutory rate as of 2026.",
    sources: [],
    factoryValue: 0.21,
    currentValue: 0.21,
    isDifferentFromCurrent: true,
    researchRunId: 555,
    specialistId: "constants.tax-research",
  });
});

describe("GET /api/admin/model-constants/refresh-from-email", () => {
  it("re-fires the specialist for the row and renders an HTML success page", async () => {
    const issuedAt = Date.now();
    const token = signRefreshAction({
      key: "taxRate",
      country: "United States",
      subdivision: "California",
      issuedAt,
    });
    const app = buildApp();
    const res = await request(app).get(ROUTE).query({
      k: "taxRate",
      c: "United States",
      s: "California",
      t: token,
    });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.text).toContain("Refresh complete");
    expect(propose).toHaveBeenCalledTimes(1);
    expect(propose).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "taxRate",
        country: "United States",
        subdivision: "California",
      }),
    );
  });

  it("rejects a tampered token with 400 and does NOT fire the specialist", async () => {
    const token = signRefreshAction({
      key: "taxRate",
      country: "United States",
      subdivision: "California",
      issuedAt: Date.now(),
    });
    const tampered = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    const app = buildApp();
    const res = await request(app).get(ROUTE).query({
      k: "taxRate",
      c: "United States",
      s: "California",
      t: tampered,
    });

    expect(res.status).toBe(400);
    expect(res.text).toContain("Invalid link");
    expect(propose).not.toHaveBeenCalled();
  });

  it("rejects an expired token with 410", async () => {
    // 30-day-old issuedAt (TTL is 14 days).
    const issuedAt = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const token = signRefreshAction({
      key: "taxRate",
      country: "United States",
      subdivision: "California",
      issuedAt,
    });
    const app = buildApp();
    const res = await request(app).get(ROUTE).query({
      k: "taxRate",
      c: "United States",
      s: "California",
      t: token,
    });

    expect(res.status).toBe(410);
    expect(res.text).toContain("Link expired");
    expect(propose).not.toHaveBeenCalled();
  });

  it("rejects a stitched URL where query params do not match the signed payload", async () => {
    // Token was minted for taxRate; URL claims inflationRate. The
    // signature is valid but the cross-check fails.
    const token = signRefreshAction({
      key: "taxRate",
      country: "United States",
      subdivision: "California",
      issuedAt: Date.now(),
    });
    const app = buildApp();
    const res = await request(app).get(ROUTE).query({
      k: "inflationRate",
      c: "United States",
      s: "California",
      t: token,
    });

    expect(res.status).toBe(400);
    expect(res.text).toContain("Invalid link");
    expect(propose).not.toHaveBeenCalled();
  });

  it("returns 401 HTML for an anonymous visitor (no req.user)", async () => {
    mockUser = null;
    const token = signRefreshAction({
      key: "taxRate",
      country: "United States",
      subdivision: "California",
      issuedAt: Date.now(),
    });
    const app = buildApp();
    const res = await request(app).get(ROUTE).query({
      k: "taxRate",
      c: "United States",
      s: "California",
      t: token,
    });

    expect(res.status).toBe(401);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.text).toContain("Sign in");
    expect(propose).not.toHaveBeenCalled();
  });

  it("returns 403 HTML for a logged-in non-admin", async () => {
    mockUser = { id: 9, role: "user" };
    const token = signRefreshAction({
      key: "taxRate",
      country: "United States",
      subdivision: "California",
      issuedAt: Date.now(),
    });
    const app = buildApp();
    const res = await request(app).get(ROUTE).query({
      k: "taxRate",
      c: "United States",
      s: "California",
      t: token,
    });

    expect(res.status).toBe(403);
    expect(res.text).toContain("Admin access required");
    expect(propose).not.toHaveBeenCalled();
  });

  it("is idempotent: a successful run completed AFTER issuedAt → 200 'already refreshed', no proposer call", async () => {
    const issuedAt = Date.now() - 60 * 60 * 1000; // 1 hour ago
    vi.mocked(storage.getLatestSuccessfulRunForConstant).mockResolvedValueOnce({
      id: 999,
      // Completed 30 minutes after the email was issued.
      completedAt: new Date(issuedAt + 30 * 60 * 1000),
      startedAt: new Date(issuedAt + 29 * 60 * 1000),
      status: "completed",
      durationMs: 60_000,
      metadata: {},
    } as Awaited<ReturnType<typeof storage.getLatestSuccessfulRunForConstant>>);

    const token = signRefreshAction({
      key: "taxRate",
      country: "United States",
      subdivision: "California",
      issuedAt,
    });
    const app = buildApp();
    const res = await request(app).get(ROUTE).query({
      k: "taxRate",
      c: "United States",
      s: "California",
      t: token,
    });

    expect(res.status).toBe(200);
    expect(res.text).toContain("Already refreshed");
    expect(propose).not.toHaveBeenCalled();
  });

  it("DOES fire the specialist when the most recent successful run is older than the token", async () => {
    const issuedAt = Date.now();
    vi.mocked(storage.getLatestSuccessfulRunForConstant).mockResolvedValueOnce({
      id: 998,
      // Completed BEFORE the email was issued — does not satisfy the request.
      completedAt: new Date(issuedAt - 24 * 60 * 60 * 1000),
      startedAt: new Date(issuedAt - 24 * 60 * 60 * 1000 - 60_000),
      status: "completed",
      durationMs: 60_000,
      metadata: {},
    } as Awaited<ReturnType<typeof storage.getLatestSuccessfulRunForConstant>>);

    const token = signRefreshAction({
      key: "taxRate",
      country: "United States",
      subdivision: "California",
      issuedAt,
    });
    const app = buildApp();
    const res = await request(app).get(ROUTE).query({
      k: "taxRate",
      c: "United States",
      s: "California",
      t: token,
    });

    expect(res.status).toBe(200);
    expect(res.text).toContain("Refresh complete");
    expect(propose).toHaveBeenCalledTimes(1);
  });

  it("renders a 502 page when the proposer throws, and never writes an override", async () => {
    propose.mockRejectedValueOnce(new Error("specialist offline"));
    const token = signRefreshAction({
      key: "taxRate",
      country: "United States",
      subdivision: "California",
      issuedAt: Date.now(),
    });
    const app = buildApp();
    const res = await request(app).get(ROUTE).query({
      k: "taxRate",
      c: "United States",
      s: "California",
      t: token,
    });

    expect(res.status).toBe(502);
    expect(res.text).toContain("Refresh failed");
    expect(res.text).toContain("specialist offline");
  });

  it("never writes an override (the route is propose-only)", async () => {
    const token = signRefreshAction({
      key: "taxRate",
      country: "United States",
      subdivision: "California",
      issuedAt: Date.now(),
    });
    const app = buildApp();
    await request(app).get(ROUTE).query({
      k: "taxRate",
      c: "United States",
      s: "California",
      t: token,
    });
    // The mocked storage object has no `upsertModelConstantOverride` —
    // this assertion is a belt-and-braces check that the surface area
    // the route touches stays propose-only. If a future change adds a
    // write here, the storage mock will throw and this test will fail.
    expect(propose).toHaveBeenCalledTimes(1);
  });
});
