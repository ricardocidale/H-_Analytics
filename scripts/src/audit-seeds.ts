/* eslint-disable no-console */
import { Client } from "pg";

const url = process.env.POSTGRES_URL;
if (!url) {
  console.error("POSTGRES_URL not set");
  process.exit(1);
}

interface TableExpectation {
  table: string;
  minRows: number;
  notes?: string;
}

const EXPECTATIONS: TableExpectation[] = [
  { table: "users", minRows: 1, notes: "seedAdminUser" },
  { table: "global_assumptions", minRows: 1, notes: "seedGlobalAssumptions" },
  { table: "logos", minRows: 5, notes: "seedDefaultLogos + seedBrandAssetLogos" },
  { table: "companies", minRows: 1, notes: "seedCompanies" },
  { table: "property_fee_categories", minRows: 1, notes: "seedFeeCategories (per-property)" },
  { table: "company_service_templates", minRows: 1, notes: "seedServiceTemplates (per-company)" },
  { table: "properties", minRows: 1, notes: "seedMedellinDuplex (dev)" },
  { table: "property_photos", minRows: 0, notes: "seedPropertyPhotos (best-effort)" },
  { table: "market_rates", minRows: 10, notes: "seedMarketRates" },
  { table: "market_adr_index", minRows: 1, notes: "seedMarketDataTables (1/6)" },
  { table: "market_cap_rates", minRows: 1, notes: "seedMarketDataTables (2/6)" },
  { table: "market_research", minRows: 1, notes: "seedMarketDataTables (3/6)" },
  { table: "reference_range", minRows: 5, notes: "seedReferenceRanges" },
  { table: "model_constants", minRows: 5, notes: "seedModelConstants" },
  { table: "model_defaults", minRows: 5, notes: "seedModelDefaults" },
  { table: "reference_brands", minRows: 5, notes: "seedReferenceBrandsIfEmpty" },
  { table: "external_integrations", minRows: 1, notes: "seedExternalIntegrations" },
  { table: "rebecca_guardrails", minRows: 1, notes: "rebecca-guardrails-001" },
  { table: "rebecca_knowledge_base", minRows: 1, notes: "rebecca-kb-001" },
  { table: "admin_resources", minRows: 5, notes: "admin-resources-004/005/007/008" },
  { table: "knowledge_registry", minRows: 1, notes: "seedKnowledgeRegistry" },
  { table: "country_economic_data", minRows: 1, notes: "seedCountryEconomicDataIfEmpty" },
  { table: "specialist_assignments", minRows: 1, notes: "catalog-sync backfill" },
  { table: "specialist_configs", minRows: 1, notes: "specialist catalog" },
  { table: "hospitality_benchmarks", minRows: 1, notes: "ambient-fetcher / market data" },
];

async function main() {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    // 1) Drizzle migration journal vs DB
    const dbHost = (await client.query<{ host: string }>("SELECT inet_server_addr()::text AS host")).rows[0]?.host ?? "(unknown)";
    const dbName = (await client.query<{ db: string }>("SELECT current_database() AS db")).rows[0]?.db;
    console.log(`DB: ${dbName} @ ${dbHost}`);
    console.log("");

    const drizzleApplied = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM drizzle."__drizzle_migrations"`,
    );
    console.log(`drizzle.__drizzle_migrations rows: ${drizzleApplied.rows[0].count}`);

    // 2) Existence + row counts for every expected table
    const tableNames = EXPECTATIONS.map(e => e.table);
    const existing = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema='public' AND table_name = ANY($1::text[])`,
      [tableNames],
    );
    const existingSet = new Set(existing.rows.map(r => r.table_name));

    console.log("");
    console.log("table".padEnd(28) + "exists  rows  expected  status  notes");
    console.log("-".repeat(110));

    let red = 0, yellow = 0, green = 0;
    for (const exp of EXPECTATIONS) {
      const exists = existingSet.has(exp.table);
      let rowCount = -1;
      if (exists) {
        try {
          const r = await client.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM "${exp.table}"`);
          rowCount = Number(r.rows[0].count);
        } catch {
          rowCount = -2;
        }
      }
      let status: string;
      if (!exists) { status = "MISSING"; red++; }
      else if (rowCount < 0) { status = "ERROR"; red++; }
      else if (rowCount < exp.minRows) { status = "UNDER"; yellow++; }
      else { status = "OK"; green++; }
      console.log(
        exp.table.padEnd(28) +
        String(exists).padEnd(8) +
        (rowCount >= 0 ? String(rowCount) : "-").padEnd(6) +
        String(exp.minRows).padEnd(10) +
        status.padEnd(8) +
        (exp.notes ?? ""),
      );
    }

    console.log("");
    console.log(`Summary: GREEN=${green}  YELLOW=${yellow}  RED=${red}`);
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error("audit failed:", err);
  process.exit(1);
});
