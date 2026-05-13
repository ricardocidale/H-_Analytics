/**
 * schema/icp-peer-companies.ts — ICP Peer Company Registry
 *
 * Phase A1 of the ICP bracket-mix peer-derived rebuild plan
 * (docs/plans/2026-05-13-001-refactor-icp-bracket-mix-peer-derived-plan.md).
 *
 * The bracket-mix Analyst run reads ACTIVE peers from this table, fetches
 * each peer's property roster, classifies into the 4 ICP archetypes, and
 * weight-aggregates into a management-co-level bracket mix. The mgmt co's
 * own portfolio is NEVER consulted — bracket mix is a peer-derived market
 * lens, not self-classification.
 *
 * Admin surface (Admin → AI → Intelligence → Knowledge & Resources →
 * Tables) lists every peer with a per-row on/off toggle and a single
 * card-level Analyst button to regenerate the mix across all active peers.
 *
 * Read-only inventory pattern per the Knowledge & Resources contract:
 * the codebase + Neon define the inventory, admin only toggles activity
 * and triggers regeneration.
 */

import {
  pgTable,
  integer,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

import type {
  BrandArchetypeSplit,
  SplitEvidence,
  CostantinoPeerConfig,
} from "./types/jsonb-shapes";
import { bracketMixRuns } from "./bracket-mix-runs";

export const icpPeerCompanies = pgTable(
  "icp_peer_companies",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    /** Brand or operator name. Globally unique. */
    name: text("name").notNull().unique(),
    /**
     * Free-form niche tags ("luxury", "soft-brand", "performance-managed",
     * "agritourism", "glamping", "urban-lifestyle", etc.). Used by the
     * peer-research minion to weight which archetype the peer's
     * properties most likely fall into and to surface in the admin UI.
     */
    nicheTags: text("niche_tags").array(),
    /** Admin toggle. Inactive peers are excluded from the next regeneration run. */
    isActive: boolean("is_active").notNull().default(true),
    /** Origin reference — research note, brand site, or seed batch identifier. */
    sourceUrl: text("source_url"),
    /** Last time the peer-research minion successfully fetched this peer's property roster. */
    lastResearchedAt: timestamp("last_researched_at"),
    /**
     * Phase B (R1, R10) — Tiago Specialist output: per-bracket-slug weights
     * for this peer's roster, summing to 1.0. NULL = peer has never been
     * researched (cold start). Sole writer: Tiago via runForPeer().
     */
    brandArchetypeSplit: jsonb("brand_archetype_split").$type<BrandArchetypeSplit>(),
    /**
     * Phase B (R1) — Tiago Specialist output: estimated total active
     * property count for this peer's portfolio. Hugo (aggregator minion)
     * weights each peer's split by this estimate when combining into the
     * global default mix. NULL = unknown.
     */
    rosterSizeEstimate: integer("roster_size_estimate"),
    /**
     * Phase B (R1, R10) — Tiago Specialist output: citations and 5–10
     * sample properties supporting the split. Surfaced in the K&R per-peer
     * Evidence panel. NULL = never researched.
     */
    splitEvidence: jsonb("split_evidence").$type<SplitEvidence>(),
    /**
     * Phase B (R10) — FK to bracket_mix_runs.id for the most recent
     * successful Tiago run on this peer. NULL = never researched. The
     * runtime FK constraint is added in the U2 migration once
     * bracket_mix_runs exists.
     */
    lastResearchRunId: integer("last_research_run_id").references(() => bracketMixRuns.id, {
      onDelete: "set null",
    }),
    /**
     * Phase B (R13) — per-peer override of Costantino freshness defaults
     * (e.g. `{ staleAfterDays: 30 }`). NULL = inherit the source-registry
     * defaults for icp_peer_companies (90 days / weekly recheck).
     */
    costantinoConfig: jsonb("costantino_config").$type<CostantinoPeerConfig>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("icp_peer_companies_active_idx").on(t.isActive),
  ],
);

export type IcpPeerCompany = typeof icpPeerCompanies.$inferSelect;
export type InsertIcpPeerCompany = typeof icpPeerCompanies.$inferInsert;
