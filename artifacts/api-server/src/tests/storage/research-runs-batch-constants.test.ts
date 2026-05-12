/**
 * Storage-layer regression for `getLatestSuccessfulRunsForAllConstants`.
 * Pins the no-N+1 contract (Sentry #7471411947) at the source: exactly one
 * `db.execute` per call, returning an O(1) lookup Map keyed by
 * `"<key>|<country>|<subdivision>"`. Companion to the route audit in
 * `tests/routes/admin/model-constants-batch-runs.test.ts`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ResearchRunsStorage } from "../../storage/intelligence/research-runs";
import { IntelligenceTx, type IntelligenceDb } from "../../storage/intelligence/tx";

type RawRow = {
  id: number;
  user_id: number | null;
  entity_type: string;
  entity_id: number;
  scenario_id: number | null;
  tier: number;
  status: string;
  started_at: Date;
  completed_at: Date | null;
  duration_ms: number | null;
  model_primary: string | null;
  model_secondary: string | null;
  model_synthesis: string | null;
  tokens_used: number | null;
  estimated_cost: number | null;
  error: string | null;
  metadata: Record<string, unknown> | null;
  cache_key: string | null;
  cache_inputs_hash: string | null;
};

function row(
  id: number,
  key: string,
  country: string | null,
  subdivision: string | null,
  completedAt: Date,
): RawRow {
  return {
    id,
    user_id: null,
    entity_type: "model-constant",
    entity_id: 0,
    scenario_id: null,
    tier: 1,
    status: "completed",
    started_at: new Date(completedAt.getTime() - 1000),
    completed_at: completedAt,
    duration_ms: 1000,
    model_primary: null,
    model_secondary: null,
    model_synthesis: null,
    tokens_used: null,
    estimated_cost: null,
    error: null,
    metadata: { constant: { key, country, subdivision } },
    cache_key: null,
    cache_inputs_hash: null,
  };
}

function makeStorage(rows: RawRow[]) {
  const execute = vi.fn(async () => ({ rows }));
  const fakeDb = { execute } as unknown as IntelligenceDb;
  const tx = new IntelligenceTx(fakeDb);
  return { storage: new ResearchRunsStorage(tx), execute };
}

describe("ResearchRunsStorage.getLatestSuccessfulRunsForAllConstants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("issues exactly one db.execute call for the whole batch (no N+1)", async () => {
    // Several constant keys at three locality tiers — the call shape must
    // not scale with the number of distinct keys returned.
    const rows: RawRow[] = [
      row(1, "discountRate", null, null, new Date("2026-05-01T00:00:00Z")),
      row(2, "inflationRate", null, null, new Date("2026-05-02T00:00:00Z")),
      row(3, "propertyTaxRate", "United States", null, new Date("2026-05-03T00:00:00Z")),
      row(4, "salesTaxRate", "United States", "NY", new Date("2026-05-04T00:00:00Z")),
      row(5, "salesTaxRate", "United States", "CA", new Date("2026-05-05T00:00:00Z")),
    ];
    const { storage, execute } = makeStorage(rows);

    const map = await storage.getLatestSuccessfulRunsForAllConstants("United States", "NY");

    expect(execute).toHaveBeenCalledTimes(1);
    expect(map.size).toBe(rows.length);
  });

  it("returns the latest row per (key, country, subdivision) keyed for O(1) lookup", async () => {
    // Pre-deduped row set — what Postgres would hand back after DISTINCT ON
    // + ORDER BY completed_at DESC. The storage method's job is to surface
    // each row under its composite map key with the correct ResearchRun shape.
    const universalLatest = row(101, "discountRate", null, null, new Date("2026-05-10T00:00:00Z"));
    const countryLatest = row(202, "propertyTaxRate", "United States", null, new Date("2026-05-09T00:00:00Z"));
    const fullLatestNY = row(303, "salesTaxRate", "United States", "NY", new Date("2026-05-08T00:00:00Z"));
    const fullLatestCA = row(304, "salesTaxRate", "United States", "CA", new Date("2026-05-07T00:00:00Z"));

    const { storage } = makeStorage([universalLatest, countryLatest, fullLatestNY, fullLatestCA]);
    const map = await storage.getLatestSuccessfulRunsForAllConstants("United States", "NY");

    // O(1) lookups via the documented composite key shape.
    const universal = map.get("discountRate||");
    const country = map.get("propertyTaxRate|United States|");
    const fullNY = map.get("salesTaxRate|United States|NY");
    const fullCA = map.get("salesTaxRate|United States|CA");

    expect(universal?.id).toBe(101);
    expect(universal?.completedAt).toEqual(new Date("2026-05-10T00:00:00Z"));
    expect(country?.id).toBe(202);
    expect(fullNY?.id).toBe(303);
    expect(fullCA?.id).toBe(304);

    // Map entries match the camelCase ResearchRun shape, not raw snake_case.
    expect(universal).toMatchObject({
      entityType: "model-constant",
      status: "completed",
      tier: 1,
    });
    // A miss returns undefined (route handler relies on `?? null`).
    expect(map.get("nonExistentKey||")).toBeUndefined();
  });

  it("skips rows missing metadata.constant.key without throwing", async () => {
    const good = row(1, "discountRate", null, null, new Date("2026-05-10T00:00:00Z"));
    const bad: RawRow = { ...row(2, "ignored", null, null, new Date("2026-05-11T00:00:00Z")), metadata: {} };
    const { storage } = makeStorage([good, bad]);

    const map = await storage.getLatestSuccessfulRunsForAllConstants(null, null);

    expect(map.size).toBe(1);
    expect(map.get("discountRate||")?.id).toBe(1);
  });
});
