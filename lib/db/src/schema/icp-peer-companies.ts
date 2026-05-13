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
  index,
} from "drizzle-orm/pg-core";

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
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("icp_peer_companies_active_idx").on(t.isActive),
  ],
);

export type IcpPeerCompany = typeof icpPeerCompanies.$inferSelect;
export type InsertIcpPeerCompany = typeof icpPeerCompanies.$inferInsert;
