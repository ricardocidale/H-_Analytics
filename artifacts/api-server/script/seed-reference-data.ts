import { db } from "../src/db";
import { geographyDimension, knowledgeRegistry } from "@workspace/db";
import { COUNTRY_DEFAULTS, US_STATE_DEFAULTS, type CountryDefaults, type UsStateDefaults } from "@shared/countryDefaults";
import { sql } from "drizzle-orm";

const COUNTRY_NAME_TO_ISO: Record<string, string> = {
  "United States": "US",
  "Canada": "CA",
  "France": "FR",
  "Spain": "ES",
  "Italy": "IT",
  "Portugal": "PT",
  "Mexico": "MX",
  "Colombia": "CO",
  "Brazil": "BR",
  "Argentina": "AR",
  "El Salvador": "SV",
  "Panama": "PA",
  "United Kingdom": "GB",
  "Greece": "GR",
  "Costa Rica": "CR",
  "Dominican Republic": "DO",
  "Uruguay": "UY",
  "Peru": "PE",
};

const US_STATE_NAME_TO_CODE: Record<string, string> = {
  "Florida": "FL",
  "California": "CA",
  "New York": "NY",
  "Texas": "TX",
  "Nevada": "NV",
  "Hawaii": "HI",
  "Colorado": "CO",
  "Tennessee": "TN",
  "Georgia": "GA",
  "Arizona": "AZ",
  "New Jersey": "NJ",
  "Massachusetts": "MA",
  "Illinois": "IL",
};


export async function seedReferenceData() {
  console.log("Seeding reference data baseline...");

  // 1. Seed Geography Dimension from TS constants
  const countries = Object.entries(COUNTRY_DEFAULTS).map(([name, data]: [string, CountryDefaults]) => ({
    level: "country",
    isoCode: COUNTRY_NAME_TO_ISO[name] ?? name,
    name: name,
    currency: data.currency,
    currencySymbol: data.currencySymbol,
    isActive: true,
  }));

  const states = Object.entries(US_STATE_DEFAULTS).map(([name, data]: [string, UsStateDefaults]) => ({
    level: "state",
    parentCountryCode: "US",
    isoCode: US_STATE_NAME_TO_CODE[name] ?? name,
    name: data.label,
    currency: "USD",
    currencySymbol: "$",
    isActive: true,
  }));

  const geoRows = [...countries, ...states];

  for (const row of geoRows) {
    await db.insert(geographyDimension)
      .values(row as any)
      .onConflictDoUpdate({
        target: [geographyDimension.isoCode, geographyDimension.level],
        set: {
          name: sql`EXCLUDED.name`,
          currency: sql`EXCLUDED.currency`,
          currencySymbol: sql`EXCLUDED.currency_symbol`,
          isActive: sql`EXCLUDED.is_active`,
          updatedAt: sql`now()`,
        },
      });
  }
  console.log(`Seeded ${geoRows.length} geography rows.`);

  // 2. Register new tables in knowledge_registry for Admin Sources UI
  // NOTE: assetRef values must be hyphenated to match the BENCHMARK_TABLE_ID
  // dispatch map in knowledge-registry.ts (keyed by assetRef).
  const registryEntries = [
    {
      id: "geography-dimension",
      displayName: "Geography Dimension",
      description: "Canonical list of countries and US states/territories with financial metadata.",
      howBuilt: "Seeded from COUNTRY_DEFAULTS TS constants; expanded via Analyst research.",
      sourceDescription: "ISO-3166, Damodaran NYU Stern, local tax authorities.",
      renewalMechanism: "Manual Analyst refresh.",
      assetType: "benchmark_table",
      assetRef: "geography-dimension",
    },
    {
      id: "jurisdictional-taxes",
      displayName: "Jurisdictional Taxes",
      description: "Hotel, occupancy, and tourism taxes layered by jurisdiction (city/county/state/country).",
      howBuilt: "Analyst-driven research from municipal tax bulletins.",
      sourceDescription: "Municipal tax authorities, STR, Avalara.",
      renewalMechanism: "Manual Analyst refresh.",
      assetType: "benchmark_table",
      assetRef: "jurisdictional-taxes",
    },
    {
      id: "regulatory-fees",
      displayName: "Regulatory Fees",
      description: "Permit, licensing, and inspection fees schedule by market.",
      howBuilt: "Analyst-driven research from municipal records.",
      sourceDescription: "Local building departments, health inspectors, fire marshals.",
      renewalMechanism: "Manual Analyst refresh.",
      assetType: "benchmark_table",
      assetRef: "regulatory-fees",
    },
    {
      id: "market-cap-rates",
      displayName: "Market Cap Rates",
      description: "Time-series hospitality cap rates by city and submarket.",
      howBuilt: "Analyst-driven research from industry surveys and transaction data.",
      sourceDescription: "STR, CBRE, JLL, CoStar.",
      renewalMechanism: "Manual Analyst refresh.",
      assetType: "benchmark_table",
      assetRef: "market-cap-rates",
    },
  ];

  for (const entry of registryEntries) {
    await db.insert(knowledgeRegistry)
      .values(entry as any)
      .onConflictDoUpdate({
        target: [knowledgeRegistry.id],
        set: {
          displayName: sql`EXCLUDED.display_name`,
          description: sql`EXCLUDED.description`,
          howBuilt: sql`EXCLUDED.how_built`,
          sourceDescription: sql`EXCLUDED.source_description`,
          renewalMechanism: sql`EXCLUDED.renewal_mechanism`,
          assetType: sql`EXCLUDED.asset_type`,
          assetRef: sql`EXCLUDED.asset_ref`,
        },
      });
  }
  console.log(`Registered ${registryEntries.length} entries in knowledge_registry.`);
}

// Direct run support
import { pathToFileURL } from "url";
import { resolve } from "path";
const isDirectRun = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) {
  seedReferenceData().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
}
