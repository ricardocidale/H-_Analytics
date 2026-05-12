/**
 * icp-bracket-types.ts — Portable bracket types for the engine layer.
 *
 * Task #1409 — lightweight types used by bracket-service-consumption.ts and
 * company-engine.ts. These mirror the DB schema shapes but carry only what the
 * engine needs — no Drizzle or DB dependencies here.
 */

// ── Bracket profile (minimal engine view of icp_brackets row) ────────────────

export interface IcpBracketProfile {
  slug: string;
  name: string;
  customerType: "hotel" | "str";
  serviceConsumptionProfile: "full" | "str_only";
}

// ── Bracket mix entry (matches BracketMixEntry from @workspace/db) ───────────

export interface BracketMixEntry {
  bracketSlug: string;
  weight: number;
}
