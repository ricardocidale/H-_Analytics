/**
 * Task #910 — Reference Brands auto-commit refresh flow regression tests
 *
 * Tests three layers of the reference_brands refresh path:
 *
 * 1. researchReferenceBrands() — unit tests for LLM result parsing,
 *    malformed-JSON fallback, empty-brand fallback, and LLM error fallback.
 *    All paths must return autoCommitted: true.
 *
 * 2. replaceAllReferenceBrands() — unit tests confirming the delete-all-then-
 *    insert semantics: the DB delete is always called, and insert is skipped
 *    only when the brand list is empty.
 *
 * 3. Route response contract — confirms that the endpoint always returns
 *    autoCommitted: true for reference_brands so the frontend knows to skip
 *    the diff/review dialog.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mock state ───────────────────────────────────────────────────────
// vi.hoisted() runs before module imports, making these available in vi.mock()
// factory closures below.
const { mockCreate, mockReplaceAll } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockReplaceAll: vi.fn(),
}));

// ── Module mocks ─────────────────────────────────────────────────────────────
vi.mock('../logger', () => ({
  loggerFor: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('@engine/analyst/identity', () => ({
  ORCHESTRATOR_IDENTITY: { logKey: 'gaspar', name: 'Gaspar' },
}));

vi.mock('../storage', () => ({
  storage: {
    replaceAllReferenceBrands: (...args: unknown[]) => mockReplaceAll(...args),
  },
}));

vi.mock('../ai/clients', () => ({
  getOpenAIClient: () => ({
    chat: { completions: { create: (...args: unknown[]) => mockCreate(...args) } },
  }),
}));

// ── Imports (after mocks are set up) ─────────────────────────────────────────
import { researchReferenceBrands } from '../ai/analyst-table-refresh';
import { WatchdogStorage } from '../storage/intelligence/constants/watchdog';
import type { ReferenceBrand, InsertReferenceBrand } from '@workspace/db';

// ── Fixtures ─────────────────────────────────────────────────────────────────
function makeCurrentBrand(overrides: Partial<ReferenceBrand> = {}): ReferenceBrand {
  return {
    id: 1,
    brandName: 'Axel Hotels',
    niche: 'LGBTQ+ boutique',
    positioningSummary: 'Pioneering LGBTQ+ lifestyle hotels',
    guestSegment: 'LGBTQ+ travellers and allies',
    propertyCount: 7,
    keyCountMin: 80,
    keyCountMax: 150,
    geographicFocus: 'Europe',
    adrUsd: 200,
    occupancyPct: 0.82,
    revparUsd: 164,
    revenueRangeLowUsd: 10_000_000,
    revenueRangeHighUsd: 25_000_000,
    ownershipModel: 'Owner-operated',
    acquisitionContext: null,
    description: 'First international LGBTQ+ hotel chain.',
    referenceDisclaimer: true,
    dataYear: 2024,
    sourceUrls: ['https://axelhotels.com'],
    lastRefreshedAt: new Date('2024-01-01'),
    refreshedByRunId: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeInsertBrand(overrides: Partial<InsertReferenceBrand> = {}): InsertReferenceBrand {
  return {
    brandName: 'Mama Shelter',
    niche: 'Playful urban boutique',
    positioningSummary: 'Affordable chic for urban adventurers',
    guestSegment: 'Young urban travellers',
    propertyCount: 20,
    keyCountMin: 50,
    keyCountMax: 120,
    geographicFocus: 'Global',
    adrUsd: 150,
    occupancyPct: 0.75,
    revparUsd: 112,
    revenueRangeLowUsd: 5_000_000,
    revenueRangeHighUsd: 15_000_000,
    ownershipModel: 'Franchise',
    acquisitionContext: null,
    description: 'Known for bold design and vibrant social spaces.',
    referenceDisclaimer: true,
    dataYear: 2024,
    sourceUrls: ['https://mamashelter.com'],
    lastRefreshedAt: new Date(),
    refreshedByRunId: null,
    ...overrides,
  };
}

function makeLLMBrand() {
  return {
    brandName: 'Mama Shelter',
    niche: 'Playful urban boutique',
    positioningSummary: 'Affordable chic for urban adventurers',
    guestSegment: 'Young urban travellers',
    propertyCount: 20,
    keyCountMin: 50,
    keyCountMax: 120,
    geographicFocus: 'Global',
    adrUsd: 150,
    occupancyPct: 0.75,
    revparUsd: 112,
    revenueRangeLowUsd: 5_000_000,
    revenueRangeHighUsd: 15_000_000,
    ownershipModel: 'Franchise',
    acquisitionContext: null,
    description: 'Known for bold design and vibrant social spaces.',
    dataYear: 2024,
    sourceUrls: ['https://mamashelter.com'],
  };
}

function makeLLMResponse(brands: unknown[] = [makeLLMBrand()]) {
  return {
    choices: [{
      message: {
        content: JSON.stringify({
          brands,
          narration: ['Sourcing brands…', 'Done.'],
          evidence: [{ source: 'Trade Pub', url: 'https://example.com', finding: 'ADR data.' }],
          sourceCount: 1,
        }),
      },
    }],
    usage: { total_tokens: 800 },
  };
}

// Simulate a DB row returned after insert (includes id, createdAt, updatedAt)
function makeReturnedBrand(insert: InsertReferenceBrand, id: number): ReferenceBrand {
  return {
    ...makeCurrentBrand({ ...insert, id }),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ── 1. researchReferenceBrands() unit tests ──────────────────────────────────

describe('researchReferenceBrands()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('happy path: LLM returns valid brands → autoCommitted: true, brands written to DB', async () => {
    const currentBrands = [makeCurrentBrand()];
    const llmResponse = makeLLMResponse();
    mockCreate.mockResolvedValue(llmResponse);
    mockReplaceAll.mockResolvedValue([makeReturnedBrand(makeInsertBrand(), 99)]);

    const result = await researchReferenceBrands(currentBrands);

    expect(result.autoCommitted).toBe(true);
    expect(result.brandCount).toBeGreaterThan(0);
    expect(mockReplaceAll).toHaveBeenCalledOnce();
    expect(Array.isArray(result.proposedRanges)).toBe(true);
    expect(Array.isArray(result.narration)).toBe(true);
    expect(result.narration.length).toBeGreaterThan(0);
  });

  it('happy path: LLM narration is passed through when present', async () => {
    const customNarration = ['Step 1: research', 'Step 2: synthesise'];
    mockCreate.mockResolvedValue({
      ...makeLLMResponse(),
      choices: [{
        message: {
          content: JSON.stringify({
            brands: [makeLLMBrand()],
            narration: customNarration,
            evidence: [],
            sourceCount: 0,
          }),
        },
      }],
    });
    mockReplaceAll.mockResolvedValue([makeReturnedBrand(makeInsertBrand(), 1)]);

    const result = await researchReferenceBrands([]);

    expect(result.narration).toEqual(customNarration);
  });

  it('malformed JSON from LLM → falls back to existing rows, storage NOT called, autoCommitted: true', async () => {
    const currentBrands = [makeCurrentBrand()];
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '{ this is not valid json }' } }],
      usage: { total_tokens: 10 },
    });

    const result = await researchReferenceBrands(currentBrands);

    expect(result.autoCommitted).toBe(true);
    expect(result.brandCount).toBe(currentBrands.length);
    expect(mockReplaceAll).not.toHaveBeenCalled();
    expect(result.sourceCount).toBe(0);
    expect(result.evidence).toEqual([]);
  });

  it('LLM call throws → falls back to existing rows, storage NOT called, autoCommitted: true', async () => {
    const currentBrands = [makeCurrentBrand(), makeCurrentBrand({ id: 2, brandName: 'Selina' })];
    mockCreate.mockRejectedValue(new Error('OpenAI timeout'));

    const result = await researchReferenceBrands(currentBrands);

    expect(result.autoCommitted).toBe(true);
    expect(result.brandCount).toBe(currentBrands.length);
    expect(mockReplaceAll).not.toHaveBeenCalled();
    expect(result.tokensUsed).toBe(0);
    expect(Array.isArray(result.narration)).toBe(true);
  });

  it('empty brands array in LLM response → falls back to re-inserting existing rows', async () => {
    const currentBrands = [makeCurrentBrand(), makeCurrentBrand({ id: 2, brandName: 'Yotel' })];
    mockCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({ brands: [], narration: [], evidence: [], sourceCount: 0 }),
        },
      }],
      usage: { total_tokens: 50 },
    });
    const returnedRows = currentBrands.map((b, i) => makeReturnedBrand(b as unknown as InsertReferenceBrand, i + 10));
    mockReplaceAll.mockResolvedValue(returnedRows);

    const result = await researchReferenceBrands(currentBrands);

    expect(result.autoCommitted).toBe(true);
    // The existing rows are re-inserted (fallback path)
    expect(mockReplaceAll).toHaveBeenCalledOnce();
    const [calledBrands] = mockReplaceAll.mock.calls[0] as [InsertReferenceBrand[]];
    expect(calledBrands).toHaveLength(currentBrands.length);
    expect(calledBrands.map(b => b.brandName)).toEqual(currentBrands.map(b => b.brandName));
  });

  it('proposedRanges always has the right shape per returned brand', async () => {
    const llmResponse = makeLLMResponse([makeLLMBrand()]);
    mockCreate.mockResolvedValue(llmResponse);
    const returnedBrand = makeReturnedBrand(makeInsertBrand(), 42);
    mockReplaceAll.mockResolvedValue([returnedBrand]);

    const result = await researchReferenceBrands([]);

    expect(result.proposedRanges).toHaveLength(1);
    const range = result.proposedRanges[0];
    expect(range.dimensionKey).toBe(`brand_${returnedBrand.id}`);
    expect(range.unit).toBe('properties');
    expect(typeof range.label).toBe('string');
  });
});

// ── 2. replaceAllReferenceBrands() unit tests ────────────────────────────────

describe('replaceAllReferenceBrands()', () => {
  function makeMockDb() {
    const mockReturning = vi.fn();
    const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
    const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
    const mockDelete = vi.fn().mockResolvedValue(undefined);
    return { mockDelete, mockInsert, mockValues, mockReturning, db: { delete: mockDelete, insert: mockInsert } };
  }

  it('non-empty list: calls delete then insert, returns inserted rows', async () => {
    const { db, mockDelete, mockInsert, mockReturning } = makeMockDb();
    const brands = [makeInsertBrand(), makeInsertBrand({ brandName: 'Selina' })];
    const returnedRows = brands.map((b, i) => makeReturnedBrand(b, i + 1));
    mockReturning.mockResolvedValue(returnedRows);

    const store = new WatchdogStorage({ db } as never);
    const result = await store.replaceAllReferenceBrands(brands);

    expect(mockDelete).toHaveBeenCalledOnce();
    expect(mockInsert).toHaveBeenCalledOnce();
    expect(result).toEqual(returnedRows);
  });

  it('empty list: calls delete but skips insert, returns []', async () => {
    const { db, mockDelete, mockInsert } = makeMockDb();

    const store = new WatchdogStorage({ db } as never);
    const result = await store.replaceAllReferenceBrands([]);

    expect(mockDelete).toHaveBeenCalledOnce();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('passes the brand array directly to insert().values()', async () => {
    const { db, mockValues, mockReturning } = makeMockDb();
    const brands = [makeInsertBrand({ brandName: 'Desire Resorts' })];
    mockReturning.mockResolvedValue([makeReturnedBrand(brands[0], 5)]);

    const store = new WatchdogStorage({ db } as never);
    await store.replaceAllReferenceBrands(brands);

    const [passedBrands] = mockValues.mock.calls[0] as [InsertReferenceBrand[]];
    expect(passedBrands).toHaveLength(1);
    expect(passedBrands[0].brandName).toBe('Desire Resorts');
  });
});

// ── 3. Route response contract tests ─────────────────────────────────────────
// These tests verify the shape of what the refresh endpoint returns for
// reference_brands. The route extracts `autoCommitted` from the LLM result
// with: `"autoCommitted" in llmResult ? llmResult.autoCommitted : false`
// Since researchReferenceBrands() always returns autoCommitted: true (proven
// above), these tests confirm the contract is correct by checking the result
// shape directly.

describe('reference_brands refresh route — autoCommitted response contract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('researchReferenceBrands result always has autoCommitted: true (happy path)', async () => {
    mockCreate.mockResolvedValue(makeLLMResponse());
    mockReplaceAll.mockResolvedValue([makeReturnedBrand(makeInsertBrand(), 1)]);

    const result = await researchReferenceBrands([]);

    // The route does: "autoCommitted" in llmResult ? llmResult.autoCommitted : false
    // This contract ensures the endpoint returns autoCommitted: true.
    expect('autoCommitted' in result).toBe(true);
    expect(result.autoCommitted).toBe(true);
  });

  it('researchReferenceBrands result always has autoCommitted: true (LLM error fallback)', async () => {
    mockCreate.mockRejectedValue(new Error('network error'));

    const result = await researchReferenceBrands([makeCurrentBrand()]);

    expect('autoCommitted' in result).toBe(true);
    expect(result.autoCommitted).toBe(true);
  });

  it('researchReferenceBrands result always has autoCommitted: true (malformed JSON fallback)', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: 'not json' } }],
      usage: { total_tokens: 5 },
    });

    const result = await researchReferenceBrands([]);

    expect('autoCommitted' in result).toBe(true);
    expect(result.autoCommitted).toBe(true);
  });

  // The runtime enforcement that POST /api/admin/analyst-tables/reference_brands/commit
  // returns 409 is covered by the route integration test in reference-brands-route.test.ts
  // ("POST /api/admin/analyst-tables/reference_brands/commit — 409 guard").
});
