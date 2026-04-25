/**
 * Focused contract tests for Task #538 — Rebecca preview fixtures.
 *
 * Covers two layers:
 *   1. Storage CRUD against the real DB (list / get / create / update /
 *      delete) and the unique-name constraint.
 *   2. Schema validation: insertRebeccaPreviewFixtureSchema rejects unknown
 *      keys and accepts the canonical { settings, turns } shape.
 *
 * We use the real DB (mirrors the AdminResourceStorage tests) and clean up
 * by name suffix to keep tests independent.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  insertRebeccaPreviewFixtureSchema,
  type RebeccaPreviewTurn,
} from "@shared/schema";
import { DEFAULT_REBECCA_SETTINGS } from "@shared/rebecca-settings";

const NAME_SUFFIX = `__test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

describe("RebeccaPreviewFixtures (real DB)", () => {
  let storage: typeof import("../../server/storage").storage;
  let createdIds: number[] = [];

  beforeAll(async () => {
    storage = (await import("../../server/storage")).storage;
  });

  afterAll(async () => {
    for (const id of createdIds) {
      try {
        await storage.deleteRebeccaPreviewFixture(id);
      } catch {
        // best-effort cleanup
      }
    }
  });

  const sampleTurns: RebeccaPreviewTurn[] = [
    { role: "user", content: "Summarise the portfolio in one line.", ts: 1 },
    { role: "assistant", content: "Stable yield, two assets above plan.", ts: 2 },
    { role: "user", content: "Which one is below plan?", ts: 3 },
    { role: "assistant", content: "Sevilla — RevPAR is 6% under budget.", ts: 4 },
  ];

  it("creates a fixture and returns it via list/get", async () => {
    const created = await storage.createRebeccaPreviewFixture({
      name: `portfolio-summary${NAME_SUFFIX}`,
      description: "baseline summary regression",
      settings: DEFAULT_REBECCA_SETTINGS,
      turns: sampleTurns,
      createdById: null,
    });
    createdIds.push(created.id);

    expect(created.id).toBeGreaterThan(0);
    expect(created.name).toBe(`portfolio-summary${NAME_SUFFIX}`);
    expect(created.turns).toHaveLength(4);

    const fetched = await storage.getRebeccaPreviewFixture(created.id);
    expect(fetched?.id).toBe(created.id);
    expect(fetched?.settings).toEqual(DEFAULT_REBECCA_SETTINGS);

    const list = await storage.listRebeccaPreviewFixtures();
    expect(list.find((f) => f.id === created.id)).toBeDefined();
  });

  it("rejects duplicate names with a unique-violation error", async () => {
    const name = `duplicate-name${NAME_SUFFIX}`;
    const first = await storage.createRebeccaPreviewFixture({
      name,
      description: null,
      settings: DEFAULT_REBECCA_SETTINGS,
      turns: sampleTurns,
      createdById: null,
    });
    createdIds.push(first.id);

    await expect(
      storage.createRebeccaPreviewFixture({
        name,
        description: null,
        settings: DEFAULT_REBECCA_SETTINGS,
        turns: sampleTurns,
        createdById: null,
      }),
    ).rejects.toThrow();
  });

  it("updates name + description but never the snapshotted settings/turns", async () => {
    const created = await storage.createRebeccaPreviewFixture({
      name: `to-rename${NAME_SUFFIX}`,
      description: "first",
      settings: DEFAULT_REBECCA_SETTINGS,
      turns: sampleTurns,
      createdById: null,
    });
    createdIds.push(created.id);
    const originalSettings = created.settings;
    const originalTurns = created.turns;

    const updated = await storage.updateRebeccaPreviewFixture(created.id, {
      name: `renamed${NAME_SUFFIX}`,
      description: "second",
    });
    expect(updated?.name).toBe(`renamed${NAME_SUFFIX}`);
    expect(updated?.description).toBe("second");
    // Snapshots are immutable — only metadata changes.
    expect(updated?.settings).toEqual(originalSettings);
    expect(updated?.turns).toEqual(originalTurns);
  });

  it("delete returns true on hit, false on miss", async () => {
    const created = await storage.createRebeccaPreviewFixture({
      name: `to-delete${NAME_SUFFIX}`,
      description: null,
      settings: DEFAULT_REBECCA_SETTINGS,
      turns: sampleTurns,
      createdById: null,
    });

    const deleted = await storage.deleteRebeccaPreviewFixture(created.id);
    expect(deleted).toBe(true);

    const missAgain = await storage.deleteRebeccaPreviewFixture(created.id);
    expect(missAgain).toBe(false);
  });
});

describe("insertRebeccaPreviewFixtureSchema", () => {
  it("requires name + settings + turns and accepts a minimal valid record", () => {
    const ok = insertRebeccaPreviewFixtureSchema.safeParse({
      name: "ok",
      description: null,
      settings: DEFAULT_REBECCA_SETTINGS,
      turns: [],
      createdById: null,
    });
    expect(ok.success).toBe(true);
  });

  it("rejects records missing the name", () => {
    const bad = insertRebeccaPreviewFixtureSchema.safeParse({
      settings: DEFAULT_REBECCA_SETTINGS,
      turns: [],
    } as unknown as object);
    expect(bad.success).toBe(false);
  });
});
