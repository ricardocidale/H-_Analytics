/**
 * assumption-guardrails seed — Code-side seed for the `assumption_guardrails`
 * table read by the deterministic minion Fabio
 * (`lib/engine/src/analyst/minions/fabio.ts`) to decide every range badge's
 * green/yellow/red dot and "out of range" chip.
 *
 * Migration `0055_assumption_guardrails.sql` already ships these rows for new
 * environments; this TS seed is the idempotent source of truth that runs on
 * every boot, so:
 *   - new keys land in existing DBs without a follow-up migration, and
 *   - rationale / source / target band edits propagate without DDL.
 *
 * Bounds and rationale stay aligned with migration 0055 (see header comment
 * there for sourcing). Per replit.md (2026-05-11) every value is a decimal
 * fraction of revenue.
 */

import { db } from "../db";
import { assumptionGuardrails } from "@workspace/db";
import { logger } from "../logger";
import { sql } from "drizzle-orm";

interface GuardrailSeed {
  assumptionKey: string;
  low: number;
  high: number;
  targetLow: number | null;
  targetHigh: number | null;
  unit: string;
  rationale: string;
  source: string;
}

const GUARDRAIL_SEEDS: GuardrailSeed[] = [
  // ── Vendor pass-through cost (fraction_of_revenue) ───────────────────────
  { assumptionKey: "vendor_passthrough_cost.marketing",          low: 0.010, high: 0.060, targetLow: 0.020, targetHigh: 0.040, unit: "fraction_of_revenue", rationale: "Boutique marketing pass-through typically 2–4% of revenue; outliers <1% or >6% are usually misclassified.", source: "HMA handbook + STR boutique benchmarks" },
  { assumptionKey: "vendor_passthrough_cost.it",                 low: 0.005, high: 0.040, targetLow: 0.010, targetHigh: 0.025, unit: "fraction_of_revenue", rationale: "IT pass-through typically 1–2.5% of revenue.", source: "HMA handbook" },
  { assumptionKey: "vendor_passthrough_cost.reservations",       low: 0.010, high: 0.050, targetLow: 0.015, targetHigh: 0.030, unit: "fraction_of_revenue", rationale: "Reservations / OTA tech 1.5–3% of revenue.", source: "STR + CBRE" },
  { assumptionKey: "vendor_passthrough_cost.accounting",         low: 0.005, high: 0.030, targetLow: 0.010, targetHigh: 0.020, unit: "fraction_of_revenue", rationale: "Outsourced accounting 1–2% of revenue.", source: "HVS" },
  { assumptionKey: "vendor_passthrough_cost.revenue_management", low: 0.005, high: 0.030, targetLow: 0.010, targetHigh: 0.020, unit: "fraction_of_revenue", rationale: "Outsourced RM 1–2% of revenue.", source: "HVS" },
  { assumptionKey: "vendor_passthrough_cost.procurement",        low: 0.002, high: 0.020, targetLow: 0.005, targetHigh: 0.012, unit: "fraction_of_revenue", rationale: "Procurement service fees 0.5–1.2% of revenue.", source: "PKF" },
  { assumptionKey: "vendor_passthrough_cost.hr",                 low: 0.005, high: 0.030, targetLow: 0.010, targetHigh: 0.020, unit: "fraction_of_revenue", rationale: "HR pass-through 1–2% of revenue.", source: "HMA handbook" },
  { assumptionKey: "vendor_passthrough_cost.design",             low: 0.000, high: 0.020, targetLow: 0.000, targetHigh: 0.010, unit: "fraction_of_revenue", rationale: "Design / brand pass-through 0–1% of revenue (project, not steady-state).", source: "Internal calibration" },
  { assumptionKey: "vendor_passthrough_cost.general_management", low: 0.010, high: 0.060, targetLow: 0.020, targetHigh: 0.040, unit: "fraction_of_revenue", rationale: "General Mgmt oversight 2–4% of revenue.", source: "HMA handbook" },
  { assumptionKey: "vendor_passthrough_cost.housekeeping",       low: 0.030, high: 0.150, targetLow: 0.060, targetHigh: 0.110, unit: "fraction_of_revenue", rationale: "Housekeeping vendor pass-through 6–11% of revenue for boutique.", source: "STR boutique" },
  { assumptionKey: "vendor_passthrough_cost.maintenance",        low: 0.010, high: 0.080, targetLow: 0.025, targetHigh: 0.060, unit: "fraction_of_revenue", rationale: "Maintenance pass-through 2.5–6% of revenue.", source: "PKF" },
  { assumptionKey: "vendor_passthrough_cost.food_beverage",      low: 0.200, high: 0.450, targetLow: 0.260, targetHigh: 0.380, unit: "fraction_of_revenue", rationale: "F&B vendor cost 26–38% of F&B revenue (COGS-heavy).", source: "CBRE F&B benchmarks" },

  // ── Mgmt Co markup factor (fraction_of_revenue) ─────────────────────────
  { assumptionKey: "mgmt_co_markup_factor.marketing",            low: 0.005, high: 0.030, targetLow: 0.010, targetHigh: 0.020, unit: "fraction_of_revenue", rationale: "Mgmt Co markup on marketing 1–2% of revenue.", source: "HMA handbook" },
  { assumptionKey: "mgmt_co_markup_factor.it",                   low: 0.002, high: 0.020, targetLow: 0.005, targetHigh: 0.012, unit: "fraction_of_revenue", rationale: "Mgmt Co markup on IT 0.5–1.2% of revenue.", source: "HMA handbook" },
  { assumptionKey: "mgmt_co_markup_factor.reservations",         low: 0.005, high: 0.025, targetLow: 0.008, targetHigh: 0.018, unit: "fraction_of_revenue", rationale: "Mgmt Co markup on reservations 0.8–1.8% of revenue.", source: "HVS" },
  { assumptionKey: "mgmt_co_markup_factor.accounting",           low: 0.002, high: 0.020, targetLow: 0.005, targetHigh: 0.012, unit: "fraction_of_revenue", rationale: "Mgmt Co markup on accounting 0.5–1.2% of revenue.", source: "HVS" },
  { assumptionKey: "mgmt_co_markup_factor.revenue_management",   low: 0.002, high: 0.020, targetLow: 0.005, targetHigh: 0.012, unit: "fraction_of_revenue", rationale: "Mgmt Co markup on RM 0.5–1.2% of revenue.", source: "HVS" },
  { assumptionKey: "mgmt_co_markup_factor.procurement",          low: 0.001, high: 0.015, targetLow: 0.003, targetHigh: 0.008, unit: "fraction_of_revenue", rationale: "Mgmt Co markup on procurement 0.3–0.8% of revenue.", source: "PKF" },
  { assumptionKey: "mgmt_co_markup_factor.hr",                   low: 0.002, high: 0.020, targetLow: 0.005, targetHigh: 0.012, unit: "fraction_of_revenue", rationale: "Mgmt Co markup on HR 0.5–1.2% of revenue.", source: "HMA handbook" },
  { assumptionKey: "mgmt_co_markup_factor.design",               low: 0.000, high: 0.015, targetLow: 0.000, targetHigh: 0.008, unit: "fraction_of_revenue", rationale: "Mgmt Co markup on design 0–0.8% of revenue.", source: "Internal calibration" },
  { assumptionKey: "mgmt_co_markup_factor.general_management",   low: 0.005, high: 0.040, targetLow: 0.012, targetHigh: 0.025, unit: "fraction_of_revenue", rationale: "Mgmt Co markup on general management 1.2–2.5% of revenue.", source: "HMA handbook" },
  { assumptionKey: "mgmt_co_markup_factor.housekeeping",         low: 0.005, high: 0.030, targetLow: 0.010, targetHigh: 0.020, unit: "fraction_of_revenue", rationale: "Mgmt Co markup on housekeeping 1–2% of revenue.", source: "STR boutique" },
  { assumptionKey: "mgmt_co_markup_factor.maintenance",          low: 0.002, high: 0.020, targetLow: 0.005, targetHigh: 0.012, unit: "fraction_of_revenue", rationale: "Mgmt Co markup on maintenance 0.5–1.2% of revenue.", source: "PKF" },
  { assumptionKey: "mgmt_co_markup_factor.food_beverage",        low: 0.005, high: 0.040, targetLow: 0.012, targetHigh: 0.025, unit: "fraction_of_revenue", rationale: "Mgmt Co markup on F&B 1.2–2.5% of revenue.", source: "CBRE F&B benchmarks" },

  // ── WACC components (fraction) ───────────────────────────────────────────
  { assumptionKey: "wacc.cost_of_equity",                        low: 0.060, high: 0.250, targetLow: 0.090, targetHigh: 0.180, unit: "fraction", rationale: "Boutique-hospitality cost of equity rarely outside 6–25%; outliers usually a unit-of-measure error.", source: "Damodaran 2025 + internal calibration" },
  { assumptionKey: "wacc.cost_of_debt",                          low: 0.030, high: 0.150, targetLow: 0.055, targetHigh: 0.095, unit: "fraction", rationale: "Senior hospitality debt 5.5–9.5% in current market.", source: "CBRE Hotel Lender Survey 2025" },
];

export async function seedAssumptionGuardrails(): Promise<void> {
  if (GUARDRAIL_SEEDS.length === 0) return;

  await db
    .insert(assumptionGuardrails)
    .values(
      GUARDRAIL_SEEDS.map((g) => ({
        assumptionKey: g.assumptionKey,
        low: g.low,
        high: g.high,
        targetLow: g.targetLow,
        targetHigh: g.targetHigh,
        unit: g.unit,
        rationale: g.rationale,
        source: g.source,
      })),
    )
    .onConflictDoUpdate({
      target: assumptionGuardrails.assumptionKey,
      set: {
        low: sql`excluded.low`,
        high: sql`excluded.high`,
        targetLow: sql`excluded.target_low`,
        targetHigh: sql`excluded.target_high`,
        unit: sql`excluded.unit`,
        rationale: sql`excluded.rationale`,
        source: sql`excluded.source`,
        updatedAt: sql`now()`,
      },
    });

  logger.info(
    `Seeded ${GUARDRAIL_SEEDS.length} assumption guardrail rows (read by Fabio)`,
    "seed",
  );
}
