/**
 * E2E Smoke Tests — hit the running server via HTTP fetch.
 *
 * Run with:  E2E=1 npx vitest run tests/e2e/smoke.test.ts
 *
 * Skipped by default in `npm test` (guarded by E2E env var).
 */
import { describe, it, expect, beforeAll } from "vitest";

const BASE = process.env.E2E_BASE_URL || "http://localhost:5000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "ricardo.cidale@norfolkgroup.io";
const ADMIN_PASSWORD = process.env.PASSWORD_ADMIN || process.env.PASSWORD_DEFAULT || "";

/** Login and return the session cookie string. */
async function login(
  email = ADMIN_EMAIL,
  password = ADMIN_PASSWORD,
): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    redirect: "manual",
  });
  const cookie = res.headers.get("set-cookie");
  if (!cookie) throw new Error("No Set-Cookie header on login response");
  return cookie.split(";")[0]; // e.g. "sid=abc123"
}

/** Convenience wrapper that attaches the session cookie. */
async function authedFetch(
  path: string,
  cookie: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...((init.headers as Record<string, string>) ?? {}),
      Cookie: cookie,
    },
    redirect: "manual",
  });
}

// ── Guard: only run when E2E=1 ──────────────────────────────────────
describe.skipIf(!process.env.E2E)("E2E Smoke Tests", () => {
  let sessionCookie: string;

  beforeAll(async () => {
    sessionCookie = await login();
  });

  // ── Auth flow ────────────────────────────────────────────────────

  it("POST /api/auth/login with valid credentials returns 200 + admin user", async () => {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
      redirect: "manual",
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe(ADMIN_EMAIL);
    expect(body.user.role).toBe("admin");
  });

  it("POST /api/auth/login with wrong password returns 401", async () => {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: "wrong-password" }),
      redirect: "manual",
    });
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.user).toBeUndefined();
  });

  it("GET /api/auth/me without session cookie returns 401", async () => {
    const res = await fetch(`${BASE}/api/auth/me`, { redirect: "manual" });
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("GET /api/auth/me with valid session returns current user", async () => {
    const res = await authedFetch("/api/auth/me", sessionCookie);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe(ADMIN_EMAIL);
    expect(body.user.role).toBe("admin");
  });

  // ── Properties CRUD ──────────────────────────────────────────────

  it("GET /api/properties returns 200 + array", async () => {
    const res = await authedFetch("/api/properties", sessionCookie);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("GET /api/properties requires auth", async () => {
    const res = await fetch(`${BASE}/api/properties`, { redirect: "manual" });
    expect(res.status).toBe(401);
  });

  // ── Global Assumptions ───────────────────────────────────────────

  it("GET /api/global-assumptions returns 200 + object with projectionYears", async () => {
    const res = await authedFetch("/api/global-assumptions", sessionCookie);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toBeDefined();
    expect(typeof body.projectionYears).toBe("number");
    expect(body.projectionYears).toBeGreaterThanOrEqual(1);
  });

  it("GET /api/global-assumptions requires auth", async () => {
    const res = await fetch(`${BASE}/api/global-assumptions`, {
      redirect: "manual",
    });
    expect(res.status).toBe(401);
  });

  // ── Verification ─────────────────────────────────────────────────

  it("POST /api/verification/run returns UNQUALIFIED audit opinion", async () => {
    const res = await authedFetch("/api/verification/run", sessionCookie, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.auditOpinion).toBe("UNQUALIFIED");
  });

  it("POST /api/verification/run requires admin auth", async () => {
    const res = await fetch(`${BASE}/api/verification/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      redirect: "manual",
    });
    expect(res.status).toBe(401);
  });
});
