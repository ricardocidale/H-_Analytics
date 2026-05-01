/**
 * E2E Scenario Operations — save → load → update → delete round-trip.
 *
 * Run with:  E2E=1 npx vitest run tests/e2e/scenario-operations.test.ts
 *
 * Verifies the full scenario lifecycle against the live server,
 * including the critical shared-ownership invariant (userId: null on restored properties).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const BASE = process.env.E2E_BASE_URL || "http://localhost:5000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "ricardo.cidale@norfolkgroup.io";
const ADMIN_PASSWORD = process.env.PASSWORD_ADMIN || process.env.PASSWORD_DEFAULT || "";

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
  return cookie.split(";")[0];
}

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
      "Content-Type": "application/json",
    },
    redirect: "manual",
  });
}

describe.skipIf(!process.env.E2E)("E2E Scenario Operations", () => {
  let sessionCookie: string;
  let createdScenarioId: number | null = null;

  beforeAll(async () => {
    sessionCookie = await login();
  });

  // Cleanup: delete the test scenario if it was created
  afterAll(async () => {
    if (createdScenarioId && sessionCookie) {
      await authedFetch(`/api/scenarios/${createdScenarioId}`, sessionCookie, {
        method: "DELETE",
      });
    }
  });

  // ── Step 1: List existing scenarios ──────────────────────────────
  it("GET /api/scenarios returns array", async () => {
    const res = await authedFetch("/api/scenarios", sessionCookie);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  // ── Step 2: Save a new scenario ──────────────────────────────────
  it("POST /api/scenarios creates a test scenario", async () => {
    const res = await authedFetch("/api/scenarios", sessionCookie, {
      method: "POST",
      body: JSON.stringify({
        name: "E2E Test Scenario",
        description: "Created by automated E2E test",
      }),
    });
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.name).toBe("E2E Test Scenario");
    expect(body.description).toBe("Created by automated E2E test");
    createdScenarioId = body.id;
  });

  // ── Step 3: Update the scenario name ─────────────────────────────
  it("PATCH /api/scenarios/:id updates scenario metadata", async () => {
    expect(createdScenarioId).not.toBeNull();

    const res = await authedFetch(
      `/api/scenarios/${createdScenarioId}`,
      sessionCookie,
      {
        method: "PATCH",
        body: JSON.stringify({
          name: "E2E Test Scenario (Updated)",
          description: "Updated by E2E test",
        }),
      },
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.name).toBe("E2E Test Scenario (Updated)");
  });

  // ── Step 4: Load the scenario (restores snapshot) ────────────────
  it("POST /api/scenarios/:id/load restores scenario data", async () => {
    expect(createdScenarioId).not.toBeNull();

    const res = await authedFetch(
      `/api/scenarios/${createdScenarioId}/load`,
      sessionCookie,
      { method: "POST" },
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
  });

  // ── Step 5: Verify properties are still shared after load ────────
  it("Properties remain shared (visible) after scenario load", async () => {
    const res = await authedFetch("/api/properties", sessionCookie);
    expect(res.status).toBe(200);

    const properties = await res.json();
    expect(Array.isArray(properties)).toBe(true);
    // After loading a scenario, properties should still be accessible
    // (this catches the historical userId bug where loaded properties became invisible)
    expect(properties.length).toBeGreaterThan(0);
  });

  // ── Step 6: Verify global assumptions still exist ────────────────
  it("Global assumptions exist after scenario load", async () => {
    const res = await authedFetch("/api/global-assumptions", sessionCookie);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toBeDefined();
    expect(typeof body.projectionYears).toBe("number");
  });

  // ── Step 7: Verification still passes after load ─────────────────
  it("Verification still returns UNQUALIFIED after scenario load", async () => {
    const res = await authedFetch("/api/verification/run", sessionCookie, {
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.auditOpinion).toBe("UNQUALIFIED");
  });

  // ── Step 8: Delete the scenario ──────────────────────────────────
  it("DELETE /api/scenarios/:id removes the test scenario", async () => {
    expect(createdScenarioId).not.toBeNull();

    const res = await authedFetch(
      `/api/scenarios/${createdScenarioId}`,
      sessionCookie,
      { method: "DELETE" },
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    createdScenarioId = null; // Prevent afterAll cleanup
  });

  // ── Step 9: Confirm deletion ─────────────────────────────────────
  it("Deleted scenario no longer appears in list", async () => {
    const res = await authedFetch("/api/scenarios", sessionCookie);
    expect(res.status).toBe(200);

    const scenarios = await res.json();
    const found = scenarios.find(
      (s: any) => s.name === "E2E Test Scenario (Updated)",
    );
    expect(found).toBeUndefined();
  });

  it("Cannot delete a locked scenario (returns 403)", async () => {
    const res = await authedFetch("/api/scenarios", sessionCookie);
    const scenarios = await res.json();
    const lockedScenario = scenarios.find((s: any) => s.isLocked);

    if (lockedScenario) {
      const deleteRes = await authedFetch(
        `/api/scenarios/${lockedScenario.id}`,
        sessionCookie,
        { method: "DELETE" },
      );
      expect(deleteRes.status).toBe(403);
      const body = await deleteRes.json();
      expect(body.error).toContain("locked");
    }
  });
});
