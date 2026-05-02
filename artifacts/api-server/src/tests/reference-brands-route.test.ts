/**
 * Task #910 — Route integration test: POST /api/admin/analyst-tables/reference_brands/refresh
 *
 * Tests that the actual route handler returns `autoCommitted: true` in its
 * JSON response for the reference_brands tableId. All heavy dependencies are
 * mocked so no real DB, LLM, or auth is required.
 *
 * This test exercises the full route handler path including:
 *   - Routing by tableId ("reference_brands" branch)
 *   - Extraction of autoCommitted from the LLM result
 *   - Serialisation into the JSON response body
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import supertest from 'supertest';

// ── Hoisted mock state ────────────────────────────────────────────────────────
const { mockResearchReferenceBrands, mockNarrateHandoff } = vi.hoisted(() => ({
  mockResearchReferenceBrands: vi.fn(),
  mockNarrateHandoff: vi.fn(),
}));

// ── Module mocks (all must be declared before any imports from those modules) ─
vi.mock('../logger', () => ({
  loggerFor: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@engine/analyst/identity', () => ({
  ORCHESTRATOR_IDENTITY: { logKey: 'gaspar', name: 'Gaspar' },
}));

vi.mock('../ai/clients', () => ({
  getOpenAIClient: () => ({
    chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [], usage: { total_tokens: 0 } }) } },
  }),
}));

vi.mock('../storage', () => ({
  storage: {
    getReferenceBrands: vi.fn().mockResolvedValue([]),
    getCapitalRaiseBenchmarks: vi.fn().mockResolvedValue([]),
    getExitMultiples: vi.fn().mockResolvedValue([]),
    finalizeAnalystRefreshAuditLog: vi.fn().mockResolvedValue(undefined),
    getIdentityOverride: vi.fn().mockResolvedValue(null),
    logActivity: vi.fn().mockResolvedValue(undefined),
    replaceAllReferenceBrands: vi.fn().mockResolvedValue([]),
    getAnalystRefreshSettings: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../auth', () => ({
  requireAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../routes/helpers', () => ({
  logAndSendError: (_res: Response, _msg: string, err: unknown) => {
    (_res as Response).status(500).json({ error: String(err) });
  },
  logActivity: vi.fn(),
}));

vi.mock('../lib/specialist-identity-resolver', () => ({
  narrateSpecialistHandoff: (...args: unknown[]) => mockNarrateHandoff(...args),
}));

vi.mock('../ai/ambient/capital-raise-watchdog', () => ({
  runCapitalRaiseWatchdogCycle: vi.fn(),
}));

vi.mock('../middleware/analyst-refresh-guards', () => {
  const ANALYST_TABLE_ALLOW_LIST = ['capital_raise_benchmarks', 'exit_multiples', 'reference_brands'];
  return {
    ANALYST_TABLE_ALLOW_LIST,
    analystRefreshGuards: () => [
      // Passthrough: sets analystRefreshAuditId so the handler has an auditId
      (_req: Request, res: Response, next: NextFunction) => {
        res.locals.analystRefreshAuditId = 42;
        next();
      },
    ],
    csrfTokenGuard: (_req: Request, _res: Response, next: NextFunction) => next(),
    releaseInFlight: vi.fn(),
  };
});

vi.mock('../ai/analyst-table-refresh', () => ({
  researchReferenceBrands: (...args: unknown[]) => mockResearchReferenceBrands(...args),
  researchCapitalRaiseBenchmarks: vi.fn().mockResolvedValue({
    proposedRanges: [], narration: [], sourceCount: 0, tokensUsed: 0, evidence: [],
  }),
  researchExitMultiples: vi.fn().mockResolvedValue({
    proposedRanges: [], narration: [], sourceCount: 0, tokensUsed: 0, evidence: [],
  }),
}));

// ── Import route registration (after all mocks) ───────────────────────────────
import { registerAdminAnalystTableRoutes } from '../routes/admin/analyst-tables';

// ── Build the test app once ───────────────────────────────────────────────────
let agent: ReturnType<typeof supertest>;

beforeAll(() => {
  const app = express();
  app.use(express.json());
  registerAdminAnalystTableRoutes(app);
  agent = supertest(app);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/admin/analyst-tables/reference_brands/refresh — route integration', () => {
  it('returns autoCommitted: true in the JSON response body', async () => {
    mockResearchReferenceBrands.mockResolvedValue({
      autoCommitted: true as const,
      brandCount: 18,
      proposedRanges: [{ dimensionKey: 'brand_1', label: 'Axel Hotels · LGBTQ+', unit: 'properties', valueLow: 80, valueMid: 7, valueHigh: 150 }],
      narration: ['Sourcing…', 'Done.'],
      sourceCount: 3,
      tokensUsed: 800,
      evidence: [{ source: 'Trade Pub', finding: 'ADR data.' }],
    });
    mockNarrateHandoff.mockResolvedValue(null);

    const res = await agent
      .post('/api/admin/analyst-tables/reference_brands/refresh')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.tableId).toBe('reference_brands');
    expect(res.body.autoCommitted).toBe(true);
  });

  it('response includes proposedRanges and narration arrays', async () => {
    const proposedRanges = [
      { dimensionKey: 'brand_1', label: 'Axel Hotels', unit: 'properties', valueLow: null, valueMid: 7, valueHigh: null },
      { dimensionKey: 'brand_2', label: 'Mama Shelter', unit: 'properties', valueLow: 50, valueMid: 20, valueHigh: 120 },
    ];
    mockResearchReferenceBrands.mockResolvedValue({
      autoCommitted: true as const,
      brandCount: 2,
      proposedRanges,
      narration: ['Research step 1', 'Research step 2'],
      sourceCount: 2,
      tokensUsed: 500,
      evidence: [],
    });
    mockNarrateHandoff.mockResolvedValue('Gaspar: Reference Brands refresh complete.');

    const res = await agent
      .post('/api/admin/analyst-tables/reference_brands/refresh')
      .send({});

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.proposedRanges)).toBe(true);
    expect(res.body.proposedRanges).toHaveLength(2);
    expect(Array.isArray(res.body.narration)).toBe(true);
    // narrateSpecialistHandoff result is prepended to narration
    expect(res.body.narration[0]).toContain('Gaspar');
  });

  it('autoCommitted is false for non-auto-commit tables (capital_raise_benchmarks)', async () => {
    // Verify the route correctly sets autoCommitted: false when not present in LLM result
    const { researchCapitalRaiseBenchmarks } = await import('../ai/analyst-table-refresh');
    (researchCapitalRaiseBenchmarks as ReturnType<typeof vi.fn>).mockResolvedValue({
      proposedRanges: [],
      narration: ['Capital raise research…'],
      sourceCount: 1,
      tokensUsed: 200,
      evidence: [],
      // No `autoCommitted` field — route should default to false
    });
    mockNarrateHandoff.mockResolvedValue(null);

    const res = await agent
      .post('/api/admin/analyst-tables/capital_raise_benchmarks/refresh')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.autoCommitted).toBe(false);
  });
});

describe('POST /api/admin/analyst-tables/reference_brands/commit — 409 guard', () => {
  it('returns 409 with a descriptive error when trying to commit reference_brands', async () => {
    // reference_brands is auto-committed during /refresh; there is no staged diff
    // to approve/discard, so the commit endpoint must actively reject it.
    const res = await agent
      .post('/api/admin/analyst-tables/reference_brands/commit')
      .send({ proposedRanges: [] });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/auto-committed/i);
    expect(res.body.error).toMatch(/reference_brands/i);
  });
});
