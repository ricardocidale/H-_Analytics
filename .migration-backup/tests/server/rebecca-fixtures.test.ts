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
import { DEFAULT_REBECCA_SETTINGS, mergeRebeccaSettings, rebeccaSettingsSchema } from "@shared/rebecca-settings";

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

describe("Rebecca fixture export/import storage helpers (real DB) — Task #560", () => {
  let storage: typeof import("../../server/storage").storage;
  const createdIds: number[] = [];
  const localSuffix = `__exp_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

  const sampleTurns: RebeccaPreviewTurn[] = [
    { role: "user", content: "What's the warmest hotel?", ts: 1 },
    { role: "assistant", content: "Buenavista — it scores 92.", ts: 2 },
  ];

  beforeAll(async () => {
    storage = (await import("../../server/storage")).storage;
  });

  afterAll(async () => {
    for (const id of createdIds) {
      try { await storage.deleteRebeccaPreviewFixture(id); } catch { /* best-effort */ }
    }
  });

  it("getRebeccaPreviewFixtureByName returns the fixture or undefined", async () => {
    const name = `lookup-by-name${localSuffix}`;
    const created = await storage.createRebeccaPreviewFixture({
      name,
      description: "for lookup",
      settings: DEFAULT_REBECCA_SETTINGS,
      turns: sampleTurns,
      createdById: null,
    });
    createdIds.push(created.id);

    const hit = await storage.getRebeccaPreviewFixtureByName(name);
    expect(hit?.id).toBe(created.id);

    const miss = await storage.getRebeccaPreviewFixtureByName(`${name}-nope`);
    expect(miss).toBeUndefined();
  });

  it("replaceRebeccaPreviewFixtureContent overwrites snapshot fields and resets replay tracking", async () => {
    const created = await storage.createRebeccaPreviewFixture({
      name: `to-overwrite${localSuffix}`,
      description: "before",
      settings: DEFAULT_REBECCA_SETTINGS,
      turns: sampleTurns,
      createdById: null,
    });
    createdIds.push(created.id);

    // Seed replay tracking so we can assert it gets cleared.
    await storage.recordRebeccaFixtureReplayResult(created.id, {
      lastReplayAt: new Date(),
      lastReplayStatus: "drifted",
      lastReplaySummary: {
        totalTurns: 1, matched: 0, differed: 1, noBaseline: 0, errored: 0, durationMs: 100,
      },
      lastReplayFingerprint: "abc",
    });

    const newSettings: typeof DEFAULT_REBECCA_SETTINGS = {
      ...DEFAULT_REBECCA_SETTINGS,
      personality: { ...DEFAULT_REBECCA_SETTINGS.personality, warmth: 99 },
    };
    const newTurns: RebeccaPreviewTurn[] = [
      { role: "user", content: "different prompt", ts: 10 },
      { role: "assistant", content: "different reply", ts: 11 },
      { role: "user", content: "follow-up", ts: 12 },
    ];

    const replaced = await storage.replaceRebeccaPreviewFixtureContent(created.id, {
      description: "after",
      settings: newSettings,
      turns: newTurns,
      createdById: null,
    });
    expect(replaced).toBeDefined();
    expect(replaced!.description).toBe("after");
    expect(replaced!.turns).toHaveLength(3);
    expect((replaced!.settings as typeof DEFAULT_REBECCA_SETTINGS).personality.warmth).toBe(99);
    // Name is intentionally NOT mutated by replace — the import path keys
    // off the existing name to find the row in the first place.
    expect(replaced!.name).toBe(`to-overwrite${localSuffix}`);
    // Replay tracking columns should be cleared.
    expect(replaced!.lastReplayAt).toBeNull();
    expect(replaced!.lastReplayStatus).toBeNull();
    expect(replaced!.lastReplaySummary).toBeNull();
    expect(replaced!.lastReplayFingerprint).toBeNull();
  });

  it("replaceRebeccaPreviewFixtureContent on missing id returns undefined", async () => {
    const result = await storage.replaceRebeccaPreviewFixtureContent(999_999_999, {
      description: null,
      settings: DEFAULT_REBECCA_SETTINGS,
      turns: sampleTurns,
      createdById: null,
    });
    expect(result).toBeUndefined();
  });

  it("mergeRebeccaSettings hydrates a partial export so older snapshots stay importable", () => {
    // Simulate an older export that's missing several whole sections —
    // mimicking an environment that hadn't picked up newer schema fields.
    const partial = {
      personality: { warmth: 33 },
      llm: { provider: "openai", model: "gpt-4o" },
      // identity / voice / behavior / sources omitted entirely.
    };
    const hydrated = mergeRebeccaSettings(partial);
    // Strict re-parse must succeed once defaults have been filled in.
    const parsed = rebeccaSettingsSchema.safeParse(hydrated);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.personality.warmth).toBe(33);
      expect(parsed.data.llm.provider).toBe("openai");
      // Defaults restored for missing sections.
      expect(parsed.data.voice.tonePreset).toBe(DEFAULT_REBECCA_SETTINGS.voice.tonePreset);
      expect(parsed.data.sources.portfolio.enabled).toBe(true);
    }
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
