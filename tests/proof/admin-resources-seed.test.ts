/**
 * Proof test — P6f admin_resources seed coverage.
 *
 * Validates that:
 *   1. All slugs in MODEL_SEED_ROWS and SOURCE_SEED_ROWS satisfy
 *      RESOURCE_SLUG_PATTERN (no periods, no underscores, etc.).
 *   2. No duplicate (kind, slug) pairs exist across either array.
 *   3. Every slug referenced by HARDCODED_LLM_DEFAULTS (non-null values)
 *      is present in MODEL_SEED_ROWS.
 *   4. Every slug referenced by RECOMMENDED_MODEL_SLUGS_BY_ROLE is
 *      present in MODEL_SEED_ROWS.
 *   5. All model rows carry a vendor + modelId in their config.
 *
 * Static test — no DB access. Pure import + assertion.
 */
import { describe, it, expect } from "vitest";
import { RESOURCE_SLUG_PATTERN } from "@shared/schema/admin-resource";
import { HARDCODED_LLM_DEFAULTS } from "../../server/ai/specialist-llm-resolver";
import { RECOMMENDED_MODEL_SLUGS_BY_ROLE } from "../../engine/analyst/registry/recommended-models";
import {
  MODEL_SEED_ROWS,
  SOURCE_SEED_ROWS,
} from "../../server/migrations/admin-resources-005";

const allRows = [...MODEL_SEED_ROWS, ...SOURCE_SEED_ROWS];
const modelSlugs = new Set(
  MODEL_SEED_ROWS.filter((r) => r.kind === "model").map((r) => r.slug),
);

describe("admin-resources seed (P6f)", () => {
  it("all model slugs pass RESOURCE_SLUG_PATTERN", () => {
    for (const row of MODEL_SEED_ROWS) {
      expect(
        RESOURCE_SLUG_PATTERN.test(row.slug),
        `model slug "${row.slug}" fails RESOURCE_SLUG_PATTERN`,
      ).toBe(true);
    }
  });

  it("all source slugs pass RESOURCE_SLUG_PATTERN", () => {
    for (const row of SOURCE_SEED_ROWS) {
      expect(
        RESOURCE_SLUG_PATTERN.test(row.slug),
        `source slug "${row.slug}" (kind: ${row.kind}) fails RESOURCE_SLUG_PATTERN`,
      ).toBe(true);
    }
  });

  it("no duplicate (kind, slug) pairs across all seed rows", () => {
    const keys = allRows.map((r) => `${r.kind}:${r.slug}`);
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    expect(dupes, `Duplicate (kind, slug) pairs: ${dupes.join(", ")}`).toHaveLength(0);
  });

  it("all HARDCODED_LLM_DEFAULTS string slugs are present in MODEL_SEED_ROWS", () => {
    const hardcoded = Object.entries(HARDCODED_LLM_DEFAULTS).filter(
      ([, v]) => typeof v === "string",
    ) as [string, string][];

    for (const [role, slug] of hardcoded) {
      expect(
        modelSlugs.has(slug),
        `HARDCODED_LLM_DEFAULTS.${role} = "${slug}" is not seeded in MODEL_SEED_ROWS`,
      ).toBe(true);
    }
  });

  it("all RECOMMENDED_MODEL_SLUGS_BY_ROLE slugs are present in MODEL_SEED_ROWS", () => {
    for (const [role, slug] of Object.entries(RECOMMENDED_MODEL_SLUGS_BY_ROLE)) {
      expect(
        modelSlugs.has(slug),
        `RECOMMENDED_MODEL_SLUGS_BY_ROLE.${role} = "${slug}" is not seeded in MODEL_SEED_ROWS`,
      ).toBe(true);
    }
  });

  it("all model rows have kind 'model'", () => {
    for (const row of MODEL_SEED_ROWS) {
      expect(row.kind).toBe("model");
    }
  });

  it("all model rows have vendor and modelId in config", () => {
    for (const row of MODEL_SEED_ROWS) {
      expect(
        typeof (row.config as Record<string, unknown>).vendor,
        `model row "${row.slug}" missing config.vendor`,
      ).toBe("string");
      expect(
        typeof (row.config as Record<string, unknown>).modelId,
        `model row "${row.slug}" missing config.modelId`,
      ).toBe("string");
    }
  });

  it("source rows use only valid resource kinds", () => {
    const validKinds = new Set(["api", "source", "table", "benchmark", "model"]);
    for (const row of SOURCE_SEED_ROWS) {
      expect(
        validKinds.has(row.kind),
        `source row "${row.slug}" has invalid kind "${row.kind}"`,
      ).toBe(true);
    }
  });

  it("MODEL_SEED_ROWS has exactly 6 rows", () => {
    expect(MODEL_SEED_ROWS).toHaveLength(6);
  });

  it("SOURCE_SEED_ROWS has exactly 24 rows", () => {
    expect(SOURCE_SEED_ROWS).toHaveLength(24);
  });
});
