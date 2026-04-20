/**
 * Seed/Schema Sync Detector — proof test enforcing seed exercises every
 * schema column.
 *
 * For every column declared in `shared/schema/properties.ts`, at least one
 * seed row in `server/seeds/property-data.ts` (or a sibling seed file) must
 * set that column. Columns with `.default()` that are never exercised in
 * seeds silently pick up the default and break if the default changes —
 * this test prevents that class of drift.
 *
 * Suggested in `.claude/rules/cross-check-invariants.md` §"Enforcement via
 * proof tests — suggested additions".
 *
 * v1 scope: `properties` table only (the largest + most financially-
 * critical schema). Can extend to global_assumptions, users, etc. in a
 * future pass.
 *
 * Exemptions:
 * - System columns (id, createdAt, updatedAt, userId, tenantId, etc.)
 * - Columns explicitly added to BASELINE_UNEXERCISED below with a comment
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "../..");

const SCHEMA_FILE = "shared/schema/properties.ts";
const SEED_FILES = [
  "server/seeds/property-data.ts",
  "server/seeds/properties.ts",
  "server/seed.ts",
  "server/syncHelpers.ts",
  "client/src/lib/store.ts",
];

// Columns that never need seed coverage — system / housekeeping / legacy fields.
const SYSTEM_COLUMN_EXEMPTIONS = new Set<string>([
  // Identity / foreign keys / timestamps
  "id",
  "createdAt",
  "updatedAt",
  "userId",
  "tenantId",
  "companyId",
  "businessBrandId",
  "parentPropertyId",
  "version",
  "deletedAt",
  "lastAccessedAt",
  "lastResearchAt",

  // Research-extracted fields — filled by The Analyst / research pipeline,
  // never by seed. Setting these in seed would be misleading because the
  // research pipeline re-populates them on first consultation.
  "costSeg5yrPct",
  "costSeg7yrPct",
  "costSeg15yrPct",
  "costSegEnabled",
  "guestMixBusiness",
  "guestMixGroup",
  "guestMixLeisure",
  "isRelevant",
  "isValid",
  "label",
  "relevanceScore",
  "sourceUrls",
  "stableKey",
  "starRating",
  "starRatingSource",
  "starRatingSuggested",
  "url",
  "validationReason",
  "validationStatus",

  // Audit / housekeeping / computed fields — set by system events, not seed
  "archivedAt",
  "archivedBy",
  "createdBy",
  "flaggedFieldCount",
  "lastAssumptionChangeAt",
  "lastCheckedAt",
  "lastRenovationYear",
  "lastValidatedAt",
  "metadata",
]);

/**
 * Baseline of columns that exist in the schema but are NOT currently set
 * by any seed row. Each entry is a drift candidate — either:
 * (a) add a seed row that exercises the column, OR
 * (b) mark the column as system-level and add to SYSTEM_COLUMN_EXEMPTIONS.
 *
 * Drive this list toward [] in follow-up audits.
 */
const BASELINE_UNEXERCISED: string[] = [
  // Real drift candidates — schema has a default but seed doesn't exercise it.
  // Each of these should either (a) be added to a seed row, or (b) be removed
  // from the schema if genuinely unused.
  //
  // Triaged 2026-04-20: 28 research-extracted / audit-housekeeping columns
  // promoted to SYSTEM_COLUMN_EXEMPTIONS (they're system-set, never
  // seed-set). 36 real drift entries remain below — Replit handoff queued
  // at `.claude/replit-handoffs/seed-schema-sync-coverage.md` to add seed
  // coverage or mark genuinely-unused columns for deletion.
  "apDays",
  "arDays",
  "brandId",
  "commercialKitchenCost",
  "conversionCost",
  "dayCountConvention",
  "escalationMethod",
  "estimatedConversionMonths",
  "eventSpaceSqft",
  "eventVenueCost",
  "fbSeats",
  "fbVenues",
  "feeSubordination",
  "fireCodeAdaCost",
  "liquorLicenseCost",
  "locationType",
  "managementType",
  "marketTier",
  "maxGuests",
  "nightlyPropertyRate",
  "occupancyRampCurve",
  "onMunicipalSewer",
  "operatingDeficitReserve",
  "ownerPriorityReturn",
  "performanceTestEnabled",
  "pricingModel",
  "qualityTier",
  "reinvestmentRate",
  "roomAdditionCost",
  "seasonalityProfile",
  "serviceLevel",
  "streetAddress2",
  "totalBuildingSqft",
  "totalPropertyAcreage",
  "yearBuilt",
  "zoningPermitCost",
];

// -- Schema column extraction -----------------------------------------------

/**
 * Extract column names from a drizzle schema file. Matches lines like:
 *   `columnName: text("col_name").notNull().default(X),`
 *   `columnName: real("col_name"),`
 * Handles the single-line case which covers >95% of columns. Multi-line
 * declarations get their opening line captured via the `name:` prefix.
 */
function extractSchemaColumns(src: string): string[] {
  const columns = new Set<string>();

  // Find `pgTable("tableName", { ... })` blocks — scan inside only
  const tableRegex = /\bpgTable\s*\(\s*["']\w+["']\s*,\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = tableRegex.exec(src)) !== null) {
    const openIdx = m.index + m[0].length - 1;
    const closeIdx = findMatchingBrace(src, openIdx);
    if (closeIdx < 0) continue;
    const body = src.slice(openIdx + 1, closeIdx);

    // Column declarations: `name: drizzleFn(...)` — capture name at the
    // start of a line inside the table body.
    for (const colMatch of body.matchAll(
      /^\s*(\w+)\s*:\s*[a-zA-Z_$][\w$]*\s*\(/gm
    )) {
      columns.add(colMatch[1]);
    }
  }

  return [...columns];
}

function findMatchingBrace(src: string, openIdx: number): number {
  let depth = 0;
  let i = openIdx;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      i++;
      while (i < src.length && src[i] !== q) {
        if (src[i] === "\\") i += 2;
        else i++;
      }
      i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length - 1 && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

// -- Seed coverage ----------------------------------------------------------

/**
 * Collect every identifier that appears as an object-literal key across
 * the union of seed files. We don't try to filter by "is inside an insert"
 * — any identifier used as a key anywhere counts. This over-counts
 * coverage slightly (might match keys in non-seed objects) but under-
 * counts drift, which is the safer direction for this test.
 */
function collectSeedKeys(files: string[]): Set<string> {
  const keys = new Set<string>();
  for (const file of files) {
    const full = join(ROOT, file);
    if (!existsSync(full)) continue;
    const src = readFileSync(full, "utf-8");
    // Match: `identifier:` inside an object literal. Deliberately loose —
    // captures any `name: value` construct.
    for (const m of src.matchAll(/(?:^|[\s,{(\n])(\w+)\s*:\s*(?!:)/g)) {
      keys.add(m[1]);
    }
  }
  return keys;
}

// -- Test --------------------------------------------------------------------

describe("Seed/Schema Sync — every schema column exercised by at least one seed", () => {
  const schemaSrc = readFileSync(join(ROOT, SCHEMA_FILE), "utf-8");
  const schemaColumns = extractSchemaColumns(schemaSrc);
  const seedKeys = collectSeedKeys(SEED_FILES);

  // A column is "exercised" if it appears as a key in any seed file
  const unexercised = schemaColumns
    .filter((col) => !SYSTEM_COLUMN_EXEMPTIONS.has(col))
    .filter((col) => !seedKeys.has(col))
    .sort();

  it("no NEW unexercised schema columns beyond the documented baseline", () => {
    const baseline = new Set(BASELINE_UNEXERCISED);
    const newUnexercised = unexercised.filter((c) => !baseline.has(c));

    expect(
      newUnexercised,
      `Found ${newUnexercised.length} schema column(s) in ${SCHEMA_FILE} ` +
        `not exercised by any seed file. Each is a drift candidate — either ` +
        `add a seed row that sets it, mark it as system-level in ` +
        `SYSTEM_COLUMN_EXEMPTIONS, or append to BASELINE_UNEXERCISED ` +
        `with justification.\n\nUnexercised columns:\n  ${newUnexercised.join("\n  ")}`
    ).toEqual([]);
  });

  it("baseline contains no stale entries (each listed column is still unexercised)", () => {
    const currentSet = new Set(unexercised);
    const stale = BASELINE_UNEXERCISED.filter((c) => !currentSet.has(c));

    expect(
      stale,
      `The following baseline entries are now exercised in seed — remove ` +
        `from BASELINE_UNEXERCISED:\n  ${stale.join("\n  ")}`
    ).toEqual([]);
  });

  it("sanity: schema columns were actually extracted", () => {
    // Guard against regex breakage — properties.ts has 100+ columns
    expect(schemaColumns.length).toBeGreaterThan(50);
  });
});
