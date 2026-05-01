/**
 * Phase 3 (Task #453) — runtime propagation test.
 *
 * Proves that an identity override set through the admin route immediately
 * changes the persona name returned by a non-admin "narration surface" —
 * the specialist-tools inspector — without any restart or re-deploy.
 *
 * Storage is mocked so we can flip the override mid-test and assert that
 * the next call to the inspector route picks up the new resolved name.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Express, Request, Response, NextFunction, RequestHandler } from "express";

vi.mock("../../server/storage", () => ({
  storage: {
    getIdentityOverride: vi.fn().mockResolvedValue(null),
    listIdentityOverrides: vi.fn().mockResolvedValue([]),
    intelligenceV2: {
      listSpecialistToolsWithFreshness: vi.fn(),
    },
  },
}));

vi.mock("../../server/auth", () => ({
  requireAdmin: (req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: { id: number; role: string } }).user = { id: 1, role: "super_admin" };
    next();
  },
}));

vi.mock("../../server/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { storage } from "../../server/storage";
import { registerAdminSpecialistToolRoutes } from "../../server/routes/admin/specialist-tools";

type Handlers = Record<string, RequestHandler[]>;
function makeApp(): { app: Express; handlers: Handlers } {
  const handlers: Handlers = {};
  const collect = (m: string) => (path: string, ...rest: RequestHandler[]) => {
    handlers[`${m} ${path}`] = rest;
  };
  const app = {
    get: collect("GET"), post: collect("POST"), put: collect("PUT"), delete: collect("DELETE"),
  } as unknown as Express;
  return { app, handlers };
}
async function invoke(handlers: Handlers, key: string): Promise<{ status: number; body: unknown }> {
  const chain = handlers[key];
  let status = 200;
  let body: unknown = undefined;
  const req = { params: {}, query: {}, body: undefined, headers: {}, ip: "127.0.0.1" } as unknown as Request;
  const res = {
    status(c: number) { status = c; return this; },
    json(p: unknown) { body = p; return this; },
    end() { return this; },
    locals: {},
  } as unknown as Response;
  let idx = 0;
  const next: NextFunction = (err?: unknown) => {
    if (err) throw err;
    if (idx < chain.length) return chain[idx++](req, res, next);
  };
  next();
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  return { status, body };
}

describe("Phase 3 (#453) — identity overrides propagate to runtime narration", () => {
  let app: Express;
  let handlers: Handlers;

  beforeEach(() => {
    vi.clearAllMocks();
    const made = makeApp();
    app = made.app;
    handlers = made.handlers;
    registerAdminSpecialistToolRoutes(app);

    // Single tool owned by Helena (constants.tax-research) and called by no
    // one — the smallest fixture that exercises the owner-name resolution
    // path. Catalog default humanName = "Helena".
    (storage.intelligenceV2.listSpecialistToolsWithFreshness as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        tool: {
          id: "tax-bulletin-diff",
          ownerSpecialistId: "constants.tax-research",
          calledBy: [] as string[],
          displayName: "Tax bulletin diff",
          description: "",
          kind: "proof",
          sourceFile: "server/ai/tools/tax-bulletin-diff.ts",
          citation: null,
          resourceSlugs: [],
          lastBuiltSource: "code",
        },
        lastBuiltAt: new Date("2026-04-22T00:00:00Z"),
      },
    ]);
  });

  it("with no override, owner.humanName is the catalog default ('Helena')", async () => {
    (storage.listIdentityOverrides as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const { status, body } = await invoke(handlers, "GET /api/admin/specialist-tools");
    expect(status).toBe(200);
    const payload = body as { tools: Array<{ owner: { humanName: string } }> };
    expect(payload.tools[0].owner.humanName).toBe("Helena");
  });

  it("with an override, the next call picks up the new name immediately", async () => {
    // Admin renames Helena → "Hellena" via /identity. The override is now
    // present in storage. Without restart or redeploy, the inspector
    // surface should report the new name on the very next call.
    (storage.listIdentityOverrides as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        specialistId: "constants.tax-research",
        humanName: "Hellena",
        gender: null,
        updatedByUserId: 99,
        updatedAt: new Date(),
      },
    ]);
    const { status, body } = await invoke(handlers, "GET /api/admin/specialist-tools");
    expect(status).toBe(200);
    const payload = body as { tools: Array<{ owner: { humanName: string } }> };
    expect(payload.tools[0].owner.humanName).toBe("Hellena");
  });

  it("clearing the override (returning [] from listIdentityOverrides) reverts to catalog default", async () => {
    // First with override:
    (storage.listIdentityOverrides as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      {
        specialistId: "constants.tax-research",
        humanName: "Hellena",
        gender: null,
        updatedByUserId: 99,
        updatedAt: new Date(),
      },
    ]);
    const first = await invoke(handlers, "GET /api/admin/specialist-tools");
    expect((first.body as { tools: Array<{ owner: { humanName: string } }> }).tools[0].owner.humanName).toBe("Hellena");

    // Then with cleared override (admin clicks "Restore default"):
    (storage.listIdentityOverrides as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    const second = await invoke(handlers, "GET /api/admin/specialist-tools");
    expect((second.body as { tools: Array<{ owner: { humanName: string } }> }).tools[0].owner.humanName).toBe("Helena");
  });
});
