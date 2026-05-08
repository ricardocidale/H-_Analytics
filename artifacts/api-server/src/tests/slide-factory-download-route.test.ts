/**
 * Route integration tests for GET /api/lb-slides/factory/runs/:id/download.
 *
 * Covers the five observable contract branches:
 *   - 400 when the path id is invalid
 *   - 404 when the run is not owned by the caller (or doesn't exist)
 *   - 409 when the run is not in 'complete' state
 *   - 422 when status is 'complete' but deckR2Key is null
 *   - 200 with PDF body when status is 'complete' and deckR2Key is set
 *
 * All heavy dependencies are mocked — no real DB, R2, or auth required.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import supertest from 'supertest';

// ── Hoisted mock state ────────────────────────────────────────────────────────
const { mockGetSlideFactoryRun, mockDownloadBuffer } = vi.hoisted(() => ({
  mockGetSlideFactoryRun: vi.fn(),
  mockDownloadBuffer: vi.fn(),
}));

// ── Module mocks ─────────────────────────────────────────────────────────────
vi.mock('../logger', () => ({
  loggerFor: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const FAKE_USER_ID = 7;
vi.mock('../auth', () => ({
  requireAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
  getAuthUser: () => ({ id: FAKE_USER_ID, role: 'admin' }),
}));

vi.mock('../routes/helpers', () => ({
  logAndSendError: (res: Response, message: string, err: unknown) => {
    res.status(500).json({ error: `${message}: ${String(err)}` });
  },
  logActivity: vi.fn(),
  parseRouteId: (raw: string | string[] | undefined): number | null => {
    if (raw == null) return null;
    const s = Array.isArray(raw) ? raw[0] : raw;
    const n = Number(s);
    return Number.isInteger(n) && n > 0 ? n : null;
  },
  zodErrorMessage: (err: unknown) => String(err),
}));

vi.mock('../storage', () => ({
  storage: {},
}));

vi.mock('../storage/slide-factory-runs', () => ({
  createSlideFactoryRun: vi.fn(),
  getSlideFactoryRun: (...args: unknown[]) => mockGetSlideFactoryRun(...args),
  listSlideFactoryRuns: vi.fn(),
  updateSlideFactoryRun: vi.fn(),
}));

vi.mock('../providers/storage', () => ({
  getStorageProviderAsync: () =>
    Promise.resolve({
      downloadBuffer: (...args: unknown[]) => mockDownloadBuffer(...args),
    }),
}));

vi.mock('../slides/lorenzo-ingestion', () => ({ runLorenzoIngestion: vi.fn() }));
vi.mock('../slides/lucca-draft', () => ({ runLuccaDraft: vi.fn() }));
vi.mock('../slides/marco', () => ({ runMarco: vi.fn() }));

// ── Import the router after mocks ────────────────────────────────────────────
import { slideFactoryRouter } from '../routes/slide-factory';

// ── Test app ─────────────────────────────────────────────────────────────────
let agent: ReturnType<typeof supertest>;

beforeAll(() => {
  const app = express();
  app.use(express.json());
  app.use(slideFactoryRouter);
  agent = supertest(app);
});

beforeEach(() => {
  mockGetSlideFactoryRun.mockReset();
  mockDownloadBuffer.mockReset();
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/lb-slides/factory/runs/:id/download — invalid path id', () => {
  it('returns 400 when id is not a positive integer', async () => {
    const res = await agent.get('/api/lb-slides/factory/runs/abc/download');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid run id/i);
    expect(mockGetSlideFactoryRun).not.toHaveBeenCalled();
  });
});

describe('GET /api/lb-slides/factory/runs/:id/download — ownership / not found', () => {
  it('returns 404 when getSlideFactoryRun resolves null (not owned, or absent)', async () => {
    mockGetSlideFactoryRun.mockResolvedValue(null);
    const res = await agent.get('/api/lb-slides/factory/runs/42/download');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
    expect(mockGetSlideFactoryRun).toHaveBeenCalledWith(42, FAKE_USER_ID);
  });
});

describe('GET /api/lb-slides/factory/runs/:id/download — state machine guards', () => {
  it('returns 409 when the run is in a non-complete state (state-machine conflict)', async () => {
    mockGetSlideFactoryRun.mockResolvedValue({
      id: 5, userId: FAKE_USER_ID, status: 'building', deckR2Key: null,
    });
    const res = await agent.get('/api/lb-slides/factory/runs/5/download');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/run status is building/i);
    expect(mockDownloadBuffer).not.toHaveBeenCalled();
  });

  it('returns 409 for status=draft_review (any non-complete state, not just building)', async () => {
    mockGetSlideFactoryRun.mockResolvedValue({
      id: 5, userId: FAKE_USER_ID, status: 'draft_review', deckR2Key: null,
    });
    const res = await agent.get('/api/lb-slides/factory/runs/5/download');
    expect(res.status).toBe(409);
  });

  it('returns 422 when status is complete but deckR2Key is null (precondition pending)', async () => {
    mockGetSlideFactoryRun.mockResolvedValue({
      id: 5, userId: FAKE_USER_ID, status: 'complete', deckR2Key: null,
    });
    const res = await agent.get('/api/lb-slides/factory/runs/5/download');
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/not yet generated/i);
    expect(mockDownloadBuffer).not.toHaveBeenCalled();
  });
});

describe('GET /api/lb-slides/factory/runs/:id/download — happy path', () => {
  const PDF_MAGIC = Buffer.from('%PDF-1.7\n%fake content');

  it('returns the PDF buffer with correct Content-Type and Content-Disposition headers', async () => {
    mockGetSlideFactoryRun.mockResolvedValue({
      id: 5, userId: FAKE_USER_ID, status: 'complete', deckR2Key: 'factory-runs/5/deck.pdf',
    });
    mockDownloadBuffer.mockResolvedValue({ buffer: PDF_MAGIC });

    const res = await agent.get('/api/lb-slides/factory/runs/5/download').buffer(true);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="slide-deck-run-5.pdf"',
    );
    expect(res.headers['cache-control']).toBe('no-store');
    expect(mockDownloadBuffer).toHaveBeenCalledWith('factory-runs/5/deck.pdf');
    expect(res.body.toString()).toContain('%PDF-1.7');
  });

  it('uses run.id (server-generated integer) in the Content-Disposition filename, not user input', async () => {
    mockGetSlideFactoryRun.mockResolvedValue({
      id: 999, userId: FAKE_USER_ID, status: 'complete', deckR2Key: 'k',
    });
    mockDownloadBuffer.mockResolvedValue({ buffer: PDF_MAGIC });

    const res = await agent.get('/api/lb-slides/factory/runs/999/download').buffer(true);

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="slide-deck-run-999.pdf"',
    );
  });
});

describe('GET /api/lb-slides/factory/runs/:id/download — R2 fetch failure', () => {
  it('returns 500 via logAndSendError when downloadBuffer throws', async () => {
    mockGetSlideFactoryRun.mockResolvedValue({
      id: 5, userId: FAKE_USER_ID, status: 'complete', deckR2Key: 'k',
    });
    mockDownloadBuffer.mockRejectedValue(new Error('R2 unreachable'));

    const res = await agent.get('/api/lb-slides/factory/runs/5/download');
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/Failed to download factory deck/);
  });
});
