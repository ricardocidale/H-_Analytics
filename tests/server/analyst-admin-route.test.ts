/**
 * POST /api/analyst/refresh — cooldown policy tests.
 *
 * Focus: cooldown is HELD across both successful AND failed runs. The
 * doctrine is a strict "once every 60s" budget per admin; failed upstream
 * calls must not gift the admin an instant retry.
 *
 * We test the handler directly (exported as `analystRefreshHandler`) with
 * mocked req/res/runner — no express boot required.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/ai/analyst-scoped-runner", () => ({
  runAnalystScoped: vi.fn(),
}));

vi.mock("../../server/routes/helpers", () => ({
  logActivity: vi.fn(),
  logAndSendError: vi.fn((res: any, msg: string, _err: unknown) => {
    res.status(500);
    res.json({ error: msg });
    return res;
  }),
}));

vi.mock("../../server/auth", () => ({
  requireAuth: vi.fn(),
  getAuthUser: vi.fn((req: any) => req.user),
}));

import {
  analystRefreshHandler,
  __resetAnalystCooldown,
} from "../../server/routes/analyst-admin";
import { runAnalystScoped } from "../../server/ai/analyst-scoped-runner";

function mockRes() {
  const res: any = { locals: {} };
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn().mockReturnValue(res);
  return res;
}

function mockReq(userId: number) {
  return {
    body: { scope: "global-assumptions" },
    user: { id: userId, role: "admin" },
  } as any;
}

beforeEach(() => {
  __resetAnalystCooldown();
  vi.clearAllMocks();
});

describe("POST /api/analyst/refresh — cooldown policy", () => {
  it("successful run reserves the cooldown; second call within 60s returns 429", async () => {
    (runAnalystScoped as any).mockResolvedValue({
      runId: 1,
      durationMs: 10,
      totalRecords: 0,
      filteredRecords: 0,
      guidance: [],
    });

    const res1 = mockRes();
    await analystRefreshHandler(mockReq(42), res1);
    expect(res1.status).not.toHaveBeenCalledWith(429);
    expect(res1.json).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 1 }),
    );

    const res2 = mockRes();
    await analystRefreshHandler(mockReq(42), res2);
    expect(res2.status).toHaveBeenCalledWith(429);
    expect(res2.setHeader).toHaveBeenCalledWith("Retry-After", expect.any(String));
    expect(res2.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Analyst is cooling down",
        retryAfterMs: expect.any(Number),
      }),
    );
  });

  it("failed run HOLDS the cooldown — second call within 60s still returns 429", async () => {
    (runAnalystScoped as any).mockRejectedValue(new Error("upstream LLM 500"));

    const res1 = mockRes();
    await analystRefreshHandler(mockReq(99), res1);
    // First call: the runner threw → 500 error path.
    expect(res1.status).toHaveBeenCalledWith(500);

    // Second call within 60s: must be blocked by cooldown.
    // This is the regression guard — previously the handler deleted the
    // cooldown on failure, letting an admin hammer a flaky upstream.
    const res2 = mockRes();
    await analystRefreshHandler(mockReq(99), res2);
    expect(res2.status).toHaveBeenCalledWith(429);
    expect(res2.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Analyst is cooling down",
        retryAfterMs: expect.any(Number),
      }),
    );
  });

  it("cooldown is per-user — one admin's run does not block another admin", async () => {
    (runAnalystScoped as any).mockResolvedValue({
      runId: 2,
      durationMs: 10,
      totalRecords: 0,
      filteredRecords: 0,
      guidance: [],
    });

    const resA = mockRes();
    await analystRefreshHandler(mockReq(1), resA);
    expect(resA.status).not.toHaveBeenCalledWith(429);

    const resB = mockRes();
    await analystRefreshHandler(mockReq(2), resB);
    expect(resB.status).not.toHaveBeenCalledWith(429);
  });

  it("returns full guidance payload on success (runId, counts, guidance array)", async () => {
    // Regression guard — the UI reads these fields directly; the route
    // must not silently reshape the runner's output.
    (runAnalystScoped as any).mockResolvedValue({
      runId: 555,
      durationMs: 1234,
      totalRecords: 12,
      filteredRecords: 3,
      guidance: [{ fieldName: "adr", low: 100, high: 200, confidence: "high" }],
    });
    const res = mockRes();
    await analystRefreshHandler(mockReq(31), res);
    expect(res.json).toHaveBeenCalledWith({
      runId: 555,
      durationMs: 1234,
      totalRecords: 12,
      filteredRecords: 3,
      guidance: [{ fieldName: "adr", low: 100, high: 200, confidence: "high" }],
    });
  });

  it("forwards the fields filter to the runner unchanged", async () => {
    (runAnalystScoped as any).mockResolvedValue({
      runId: 1,
      durationMs: 1,
      totalRecords: 0,
      filteredRecords: 0,
      guidance: [],
    });
    const req = {
      body: { scope: "global-assumptions", fields: ["inflationRate", "costOfEquity"] },
      user: { id: 77, role: "admin" },
    } as any;
    const res = mockRes();
    await analystRefreshHandler(req, res);
    expect(runAnalystScoped).toHaveBeenCalledWith({
      scope: "company",
      userId: 77,
      fields: ["inflationRate", "costOfEquity"],
    });
  });

  it("rejects invalid body with 400 and does NOT reserve the cooldown", async () => {
    const req = { body: { scope: "not-a-real-scope" }, user: { id: 7, role: "admin" } } as any;
    const res = mockRes();
    await analystRefreshHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);

    // With a valid body now, the next call should pass (cooldown wasn't burned).
    (runAnalystScoped as any).mockResolvedValue({
      runId: 3,
      durationMs: 10,
      totalRecords: 0,
      filteredRecords: 0,
      guidance: [],
    });
    const res2 = mockRes();
    await analystRefreshHandler(mockReq(7), res2);
    expect(res2.status).not.toHaveBeenCalledWith(429);
  });
});
