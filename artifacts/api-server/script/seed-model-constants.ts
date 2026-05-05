/**
 * Seed `model_constants` from the TypeScript canonical sources.
 *
 * Idempotent: every row is upserted by (constantKey, country, countrySubdivision).
 * Safe to re-run after editing COUNTRY_DEFAULTS or US_STATE_DEFAULTS.
 *
 * What gets seeded:
 *   - 1 universal row:    daysPerMonth
 *   - country-keyed:      taxRate, costRateTaxes, countryRiskPremium,
 *                         inflationRate, depreciationYears, capitalGainsRate
 *                         (one row per country × key = 18 × 6)
 *   - state overlays:     taxRate, costRateTaxes for the 10 US states
 *                         (one row per state × key = 10 × 2)
 *
 * Authority field: depreciationYears uses the per-country `depreciationAuthority`
 * field; the rest use a per-key authority string with a country qualifier.
 *
 * Run:
 *   tsx script/seed-model-constants.ts
 */

import { pathToFileURL } from "url";
import { resolve } from "path";
import { sql } from "drizzle-orm";
import { COUNTRY_DEFAULTS, US_STATE_DEFAULTS } from "@shared/countryDefaults";
import { DAYS_PER_MONTH } from "@shared/constants";
import { storage } from "../src/storage";
import { db } from "../src/db";

interface SeedRow {
  constantKey: string;
  country: string | null;
  countrySubdivision: string | null;
  value: unknown;
  unit: string;
  authoritySource: string;
  notes?: string;
}

const COUNTRY_KEYS = ["taxRate", "costRateTaxes", "countryRiskPremium", "inflationRate", "depreciationYears", "capitalGainsRate"] as const;
const STATE_KEYS = ["taxRate", "costRateTaxes"] as const;

function unitFor(key: string): string {
  if (key === "depreciationYears") return "years";
  if (key === "daysPerMonth") return "days";
  return "%";
}

function authorityForCountryKey(key: string, country: string): string {
  const def = COUNTRY_DEFAULTS[country]!;
  switch (key) {
    case "depreciationYears":
      return def.depreciationAuthority;
    case "taxRate":
      return `${country} corporate income tax statute`;
    case "costRateTaxes":
      return `${country} property/real-estate tax authority`;
    case "countryRiskPremium":
      return "Damodaran NYU Stern Country Risk Premium (Jan 2026)";
    case "inflationRate":
      return `${country} central bank long-run inflation target`;
    case "capitalGainsRate":
      return `${country} capital gains tax statute`;
    default:
      return `${country} regulatory authority`;
  }
}

function authorityForStateKey(key: string, state: string): string {
  switch (key) {
    case "taxRate":
      return `IRS § 11 federal corporate tax + ${state} state corporate income tax`;
    case "costRateTaxes":
      return `${state} county/municipal property tax assessor`;
    default:
      return `${state} regulatory authority`;
  }
}

function notesFor(key: string, country: string): string | undefined {
  if (key === "inflationRate" && (country === "Argentina" || country === "El Salvador" || country === "Panama")) {
    return "USD-indexed/dollarized economy — reflects USD escalation, not local currency";
  }
  return undefined;
}

/**
 * Ensure the unique index that backs `upsertCanonical`'s `onConflictDoUpdate`
 * exists before any upsert runs. The schema declares this constraint as
 * `uq_mc_key_country_subdivision` in `shared/schema/model-canonicals.ts`
 * (the source of truth), and `script/seed-production.sql`'s prologue
 * mirrors the same `CREATE UNIQUE INDEX IF NOT EXISTS` for production
 * recovery. This in-seed safety net handles dev DBs that pre-date the
 * schema entry — without it, the seeder logs
 * `[seed:model-constants] skipped (will retry next boot)` on every dev
 * boot because the production-sql seed is gated to NODE_ENV=production.
 *
 * `IF NOT EXISTS` makes this a no-op when the schema-managed constraint
 * is already present, so the schema remains the source of truth.
 */
async function ensureCanonicalUniqueIndex(): Promise<void> {
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_mc_key_country_subdivision
      ON model_constants (constant_key, country, country_subdivision)
  `);
}

export async function seedModelConstants(opts: { silent?: boolean } = {}): Promise<{ upserted: number }> {
  const log = opts.silent ? () => {} : (msg: string) => console.log(msg);

  // Self-heal: guarantee the unique index exists before any upsert. Drizzle's
  // `onConflictDoUpdate` requires a real arbiter index, and without it the
  // first row throws and the whole seed gets skipped.
  await ensureCanonicalUniqueIndex();

  const rows: SeedRow[] = [];

  // Universal: daysPerMonth
  rows.push({
    constantKey: "daysPerMonth",
    country: null,
    countrySubdivision: null,
    value: DAYS_PER_MONTH,
    unit: "days",
    authoritySource: "Norfolk AI hospitality modelling convention (USALI annualisation)",
  });

  // Country-keyed
  for (const country of Object.keys(COUNTRY_DEFAULTS)) {
    const def = COUNTRY_DEFAULTS[country]!;
    const valueByKey: Record<typeof COUNTRY_KEYS[number], unknown> = {
      taxRate: def.taxRate,
      costRateTaxes: def.costRateTaxes,
      countryRiskPremium: def.countryRiskPremium,
      inflationRate: def.inflationRate,
      depreciationYears: def.depreciationYears,
      capitalGainsRate: def.capitalGainsRate,
    };
    for (const key of COUNTRY_KEYS) {
      rows.push({
        constantKey: key,
        country,
        countrySubdivision: null,
        value: valueByKey[key],
        unit: unitFor(key),
        authoritySource: authorityForCountryKey(key, country),
        notes: notesFor(key, country),
      });
    }
  }

  // US state overlays
  for (const state of Object.keys(US_STATE_DEFAULTS)) {
    const def = US_STATE_DEFAULTS[state]!;
    const valueByKey: Record<typeof STATE_KEYS[number], unknown> = {
      taxRate: def.taxRate,
      costRateTaxes: def.costRateTaxes,
    };
    for (const key of STATE_KEYS) {
      rows.push({
        constantKey: key,
        country: "United States",
        countrySubdivision: state,
        value: valueByKey[key],
        unit: unitFor(key),
        authoritySource: authorityForStateKey(key, state),
      });
    }
  }

  // Upsert all rows
  let upserted = 0;
  for (const row of rows) {
    await storage.upsertCanonical({
      constantKey: row.constantKey,
      country: row.country,
      countrySubdivision: row.countrySubdivision,
      value: row.value,
      unit: row.unit,
      authoritySource: row.authoritySource,
      notes: row.notes ?? null,
    });
    upserted += 1;
  }

  // Summary by key
  const byKey = new Map<string, number>();
  for (const r of rows) byKey.set(r.constantKey, (byKey.get(r.constantKey) ?? 0) + 1);
  log(`\nSeeded ${upserted} canonical rows:`);
  for (const [k, n] of Array.from(byKey.entries()).sort()) {
    log(`  ${k.padEnd(22)} ${n}`);
  }
  log("");

  return { upserted };
}

// Only auto-run when invoked directly (`tsx script/seed-model-constants.ts`).
// pathToFileURL handles absolute/relative path differences and platform-specific
// separators so the comparison is robust across environments.
const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
  seedModelConstants()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exit(1);
    });
}
