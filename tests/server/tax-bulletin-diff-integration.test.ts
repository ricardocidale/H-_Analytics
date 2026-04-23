/**
 * Phase 2c integration tests for `proposeConstantRegeneration` —
 * the call site where Helena's deterministic tax-bulletin-diff is
 * preferred over the LLM Analyst path.
 *
 * Three behaviors covered (one per subtest):
 *
 *   1. Deterministic SUCCESS — tool parses, persists, returns a proposal
 *      tagged `metadata.toolId = "tax-bulletin-diff"`. The LLM Analyst is
 *      never invoked.
 *
 *   2. Cache write FAILURE — must LOUD-FAIL (throw). The doctrine forbids
 *      silently downgrading to LLM here because a missing cache write
 *      means the next "diff" cannot be reproduced. The audit run records
 *      `stage: "cache-upsert"` so the failure is attributable.
 *
 *   3. Low parseConfidence FALLBACK — tool returns a partial parse below
 *      `MIN_PARSE_CONFIDENCE_FOR_TRUST` (1.0 in this build); caller falls
 *      through to the LLM Analyst path which stamps
 *      `metadata.toolId = "llm-fallback"`.
 *
 * All three avoid live HTTP / live DB / live LLM by mocking
 * `../../server/storage`, the GroundedResearchService, and the
 * Anthropic client seam returned by `server/ai/clients`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ──────────────────────────────────────────────────────────────────────────
// Storage mock — captures every createResearchRun call so tests can assert
// metadata, status, and call ordering. `_taxCache` is a tiny in-memory
// upsert; tests can swap `_upsertImpl` to simulate a failure without
// rewriting the surface.
// ──────────────────────────────────────────────────────────────────────────
type CreatedRun = { id: number; status: string; metadata: Record<string, unknown>; error?: string };
const _runs: CreatedRun[] = [];
let _taxCacheRow: { country: string; subdivision: string; bulletinHash: string; parsedValues: Record<string, unknown>; fetchedAt: Date } | null = null;
let _upsertImpl: (data: any) => Promise<any> = async (data) => {
  _taxCacheRow = {
    country: data.country,
    subdivision: data.subdivision ?? "",
    bulletinHash: data.bulletinHash,
    parsedValues: data.parsedValues,
    fetchedAt: new Date(),
  };
  return _taxCacheRow;
};

vi.mock("../../server/storage", () => ({
  storage: {
    getModelConstantOverrides: vi.fn(async () => []),
    getTaxBulletinCache: vi.fn(async () => _taxCacheRow ?? undefined),
    upsertTaxBulletinCache: vi.fn(async (data: any) => _upsertImpl(data)),
    createResearchRun: vi.fn(async (data: any) => {
      const run = { id: _runs.length + 1, status: data.status, metadata: data.metadata ?? {}, error: data.error };
      _runs.push(run);
      return run;
    }),
  },
}));

// LLM seam — the production module dynamic-imports its analyst inside the
// function body. We don't need to mock it for tests where the deterministic
// path returns first; for the fallback path test we just confirm that the
// proposal carries the LLM toolId. To keep this test isolated from network
// LLM calls we mock the GroundedResearchService and the analyst caller.
vi.mock("../../server/services/GroundedResearchService", () => ({
  GroundedResearchService: class {
    isAvailable() { return false; }
    async search() { return []; }
  },
}));

// Mock the Anthropic client seam used by regenerate-constants. The
// production code calls `getAnthropicClient().messages.create(...)` and
// only needs a JSON response shaped like AnalystJson back.
const _anthropicCalls: any[] = [];
vi.mock("../../server/ai/clients", () => ({
  getAnthropicClient: () => ({
    messages: {
      create: vi.fn(async (req: any) => {
        _anthropicCalls.push(req);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              value: 0.30,
              authority: "LLM-Fallback-Authority",
              referenceUrl: "https://example.com/llm",
              reasoning: "fallback path",
            }),
          }],
        };
      }),
    },
  }),
  normalizeModelId: (id: string) => id,
}));

vi.mock("../../server/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { proposeConstantRegeneration } from "../../server/ai/regenerate-constants";
import type { BulletinFetcher } from "../../server/ai/tools/tax-bulletin-diff";

const FULL_BULLETIN = `
  Corporations: The federal corporate income tax rate is 21% for tax years
  beginning after December 31, 2017. Capital gains for C corporations are
  taxed at the federal corporate rate of 21%.
`;

const PARTIAL_BULLETIN = `
  Corporations: The federal corporate income tax rate is 21% for tax years
  beginning after December 31, 2017.
`; // Only taxRate parses → parseConfidence = 1/2 = 0.5 < 1.0 trust
   // threshold → caller MUST fall through to LLM.

const fetcher = (text: string, status = 200): BulletinFetcher =>
  async () => ({ status, text });

beforeEach(() => {
  _runs.length = 0;
  _anthropicCalls.length = 0;
  _taxCacheRow = null;
  _upsertImpl = async (data) => {
    _taxCacheRow = {
      country: data.country,
      subdivision: data.subdivision ?? "",
      bulletinHash: data.bulletinHash,
      parsedValues: data.parsedValues,
      fetchedAt: new Date(),
    };
    return _taxCacheRow;
  };
});

describe("proposeConstantRegeneration — Helena deterministic path", () => {
  it("succeeds via tax-bulletin-diff and stamps toolId in research_run metadata", async () => {
    const proposal = await proposeConstantRegeneration({
      key: "taxRate",
      country: "United States",
      subdivision: null,
      overrides: [],
      bulletinFetcher: fetcher(FULL_BULLETIN),
    });
    expect(proposal.value).toBe(0.21);
    expect(proposal.authority).toMatch(/Internal Revenue|IRS/i);
    expect(proposal.specialistId).toBe("constants.tax-research");
    expect(_runs).toHaveLength(1);
    expect(_runs[0].status).toBe("completed");
    expect(_runs[0].metadata.toolId).toBe("tax-bulletin-diff");
    // Deterministic path NEVER stamps the LLM fallback id.
    expect(_runs[0].metadata.toolId).not.toBe("llm-fallback");
    // Cache row was upserted so the next refresh produces a real diff.
    expect(_taxCacheRow).not.toBeNull();
  });

  it("LOUD-FAILS when cache write fails (does NOT silently fall back to LLM)", async () => {
    _upsertImpl = async () => { throw new Error("simulated db down"); };
    await expect(
      proposeConstantRegeneration({
        key: "taxRate",
        country: "United States",
        subdivision: null,
        overrides: [],
        bulletinFetcher: fetcher(FULL_BULLETIN),
      }),
    ).rejects.toThrow(/cache persistence failed/i);
    // Audit run tagged with the cache-upsert stage and the deterministic toolId.
    const cacheFailRun = _runs.find((r) =>
      r.metadata?.stage === "cache-upsert" && r.metadata?.toolId === "tax-bulletin-diff",
    );
    expect(cacheFailRun).toBeDefined();
    expect(cacheFailRun!.status).toBe("failed");
  });

  it("partial parse (parseConfidence below trust threshold) → falls through to LLM with toolId=llm-fallback", async () => {
    const proposal = await proposeConstantRegeneration({
      key: "taxRate",
      country: "United States",
      subdivision: null,
      overrides: [],
      bulletinFetcher: fetcher(PARTIAL_BULLETIN),
    });
    // LLM mock returns 0.30; deterministic path would have returned 0.21.
    expect(proposal.value).toBe(0.30);
    expect(proposal.authority).toBe("LLM-Fallback-Authority");
    expect(_anthropicCalls).toHaveLength(1);
    // The LLM-path research_run is the one tagged with the fallback id.
    const llmRun = _runs.find((r) => r.metadata?.toolId === "llm-fallback");
    expect(llmRun).toBeDefined();
    expect(llmRun!.status).toBe("completed");
    // The deterministic tool itself should NOT have stamped a successful
    // research_run on this code path (it returned null before persisting).
    const detRun = _runs.find((r) => r.metadata?.toolId === "tax-bulletin-diff");
    expect(detRun).toBeUndefined();
    // No cache row was upserted on the partial-parse path.
    expect(_taxCacheRow).toBeNull();
  });
});
