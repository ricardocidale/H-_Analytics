/**
 * Route integration test: POST /api/lb-slides/factory/runs/:id/slots/:key/suggest
 *
 * Verifies:
 *   - 409 when run status is not "complete"
 *   - 404 when slot key is not in luccaDraft
 *   - 200 with { suggestion } on a successful LLM call
 *   - 429 when a duplicate in-flight request is made for the same run+slot
 *   - 502 when the LLM call fails
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import supertest from "supertest";

// ── Hoisted mock state ────────────────────────────────────────────────────────
const { mockGetSlideFactoryRun, mockResolveLlmFor, mockAnthropicCreate } = vi.hoisted(() => ({
  mockGetSlideFactoryRun: vi.fn(),
  mockResolveLlmFor: vi.fn(),
  mockAnthropicCreate: vi.fn(),
}));

// ── Module mocks ──────────────────────────────────────────────────────────────
vi.mock("../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  loggerFor: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock("../auth", () => ({
  requireAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
  getAuthUser: (_req: Request) => ({ id: 1, email: "admin@test.com" }),
}));

vi.mock("../storage/slide-factory-runs", () => ({
  getSlideFactoryRun: (...args: unknown[]) => mockGetSlideFactoryRun(...args),
}));

vi.mock("../ai/llm-config-resolver", () => ({
  resolveLlmFor: (...args: unknown[]) => mockResolveLlmFor(...args),
}));

vi.mock("../ai/clients", () => ({
  getAnthropicClient: () => ({
    messages: { create: (...args: unknown[]) => mockAnthropicCreate(...args) },
  }),
  getOpenAIClient: () => ({
    chat: { completions: { create: vi.fn() } },
  }),
  getGeminiClient: () => ({
    models: { generateContent: vi.fn() },
  }),
}));

vi.mock("./helpers", () => ({
  parseRouteId: (s: string) => {
    const n = parseInt(s, 10);
    return isNaN(n) ? null : n;
  },
  logAndSendError: (_res: Response, _msg: string, err: unknown) => {
    (_res as Response).status(500).json({ error: String(err) });
  },
  logActivity: vi.fn(),
}));

// ── Import after mocks ────────────────────────────────────────────────────────
import { registerSlideFactorySuggestRoutes } from "../routes/slide-factory-suggest";

// ── Test app ──────────────────────────────────────────────────────────────────
let agent: ReturnType<typeof supertest>;

beforeAll(() => {
  const app = express();
  app.use(express.json());
  registerSlideFactorySuggestRoutes(app);
  agent = supertest(app);
});

// ── Shared fixture ────────────────────────────────────────────────────────────
const BASE_RUN = {
  id: 42,
  userId: 1,
  status: "complete",
  luccaDraft: {
    "slide1.headerSubtitle": {
      value: "A boutique retreat in the heart of the city",
      approved: true,
      approvedAt: null,
      source: "lucca",
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveLlmFor.mockResolvedValue({ vendor: "anthropic", modelId: "claude-opus-4-6", modelSlug: "claude-opus-4-6" });
  mockAnthropicCreate.mockResolvedValue({
    content: [{ type: "text", text: "An intimate urban sanctuary crafted for the discerning traveller." }],
    stop_reason: "end_turn",
    usage: { input_tokens: 50, output_tokens: 20 },
  });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/lb-slides/factory/runs/:id/slots/:key/suggest", () => {
  describe("409 — status not complete", () => {
    it("returns 409 when run status is draft_review", async () => {
      mockGetSlideFactoryRun.mockResolvedValue({ ...BASE_RUN, status: "draft_review" });

      const res = await agent.post("/api/lb-slides/factory/runs/42/slots/slide1.headerSubtitle/suggest");

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/complete/i);
    });

    it("returns 409 when run status is building", async () => {
      mockGetSlideFactoryRun.mockResolvedValue({ ...BASE_RUN, status: "building" });

      const res = await agent.post("/api/lb-slides/factory/runs/42/slots/slide1.headerSubtitle/suggest");

      expect(res.status).toBe(409);
    });
  });

  describe("404 — slot key not in draft", () => {
    it("returns 404 when slot key does not exist in luccaDraft", async () => {
      mockGetSlideFactoryRun.mockResolvedValue(BASE_RUN);

      const res = await agent.post("/api/lb-slides/factory/runs/42/slots/slide99.nonExistent/suggest");

      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/slide99\.nonExistent/);
    });

    it("returns 404 when run has no luccaDraft", async () => {
      mockGetSlideFactoryRun.mockResolvedValue({ ...BASE_RUN, luccaDraft: null });

      const res = await agent.post("/api/lb-slides/factory/runs/42/slots/slide1.headerSubtitle/suggest");

      expect(res.status).toBe(404);
    });
  });

  describe("200 — successful suggestion", () => {
    it("returns 200 with suggestion text from LLM", async () => {
      mockGetSlideFactoryRun.mockResolvedValue(BASE_RUN);

      const res = await agent.post("/api/lb-slides/factory/runs/42/slots/slide1.headerSubtitle/suggest");

      expect(res.status).toBe(200);
      expect(res.body.suggestion).toBe(
        "An intimate urban sanctuary crafted for the discerning traveller.",
      );
    });

    it("calls resolveLlmFor with 'research-synthesis'", async () => {
      mockGetSlideFactoryRun.mockResolvedValue(BASE_RUN);

      await agent.post("/api/lb-slides/factory/runs/42/slots/slide1.headerSubtitle/suggest");

      expect(mockResolveLlmFor).toHaveBeenCalledWith("research-synthesis");
    });
  });

  describe("429 — duplicate in-flight request", () => {
    /**
     * This test directly exercises the module-level `inFlightSuggestions` Set by
     * making two sequential requests before the in-flight entry is cleared.
     *
     * Full async-overlap testing via supertest is brittle (request-level scheduling
     * makes it hard to guarantee the in-flight guard fires before the second HTTP
     * round-trip completes), so we instead verify:
     *   1. First request succeeds (Set entry added → removed in finally)
     *   2. A deliberately stalled second request gets 429 while a duplicate is "active"
     *
     * We achieve this by using mockAnthropicCreate to immediately reject (simulating
     * a fast failure) on the first call so the in-flight entry is cleared, confirming
     * the guard works on both the success and failure paths.
     *
     * The actual 429 path is exercised by importing inFlightSuggestions directly
     * from the route module in the dedicated stale-state test below.
     */
    it("returns 429 for duplicate run+slot while first request is in-flight (simulated via direct Set manipulation)", async () => {
      // Import the in-flight Set to manipulate it directly — simulates the state
      // that would exist while a concurrent HTTP request is being processed.
      const { inFlightSuggestions: guardSet } = await import("../routes/slide-factory-suggest");
      const guardKey = "42:slide1.headerSubtitle";

      // Pre-populate the guard Set as if a request is already in-flight
      guardSet.add(guardKey);

      try {
        mockGetSlideFactoryRun.mockResolvedValue(BASE_RUN);

        const res = await agent.post("/api/lb-slides/factory/runs/42/slots/slide1.headerSubtitle/suggest");

        expect(res.status).toBe(429);
        expect(res.body.error).toMatch(/already in progress/i);
      } finally {
        // Clean up so subsequent tests are unaffected
        guardSet.delete(guardKey);
      }
    });
  });

  describe("502 — LLM failure", () => {
    it("returns 502 when the LLM call throws", async () => {
      mockGetSlideFactoryRun.mockResolvedValue(BASE_RUN);
      mockAnthropicCreate.mockRejectedValue(new Error("Upstream AI error"));

      const res = await agent.post("/api/lb-slides/factory/runs/42/slots/slide1.headerSubtitle/suggest");

      expect(res.status).toBe(502);
      expect(res.body.error).toMatch(/unavailable/i);
    });

    it("clears in-flight entry after LLM failure so subsequent requests succeed", async () => {
      mockGetSlideFactoryRun.mockResolvedValue(BASE_RUN);
      mockAnthropicCreate
        .mockRejectedValueOnce(new Error("Transient error"))
        .mockResolvedValue({
          content: [{ type: "text", text: "Recovered suggestion" }],
          stop_reason: "end_turn",
          usage: { input_tokens: 50, output_tokens: 10 },
        });

      // First call fails
      const first = await agent.post("/api/lb-slides/factory/runs/42/slots/slide1.headerSubtitle/suggest");
      expect(first.status).toBe(502);

      // Second call should succeed (in-flight cleared in finally)
      const second = await agent.post("/api/lb-slides/factory/runs/42/slots/slide1.headerSubtitle/suggest");
      expect(second.status).toBe(200);
      expect(second.body.suggestion).toBe("Recovered suggestion");
    });
  });

  describe("run not found", () => {
    it("returns 404 when run does not exist", async () => {
      mockGetSlideFactoryRun.mockResolvedValue(null);

      const res = await agent.post("/api/lb-slides/factory/runs/99/slots/slide1.headerSubtitle/suggest");

      expect(res.status).toBe(404);
    });
  });
});
