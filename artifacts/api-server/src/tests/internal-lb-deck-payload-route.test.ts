/**
 * Route integration tests for GET /api/internal/lb-deck-payload.
 *
 * Covers the new factory-token branch shipped in U4 plus the legacy
 * LB-token branch (regression net):
 *   - Factory token, run is `complete`             → 200 + factory payload
 *   - Factory token, run not complete              → 409
 *   - Factory token, run not found                 → 404
 *   - Factory token, expired                       → 401
 *   - Factory token, invalid signature             → 401
 *   - Factory token, run missing slide<N>PropertyId → 503
 *   - Legacy LB token                              → 200 + legacy payload
 *   - Unknown / malformed token                    → 401
 *
 * Heavy dependencies (storage, build-lb-payload helpers) are mocked.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import express, { type Request, type Response } from "express";
import supertest from "supertest";

// ── Hoisted mock state ────────────────────────────────────────────────────────
const {
  mockGetSlideFactoryRunById,
  mockBuildLbPayload,
  mockBuildLbPayloadFromFactoryRun,
  mockVerifyLbDeckToken,
} = vi.hoisted(() => ({
  mockGetSlideFactoryRunById: vi.fn(),
  mockBuildLbPayload: vi.fn(),
  mockBuildLbPayloadFromFactoryRun: vi.fn(),
  mockVerifyLbDeckToken: vi.fn(),
}));

// ── Module mocks ─────────────────────────────────────────────────────────────
vi.mock("../logger", () => ({
  loggerFor: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../slides/build-lb-payload", () => ({
  buildLbPayload: (...args: unknown[]) => mockBuildLbPayload(...args),
  buildLbPayloadFromFactoryRun: (...args: unknown[]) => mockBuildLbPayloadFromFactoryRun(...args),
}));

vi.mock("../slides/lb-token", () => ({
  verifyLbDeckToken: (...args: unknown[]) => mockVerifyLbDeckToken(...args),
}));

vi.mock("../storage/slide-factory-runs", () => ({
  getSlideFactoryRunById: (...args: unknown[]) => mockGetSlideFactoryRunById(...args),
}));

// factory-token is NOT mocked — we use the real signing/verification so the
// tests exercise the real prefix discrimination + signature path.
process.env.TOKEN_ENCRYPTION_KEY ??= "test-token-encryption-key-internal-lb-deck-payload";

// ── Import under test (after mocks) ──────────────────────────────────────────
import { internalLbDeckPayloadRouter } from "../routes/internal-lb-deck-payload";
import { signFactoryDeckToken } from "../slides/factory-token";

// ── Test app ─────────────────────────────────────────────────────────────────
let agent: ReturnType<typeof supertest>;

beforeAll(() => {
  const app = express();
  app.use(internalLbDeckPayloadRouter);
  agent = supertest(app);
});

beforeEach(() => {
  mockGetSlideFactoryRunById.mockReset();
  mockBuildLbPayload.mockReset();
  mockBuildLbPayloadFromFactoryRun.mockReset();
  mockVerifyLbDeckToken.mockReset();
});

// ── Test fixtures ────────────────────────────────────────────────────────────
const FAKE_RUN_ID = 42;
const FAKE_FACTORY_PAYLOAD = {
  slides: [{ stub: 1 }, { stub: 2 }, { stub: 3 }, { stub: 4 }, { stub: 5 }, { stub: 6 }],
  config: { slide1PropertyId: 10, slide2PropertyId: 20, slide3PropertyId: 30, slide5PropertyId: 50 },
};
const FAKE_LEGACY_PAYLOAD = {
  slides: [{ legacy: 1 }, { legacy: 2 }, { legacy: 3 }, { legacy: 4 }, { legacy: 5 }, { legacy: 6 }],
  config: { slide1PropertyId: 1, slide2PropertyId: 2, slide3PropertyId: 3, slide5PropertyId: 5 },
};
const FAKE_COMPLETE_RUN = {
  id: FAKE_RUN_ID,
  status: "complete" as const,
  slide1PropertyId: 10,
  slide2PropertyId: 20,
  slide3PropertyId: 30,
  slide5PropertyId: 50,
  luccaDraft: {},
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/internal/lb-deck-payload — factory token, complete run", () => {
  it("returns 200 with the factory payload + Cache-Control: no-store", async () => {
    mockGetSlideFactoryRunById.mockResolvedValue(FAKE_COMPLETE_RUN);
    mockBuildLbPayloadFromFactoryRun.mockResolvedValue(FAKE_FACTORY_PAYLOAD);

    const { token } = signFactoryDeckToken(FAKE_RUN_ID);
    const res = await agent.get(`/api/internal/lb-deck-payload?token=${encodeURIComponent(token)}`);

    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body).toEqual(FAKE_FACTORY_PAYLOAD);
    expect(mockGetSlideFactoryRunById).toHaveBeenCalledWith(FAKE_RUN_ID);
    expect(mockBuildLbPayloadFromFactoryRun).toHaveBeenCalledWith(FAKE_COMPLETE_RUN);
    // Legacy path must NOT be touched on factory hit
    expect(mockVerifyLbDeckToken).not.toHaveBeenCalled();
    expect(mockBuildLbPayload).not.toHaveBeenCalled();
  });
});

describe("GET /api/internal/lb-deck-payload — factory token, state-machine guards", () => {
  it("returns 404 when getSlideFactoryRunById resolves null", async () => {
    mockGetSlideFactoryRunById.mockResolvedValue(null);
    const { token } = signFactoryDeckToken(FAKE_RUN_ID);

    const res = await agent.get(`/api/internal/lb-deck-payload?token=${encodeURIComponent(token)}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(new RegExp(`run ${FAKE_RUN_ID} not found`, "i"));
    expect(mockBuildLbPayloadFromFactoryRun).not.toHaveBeenCalled();
  });

  it("returns 409 when the run is in a non-complete state", async () => {
    mockGetSlideFactoryRunById.mockResolvedValue({
      ...FAKE_COMPLETE_RUN,
      status: "building",
    });
    const { token } = signFactoryDeckToken(FAKE_RUN_ID);

    const res = await agent.get(`/api/internal/lb-deck-payload?token=${encodeURIComponent(token)}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/not complete/i);
    expect(res.body.error).toMatch(/status: building/i);
    expect(mockBuildLbPayloadFromFactoryRun).not.toHaveBeenCalled();
  });

  it("returns 503 when the run is complete but not fully configured", async () => {
    mockGetSlideFactoryRunById.mockResolvedValue(FAKE_COMPLETE_RUN);
    mockBuildLbPayloadFromFactoryRun.mockRejectedValue(
      new Error("Slide factory run 42 is not fully configured: ..."),
    );
    const { token } = signFactoryDeckToken(FAKE_RUN_ID);

    const res = await agent.get(`/api/internal/lb-deck-payload?token=${encodeURIComponent(token)}`);

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/not fully configured/i);
  });

  it("returns 500 when buildLbPayloadFromFactoryRun throws an unexpected error", async () => {
    mockGetSlideFactoryRunById.mockResolvedValue(FAKE_COMPLETE_RUN);
    mockBuildLbPayloadFromFactoryRun.mockRejectedValue(new Error("R2 unreachable"));
    const { token } = signFactoryDeckToken(FAKE_RUN_ID);

    const res = await agent.get(`/api/internal/lb-deck-payload?token=${encodeURIComponent(token)}`);

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/R2 unreachable/);
  });
});

describe("GET /api/internal/lb-deck-payload — factory token, signature failures", () => {
  it("returns 401 with `expired` reason for an expired factory token", async () => {
    // TTL of 0ms → expires immediately
    const { token } = signFactoryDeckToken(FAKE_RUN_ID, 0);
    // Wait one tick so Date.now() > expiresAtMs
    await new Promise((r) => setTimeout(r, 5));
    // Legacy fallback verifier rejects too — expired factory token shouldn't
    // accidentally pass the lb-kind check.
    mockVerifyLbDeckToken.mockReturnValue({ ok: false, reason: "wrong-kind" });

    const res = await agent.get(`/api/internal/lb-deck-payload?token=${encodeURIComponent(token)}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/expired/i);
    expect(mockGetSlideFactoryRunById).not.toHaveBeenCalled();
  });

  it("returns 401 with `invalid-signature` reason when sig is tampered", async () => {
    const { token } = signFactoryDeckToken(FAKE_RUN_ID);
    // Tamper with the last character of the signature
    const tampered = token.slice(0, -1) + (token.slice(-1) === "A" ? "B" : "A");
    // Legacy verifier mock — the route falls through after factory sig fails
    mockVerifyLbDeckToken.mockReturnValue({ ok: false, reason: "wrong-kind" });

    const res = await agent.get(`/api/internal/lb-deck-payload?token=${encodeURIComponent(tampered)}`);

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid-signature/i);
    expect(mockGetSlideFactoryRunById).not.toHaveBeenCalled();
  });
});

describe("GET /api/internal/lb-deck-payload — legacy LB token branch", () => {
  it("returns 200 with the legacy payload when token verifies as lb-kind", async () => {
    mockVerifyLbDeckToken.mockReturnValue({ ok: true });
    mockBuildLbPayload.mockResolvedValue(FAKE_LEGACY_PAYLOAD);

    const res = await agent.get("/api/internal/lb-deck-payload?token=lb.fake.token.string");

    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body).toEqual(FAKE_LEGACY_PAYLOAD);
    expect(mockBuildLbPayload).toHaveBeenCalledTimes(1);
    expect(mockBuildLbPayloadFromFactoryRun).not.toHaveBeenCalled();
  });

  it("returns 503 when the legacy payload throws 'not fully configured'", async () => {
    mockVerifyLbDeckToken.mockReturnValue({ ok: true });
    mockBuildLbPayload.mockRejectedValue(
      new Error("LB Slide Deck is not fully configured. Please assign all four properties..."),
    );

    const res = await agent.get("/api/internal/lb-deck-payload?token=lb.fake.token.string");

    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/not fully configured/i);
  });
});

describe("GET /api/internal/lb-deck-payload — unknown / malformed token", () => {
  it("returns 401 when the token matches neither factory nor legacy verifier", async () => {
    mockVerifyLbDeckToken.mockReturnValue({ ok: false, reason: "malformed" });

    const res = await agent.get("/api/internal/lb-deck-payload?token=garbage");

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Invalid LB deck token/);
    expect(mockGetSlideFactoryRunById).not.toHaveBeenCalled();
    expect(mockBuildLbPayload).not.toHaveBeenCalled();
    expect(mockBuildLbPayloadFromFactoryRun).not.toHaveBeenCalled();
  });

  it("returns 401 when token is empty", async () => {
    mockVerifyLbDeckToken.mockReturnValue({ ok: false, reason: "malformed" });

    const res = await agent.get("/api/internal/lb-deck-payload");

    expect(res.status).toBe(401);
  });
});
