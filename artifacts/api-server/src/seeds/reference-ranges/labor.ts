/**
 * Reference Range seeder — labor rates pass.
 *
 * Pass 3: Labor rows from existing labor_rates seed data.
 */

import { logger } from "../../logger";
import { TAG, YEAR, upsertRange } from "./helpers";

// ── Pass 3: Labor rows ────────────────────────────────────────────────────────

const LABOR_SEEDS: Array<{
  role: string; label: string; country: string; market?: string;
  low: number; mid: number; high: number; unit: string; source: string; sourceUrl?: string;
}> = [
  // US — national averages (BLS OES 2024)
  { role: "general-manager",      label: "General Manager (lodging)",       country: "US", low: 72000, mid: 95000, high: 135000, unit: "usd_annual", source: "BLS OES 11-9081 / HVS salary survey 2024", sourceUrl: "https://www.bls.gov/oes/" },
  { role: "revenue-manager",      label: "Revenue Manager",                 country: "US", low: 55000, mid: 72000, high: 98000,  unit: "usd_annual", source: "BLS OES 13-2051 proxy / Hcareers 2024", sourceUrl: "https://www.bls.gov/oes/" },
  { role: "front-desk-clerk",     label: "Front Desk / Guest Services",     country: "US", low: 32000, mid: 37440, high: 48000,  unit: "usd_annual", source: "BLS OES 43-4081 2024", sourceUrl: "https://www.bls.gov/oes/" },
  { role: "housekeeper",          label: "Housekeeper / Room Attendant",    country: "US", low: 28000, mid: 33280, high: 44000,  unit: "usd_annual", source: "BLS OES 37-2012 2024", sourceUrl: "https://www.bls.gov/oes/" },
  { role: "executive-chef",       label: "Executive Chef",                  country: "US", low: 58000, mid: 75000, high: 110000, unit: "usd_annual", source: "BLS OES 35-1011 2024", sourceUrl: "https://www.bls.gov/oes/" },
  { role: "food-service-manager", label: "Food & Beverage Manager",         country: "US", low: 48000, mid: 62000, high: 85000,  unit: "usd_annual", source: "BLS OES 11-9051 2024", sourceUrl: "https://www.bls.gov/oes/" },
  { role: "marketing-manager",    label: "Marketing Manager",               country: "US", low: 52000, mid: 68000, high: 95000,  unit: "usd_annual", source: "BLS OES 11-2021 / Hcareers 2024", sourceUrl: "https://www.bls.gov/oes/" },
  { role: "maintenance",          label: "Maintenance / Engineering Tech",  country: "US", low: 34000, mid: 41600, high: 58000,  unit: "usd_annual", source: "BLS OES 49-9071 2024", sourceUrl: "https://www.bls.gov/oes/" },
  // Eden, UT premium (Utah mountain resort market — ~15% above US general)
  { role: "general-manager",      label: "General Manager — Eden UT",       country: "US", market: "Eden UT",      low: 85000,  mid: 110000, high: 155000, unit: "usd_annual", source: "Utah DOL / resort market premium 2024" },
  { role: "front-desk-clerk",     label: "Front Desk — Eden UT",            country: "US", market: "Eden UT",      low: 36000,  mid: 43000,  high: 55000,  unit: "usd_annual", source: "Utah DOL 2024" },
  // Medellín, CO (DANE / Colombian hospitality industry 2024, in USD at ~3,100 COP/USD)
  { role: "general-manager",      label: "General Manager — Medellín",      country: "CO", market: "Medellín",     low: 18000,  mid: 24000,  high: 36000,  unit: "usd_annual", source: "DANE / Colombian hospitality industry 2024", sourceUrl: "https://www.dane.gov.co" },
  { role: "front-desk-clerk",     label: "Front Desk — Medellín",           country: "CO", market: "Medellín",     low: 4000,   mid: 4800,   high: 6500,   unit: "usd_annual", source: "DANE / SMLV + hospitality premium 2024", sourceUrl: "https://www.dane.gov.co" },
  { role: "housekeeper",          label: "Housekeeper — Medellín",          country: "CO", market: "Medellín",     low: 3600,   mid: 4200,   high: 5500,   unit: "usd_annual", source: "DANE / Colombian hospitality industry 2024", sourceUrl: "https://www.dane.gov.co" },
  { role: "executive-chef",       label: "Executive Chef — Medellín",       country: "CO", market: "Medellín",     low: 9000,   mid: 13000,  high: 20000,  unit: "usd_annual", source: "Colombian hospitality industry 2024" },
  // Cartagena (tourism premium over Medellín)
  { role: "general-manager",      label: "General Manager — Cartagena",     country: "CO", market: "Cartagena",    low: 20000,  mid: 27000,  high: 40000,  unit: "usd_annual", source: "DANE / Cartagena tourism sector 2024", sourceUrl: "https://www.dane.gov.co" },
  { role: "front-desk-clerk",     label: "Front Desk — Cartagena",          country: "CO", market: "Cartagena",    low: 4500,   mid: 5400,   high: 7000,   unit: "usd_annual", source: "DANE / Cartagena tourism sector 2024", sourceUrl: "https://www.dane.gov.co" },
];

export async function seedLaborRows(): Promise<void> {
  for (const r of LABOR_SEEDS) {
    await upsertRange({
      domain: "labor", metricKey: r.role, label: r.label,
      country: r.country, market: r.market ?? null,
      year: YEAR, low: r.low, mid: r.mid, high: r.high, unit: r.unit,
      sourceName: r.source, sourceUrl: r.sourceUrl ?? null,
      methodology: "Annual base salary excluding tips, overtime, and benefits load",
      confidence: "medium",
    });
  }
  logger.info(`Seeded labor rows: ${LABOR_SEEDS.length} roles`, TAG);
}
