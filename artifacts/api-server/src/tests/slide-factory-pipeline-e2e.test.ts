/**
 * Slide Factory — E2E pipeline integration test
 *
 * Exercises every route in routes/slide-factory.ts through the full state
 * machine:
 *   new → ingesting → ingested → drafting → draft_review → building → complete
 *   + rebuild loop (complete → rebuilding → complete with fresh deckR2Key)
 *   + status guard 409s and download 422 guard
 *
 * No real network, DB, LLM, Playwright, or R2 calls. Background runners are
 * mocked to update the in-memory store synchronously; a setImmediate drain
 * after each fire-and-forget is sufficient to observe the downstream state.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import supertest from 'supertest';

// ── Hoisted state (must be available inside vi.mock factory closures) ────────
const { store, getId, STUB_LUCCA_DRAFT, STUB_AGENT_RESULTS } = vi.hoisted(() => {
  const _store = new Map<number, Record<string, unknown>>();
  let _nextId = 1;

  const _STUB_LUCCA_DRAFT: Record<string, unknown> = {
    'slide1.headerSubtitle':          { value: 'stub', approved: false, approvedAt: null, source: 'lucca' },
    'slide1.visionBullets':           { value: '• Bullet 1\n• Bullet 2\n• Bullet 3', approved: false, approvedAt: null, source: 'lucca' },
    'slide2.operationalModelText':    { value: 'stub', approved: false, approvedAt: null, source: 'lucca' },
    'slide2.revenueBullet':           { value: 'stub', approved: false, approvedAt: null, source: 'lucca' },
    'slide2.programmingBullet':       { value: 'stub', approved: false, approvedAt: null, source: 'lucca' },
    'slide3.conceptParagraph':        { value: 'stub', approved: false, approvedAt: null, source: 'lucca' },
    'slide3.marketRationale':         { value: 'stub', approved: false, approvedAt: null, source: 'lucca' },
    'slide3.reasons':                 { value: '[{"label":"stub","detail":"stub"}]', approved: false, approvedAt: null, source: 'lucca' },
    'slide3.closingLine':             { value: 'stub', approved: false, approvedAt: null, source: 'lucca' },
    'slide4.sectionSubtitle':         { value: 'stub', approved: false, approvedAt: null, source: 'lucca' },
    'slide5.transformationDescription': { value: 'stub', approved: false, approvedAt: null, source: 'lucca' },
    'slide5.transformationRows':      { value: '[{"feature":"stub","existing":"stub","proposed":"stub"}]', approved: false, approvedAt: null, source: 'lucca' },
    'slide6.disclaimer':              { value: 'stub', approved: false, approvedAt: null, source: 'lucca' },
  };

  const iso = new Date().toISOString();
  const approvedSlot = { status: 'approved', pixelDiffPct: 0, mayaVerdict: 'ok', mayaNotes: null, approvedAt: iso, errorMessage: null };
  const _STUB_AGENT_RESULTS: Record<string, unknown> = {
    slide1: approvedSlot, slide2: approvedSlot, slide3: approvedSlot,
    slide4: approvedSlot, slide5: approvedSlot, slide6: approvedSlot,
  };

  return { store: _store, getId: () => _nextId++, STUB_LUCCA_DRAFT: _STUB_LUCCA_DRAFT, STUB_AGENT_RESULTS: _STUB_AGENT_RESULTS };
});

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../auth', () => ({
  requireAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
  getAuthUser: () => ({ id: 1, role: 'admin' }),
}));

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  loggerFor: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock('../storage', () => ({
  storage: {
    getProperty: vi.fn((propId: number) => Promise.resolve({ id: propId, userId: 1, name: 'stub' })),
    logActivity: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../storage/slide-factory-runs', () => ({
  createSlideFactoryRun: vi.fn((userId: number) => {
    const id = getId();
    const run: Record<string, unknown> = {
      id, userId, status: 'new',
      briefR2Key: null, briefFilename: null, briefAccepted: false,
      luccaDraft: null, agentResults: null, deckR2Key: null,
      canonicalSpec: null, canonicalPngKeys: null,
      slide1PropertyId: null, slide2PropertyId: null, slide3PropertyId: null, slide5PropertyId: null,
      startedAt: null, completedAt: null, createdAt: new Date(), updatedAt: new Date(),
    };
    store.set(id, run);
    return Promise.resolve(run);
  }),
  getSlideFactoryRun: vi.fn((id: number) => Promise.resolve(store.get(id) ?? null)),
  getSlideFactoryRunById: vi.fn((id: number) => Promise.resolve(store.get(id) ?? null)),
  listSlideFactoryRuns: vi.fn(() => Promise.resolve([...store.values()])),
  updateSlideFactoryRun: vi.fn((id: number, patch: Record<string, unknown>) => {
    const existing = store.get(id) ?? {};
    const updated = { ...existing, ...patch };
    store.set(id, updated);
    return Promise.resolve(updated);
  }),
  updateAgentResult: vi.fn((id: number, slideNum: string, result: unknown) => {
    const run = store.get(id) ?? {};
    const agentResults = { ...((run.agentResults as Record<string, unknown>) ?? {}), [slideNum]: result };
    const updated = { ...run, agentResults };
    store.set(id, updated);
    return Promise.resolve(updated);
  }),
}));

vi.mock('../slides/lorenzo-ingestion', () => ({
  runLorenzoIngestion: vi.fn(async (id: number) => {
    const run = store.get(id) ?? {};
    store.set(id, { ...run, status: 'ingested', canonicalSpec: { version: 1 }, canonicalPngKeys: [] });
  }),
}));

vi.mock('../slides/lucca-draft', () => ({
  runLuccaDraft: vi.fn(async (id: number) => {
    const run = store.get(id) ?? {};
    store.set(id, { ...run, status: 'draft_review', luccaDraft: STUB_LUCCA_DRAFT });
  }),
}));

vi.mock('../slides/marco', () => ({
  runMarco: vi.fn(async (id: number) => {
    const run = store.get(id) ?? {};
    store.set(id, {
      ...run,
      status: 'complete',
      deckR2Key: `factory-runs/${id}/deck.pdf`,
      completedAt: new Date(),
      agentResults: STUB_AGENT_RESULTS,
    });
  }),
}));

vi.mock('../slides/minions/franco', () => ({
  runFranco: vi.fn(async (id: number) => ({ deckR2Key: `factory-runs/${id}/deck-v2.pdf` })),
}));

vi.mock('../providers/storage', () => ({
  getStorageProviderAsync: vi.fn(() =>
    Promise.resolve({
      downloadBuffer: vi.fn(() => Promise.resolve({ buffer: Buffer.from('%PDF-1.4 mock') })),
      uploadBuffer: vi.fn(() => Promise.resolve()),
    }),
  ),
}));

// ── Import the router (after all mocks) ──────────────────────────────────────
import { slideFactoryRouter } from '../routes/slide-factory';

// ── App setup ─────────────────────────────────────────────────────────────────
let agent: ReturnType<typeof supertest>;

beforeAll(() => {
  const app = express();
  app.use(express.json());
  app.use('/', slideFactoryRouter);
  agent = supertest(app);
});

// Drain the microtask + setImmediate queue so fire-and-forget runners complete.
const drain = () => new Promise<void>((r) => setImmediate(r));

// ── Stub helper: insert a run directly with a specified status ─────────────
function insertRun(status: string, extra: Record<string, unknown> = {}): number {
  const id = getId();
  store.set(id, {
    id, userId: 1, status,
    briefR2Key: 'briefs/stub.pdf', briefFilename: 'stub.pdf', briefAccepted: true,
    luccaDraft: STUB_LUCCA_DRAFT, agentResults: null, deckR2Key: null,
    canonicalSpec: null, canonicalPngKeys: null,
    slide1PropertyId: null, slide2PropertyId: null, slide3PropertyId: null, slide5PropertyId: null,
    startedAt: new Date(), completedAt: null, createdAt: new Date(), updatedAt: new Date(),
    ...extra,
  });
  return id;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HAPPY PATH — new → complete → download
// ═══════════════════════════════════════════════════════════════════════════════
describe('Slide factory pipeline — happy path', () => {
  let runId: number;

  it('POST /factory/runs → 201 status=new', async () => {
    const res = await agent.post('/api/lb-slides/factory/runs');
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('new');
    runId = res.body.id as number;
    expect(typeof runId).toBe('number');
  });

  it('GET /factory/runs → includes the new run', async () => {
    const res = await agent.get('/api/lb-slides/factory/runs');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect((res.body as { id: number }[]).some((r) => r.id === runId)).toBe(true);
  });

  it('POST .../brief → 200 briefR2Key stored', async () => {
    const res = await agent
      .post(`/api/lb-slides/factory/runs/${runId}/brief`)
      .send({ r2Key: 'briefs/1/brief.pdf', filename: 'brief.pdf' });
    expect(res.status).toBe(200);
    expect(res.body.briefR2Key).toBe('briefs/1/brief.pdf');
  });

  it('POST .../accept-brief → 202 ingesting; drain → ingested', async () => {
    const res = await agent.post(`/api/lb-slides/factory/runs/${runId}/accept-brief`);
    expect(res.status).toBe(202);
    expect(res.body.status).toBe('ingesting');

    await drain();

    const get = await agent.get(`/api/lb-slides/factory/runs/${runId}`);
    expect(get.body.status).toBe('ingested');
  });

  it('POST .../properties → 202 drafting; drain → draft_review with luccaDraft', async () => {
    const res = await agent
      .post(`/api/lb-slides/factory/runs/${runId}/properties`)
      .send({ slide1PropertyId: 101, slide2PropertyId: 102, slide3PropertyId: 103, slide5PropertyId: 105 });
    expect(res.status).toBe(202);
    expect(res.body.status).toBe('drafting');

    await drain();

    const get = await agent.get(`/api/lb-slides/factory/runs/${runId}`);
    expect(get.body.status).toBe('draft_review');
    expect(get.body.luccaDraft).toBeTruthy();
  });

  it('POST .../approve-all-slots → 200 all slots approved', async () => {
    const res = await agent.post(`/api/lb-slides/factory/runs/${runId}/approve-all-slots`);
    expect(res.status).toBe(200);
    const draft = res.body.luccaDraft as Record<string, { approved: boolean }>;
    expect(Object.values(draft).every((s) => s.approved)).toBe(true);
  });

  it('POST .../trigger-build → 202 building; drain → complete with deckR2Key', async () => {
    const res = await agent.post(`/api/lb-slides/factory/runs/${runId}/trigger-build`);
    expect(res.status).toBe(202);
    expect(res.body.status).toBe('building');

    await drain();

    const get = await agent.get(`/api/lb-slides/factory/runs/${runId}`);
    expect(get.body.status).toBe('complete');
    expect(get.body.deckR2Key).toBe(`factory-runs/${runId}/deck.pdf`);
  });

  it('GET .../download → 200 application/pdf', async () => {
    const res = await agent.get(`/api/lb-slides/factory/runs/${runId}/download`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// REBUILD LOOP — complete → slot override → rebuilding → complete (new deckR2Key)
// ═══════════════════════════════════════════════════════════════════════════════
describe('Slide factory pipeline — rebuild loop', () => {
  // Run 1 is already at complete from the happy path above.
  const runId = 1;

  it('PATCH .../slots/slide1.headerSubtitle on complete run → 200 source=admin-override', async () => {
    const res = await agent
      .patch(`/api/lb-slides/factory/runs/${runId}/slots/slide1.headerSubtitle`)
      .send({ value: 'Updated headline copy' });
    expect(res.status).toBe(200);
    const draft = res.body.luccaDraft as Record<string, { source: string }>;
    expect(draft['slide1.headerSubtitle'].source).toBe('admin-override');
  });

  it('POST .../rebuild → 202 rebuilding; drain → complete with deck-v2 key', async () => {
    const res = await agent.post(`/api/lb-slides/factory/runs/${runId}/rebuild`);
    expect(res.status).toBe(202);
    expect(res.body.status).toBe('rebuilding');

    await drain();

    const get = await agent.get(`/api/lb-slides/factory/runs/${runId}`);
    expect(get.body.status).toBe('complete');
    expect(get.body.deckR2Key).toBe(`factory-runs/${runId}/deck-v2.pdf`);
  });

  it('GET .../download after rebuild → 200 application/pdf', async () => {
    const res = await agent.get(`/api/lb-slides/factory/runs/${runId}/download`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STATUS GUARDS — 409 on wrong status
// ═══════════════════════════════════════════════════════════════════════════════
describe('Slide factory pipeline — status guards (409)', () => {
  it('accept-brief on a complete run → 409', async () => {
    // Run 1 is at complete after the happy path + rebuild.
    const res = await agent.post('/api/lb-slides/factory/runs/1/accept-brief');
    expect(res.status).toBe(409);
  });

  it('trigger-build on a new run → 409', async () => {
    // Create a fresh run and try trigger-build without advancing it.
    const create = await agent.post('/api/lb-slides/factory/runs');
    const id = (create.body as { id: number }).id;
    const res = await agent.post(`/api/lb-slides/factory/runs/${id}/trigger-build`);
    expect(res.status).toBe(409);
  });

  it('rebuild on a building run → 409', async () => {
    const id = insertRun('building');
    const res = await agent.post(`/api/lb-slides/factory/runs/${id}/rebuild`);
    expect(res.status).toBe(409);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DOWNLOAD GUARD — 422 when deck not ready
// ═══════════════════════════════════════════════════════════════════════════════
describe('Slide factory pipeline — download guard (422)', () => {
  it('download on a draft_review run → 422', async () => {
    const id = insertRun('draft_review');
    const res = await agent.get(`/api/lb-slides/factory/runs/${id}/download`);
    expect(res.status).toBe(422);
  });
});
