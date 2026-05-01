/**
 * generate-seed-manifest.ts — Generates seed-manifest.json from seed constants.
 *
 * Run: npm run seed:manifest
 *
 * The manifest captures canonical seed values for every syncable entity.
 * It is checked into git and used by the smart sync system to determine
 * which production fields should be updated vs preserved.
 */
import { writeFileSync } from "fs";
import { resolve } from "path";
import {
  SEED_GLOBAL_ASSUMPTIONS,
  SEED_PROPERTY_DEFAULTS,
  SEED_PROPERTIES,
  DEFAULT_FEE_CATEGORIES,
} from "../server/syncHelpers";

interface SeedManifest {
  version: number;
  generatedAt: string;
  entities: {
    globalAssumptions: { key: string; fields: Record<string, unknown> };
    properties: Array<{ key: string; fields: Record<string, unknown> }>;
    feeCategories: Array<{ key: string; fields: Record<string, unknown> }>;
  };
}

const EXCLUDE_KEYS = new Set(["id", "createdAt", "updatedAt", "userId", "researchValues"]);

function cleanFields(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!EXCLUDE_KEYS.has(k) && v !== undefined) {
      result[k] = v;
    }
  }
  return result;
}

const manifest: SeedManifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  entities: {
    globalAssumptions: {
      key: "singleton",
      fields: cleanFields(SEED_GLOBAL_ASSUMPTIONS as Record<string, unknown>),
    },
    properties: SEED_PROPERTIES.map((p) => ({
      key: p.name,
      fields: cleanFields(p as Record<string, unknown>),
    })),
    feeCategories: DEFAULT_FEE_CATEGORIES.map((fc) => ({
      key: fc.name,
      fields: { rate: fc.rate, sortOrder: fc.sortOrder },
    })),
  },
};

const outPath = resolve(process.cwd(), "seed-manifest.json");
writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
console.log(`Seed manifest written to ${outPath} (${SEED_PROPERTIES.length} properties, ${DEFAULT_FEE_CATEGORIES.length} fee categories)`);
