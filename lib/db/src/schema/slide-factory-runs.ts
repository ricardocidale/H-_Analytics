/**
 * slide_factory_runs — resumable run state for the LB slide factory pipeline.
 *
 * One row per factory run. Status alone encodes both position in the pipeline
 * and phase state — currentTab is derivable from status and is not stored
 * separately (two sources of truth would drift).
 *
 * Status → tab mapping:
 *   new              Tab 1  Brief not yet submitted
 *   brief_ready      Tab 1  Brief accepted, Lorenzo not yet started
 *   ingesting        Tab 2  Lorenzo team running
 *   ingested         Tab 3  Lorenzo complete, properties ready to assign
 *   drafting         Tab 4  Lucca running
 *   draft_review     Tab 4  Lucca complete, awaiting admin approval
 *   building         Tab 5  Marco dispatching, slide teams running
 *   complete         Tab 6  All slides approved, deck rendered
 *   error            Any    Fatal failure
 *
 * Property assignments are snapshotted as four FK columns (not JSONB) so that
 * ON DELETE SET NULL fires automatically if a property is deleted while a run
 * is paused. The run-resume path checks for nulled columns and surfaces a
 * recoverable error.
 */
import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./auth";
import { properties } from "./properties";

export const SLIDE_FACTORY_RUN_STATUSES = [
  "new",           // Tab 1 not yet submitted
  "brief_ready",   // Brief accepted, Lorenzo not yet started
  "ingesting",     // Tab 2: Lorenzo team running
  "ingested",      // Tab 2 complete; property assignments ready
  "drafting",      // Tab 4: Lucca running
  "draft_review",  // Tab 4: awaiting admin slot approval
  "building",      // Tab 5: Marco dispatching slide teams
  "complete",      // Tab 6: deck rendered and downloadable
  "rebuilding",    // Tab 6: admin override triggered lightweight PDF re-render
  "error",         // Any stage failed fatally
] as const;
export type SlideFactoryRunStatus = (typeof SLIDE_FACTORY_RUN_STATUSES)[number];

// JSONB shape for one narrative slot in Lucca's draft (Tab 4)
export interface LuccaSlotDraft {
  value: string;
  approved: boolean;
  approvedAt: string | null; // ISO 8601
  // "lucca" = original LLM-authored; "admin" = edited during Tab 4 draft_review;
  // "admin-override" = edited post-completion via the Tab 6 override panel
  source: "lucca" | "admin" | "admin-override";
}

// JSONB shape for one slide's agent result (Tab 5)
export interface SlideAgentResult {
  status: "pending" | "running" | "approved" | "rejected";
  pixelDiffPct: number | null;      // Dino Pass 1 (0–100 %)
  mayaVerdict: "ok" | "advisory" | "warning" | "block" | null; // Maya Pass 2
  mayaNotes: string | null;         // Maya rejection reason
  approvedAt: string | null;        // ISO 8601
  errorMessage: string | null;
}

export const slideFactoryRuns = pgTable(
  "slide_factory_runs",
  {
    id: serial("id").primaryKey(),

    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // DB-enforced status constraint — prevents stale strings from LLM or bugs
    status: text("status")
      .notNull()
      .default("new")
      .$type<SlideFactoryRunStatus>(),

    // Tab 1 — Brief
    briefR2Key: text("brief_r2_key"),
    briefFilename: text("brief_filename"),
    briefAccepted: boolean("brief_accepted").notNull().default(false),

    // Tab 2 — Lorenzo canonical ingestion output
    canonicalSpec: jsonb("canonical_spec"),
    canonicalPngKeys: jsonb("canonical_png_keys").$type<string[]>(),

    // Tab 3 — Property assignments (snapshotted FKs; ON DELETE SET NULL)
    // Slide 4 (portfolio grid) and Slide 6 (income statement) are auto-generated
    // from the portfolio — no property assignment needed.
    slide1PropertyId: integer("slide1_property_id").references(
      () => properties.id,
      { onDelete: "set null" },
    ),
    slide2PropertyId: integer("slide2_property_id").references(
      () => properties.id,
      { onDelete: "set null" },
    ),
    slide3PropertyId: integer("slide3_property_id").references(
      () => properties.id,
      { onDelete: "set null" },
    ),
    slide5PropertyId: integer("slide5_property_id").references(
      () => properties.id,
      { onDelete: "set null" },
    ),

    // Tab 4 — Lucca narrative slot draft (keyed by slot name)
    luccaDraft: jsonb("lucca_draft")
      .$type<Record<string, LuccaSlotDraft>>(),

    // Tab 5 — Per-slide agent results (keyed by "slide1".."slide6")
    agentResults: jsonb("agent_results")
      .$type<Record<string, SlideAgentResult>>(),

    // Tab 6 — Final rendered deck
    deckR2Key: text("deck_r2_key"),

    // Enzo verdict cache — keyed by "slide1".."slide6"; value is the
    // SHA-256-like content hash of all slot draft values for that slide at the
    // time the last approved Maya verdict was recorded. Used to skip re-judging
    // unchanged slides on Marco retrigger from `error` status.
    slotContentHashes: jsonb("slot_content_hashes")
      .$type<Record<string, string>>(),

    // Timestamps
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`NOW()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`NOW()`),
  },
  (table) => [
    index("slide_factory_runs_user_id_idx").on(table.userId),
    index("slide_factory_runs_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
  ],
);

export type SlideFactoryRun = typeof slideFactoryRuns.$inferSelect;
export type InsertSlideFactoryRun = typeof slideFactoryRuns.$inferInsert;
