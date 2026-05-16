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
 *   substituting     Tab 5  Factory v2: PPTX template substitution in progress
 *   converting_pdf   Tab 5  Factory v2: soffice headless export PPTX → PDF
 *   complete         Tab 6  All slides approved, deck rendered
 *   rebuilding       Tab 6  Admin override triggered lightweight PDF re-render
 *   error            Any    Fatal failure
 *
 * Property assignments are snapshotted as five FK columns (not JSONB) so that
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
  "new",            // Tab 1 not yet submitted
  "brief_ready",    // Brief accepted, Lorenzo not yet started
  "ingesting",      // Tab 2: Lorenzo team running
  "ingested",       // Tab 2 complete; property assignments ready
  "drafting",       // Tab 4: Lucca running
  "draft_review",   // Tab 4: awaiting admin slot approval
  "building",       // Tab 5: Marco dispatching slide teams
  "substituting",   // Factory v2: PPTX template substitution in progress
  "converting_pdf", // Factory v2: soffice headless export PPTX → PDF
  "complete",       // Tab 6: deck rendered and downloadable
  "rebuilding",     // Tab 6: admin override triggered lightweight PDF re-render
  "error",          // Any stage failed fatally
] as const;
export type SlideFactoryRunStatus = (typeof SLIDE_FACTORY_RUN_STATUSES)[number];

// JSONB shape for one wish-list log entry. Lucca emits these whenever a slot's
// LLM "best-shot" filled in narrative data the app does not natively track.
// The wish-list slide builder reads this array post-completion (R8).
export interface WishListLogEntry {
  field: string;          // missing-data field name (e.g. "transformation_budget")
  slot: string;           // canonical slot key the gap surfaced in (e.g. "slide3_transformation")
  slideNumber: number;    // 1..6 — slide that needed the data
  whyItHelps: string;     // 1-sentence rationale shown on the wish-list slide
}

// JSONB shape for one narrative slot in Lucca's draft (Tab 4)
export interface LuccaSlotDraft {
  value: string;
  approved: boolean;
  approvedAt: string | null; // ISO 8601
  // "lucca" = original LLM-authored; "admin" = edited during Tab 4 draft_review;
  // "admin-override" = edited post-completion via the Tab 6 override panel
  source: "lucca" | "admin" | "admin-override";
}

// JSONB shape for one finding from Bianca's visual quality verification
export interface VerificationFinding {
  slideNumber: number;      // 1-based
  severity: "ok" | "advisory" | "warning" | "block";
  category: "text_cutoff" | "placeholder" | "readability" | "layout" | "consistency" | "data_quality";
  description: string;
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
    // Factory v2 (R11): slide 1 is a multi-property overview (no single-property
    // assignment); slide 4 gains a single-property assignment (Hazelnis in the
    // current canonical set). slide 6 (income statement) is auto-generated
    // from the portfolio — no property assignment needed.
    //
    // TODO U4/U8/U11: drop `slide1_property_id` column in a follow-up PR once
    // every call site has been converted to read `slide4PropertyId` per
    // Factory v2 R11. Read sites span multiple units:
    //   U4 — build-lb-payload.ts (substitution-map source)
    //   U8 — marco-tools.ts, lucca-draft.ts (builder rewiring)
    //   U11 — frontend SlideFactoryPanel.tsx, slide-factory route Zod schema,
    //         smoke-producer.ts (admin UI + tooling)
    // Per the drizzle-migration-state-drift-missing-tables-2026-05-07 learning,
    // we execute this as a two-phase drop: U3 (this PR) adds the new columns
    // while the deprecated one stays addressable; the follow-up PR drops it
    // once no code path references it.
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
    slide4PropertyId: integer("slide4_property_id").references(
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

    // Factory v2 (R10) — PPTX delivered alongside the PDF. R2 key for the
    // substituted PPTX; soffice headless converts it to deckR2Key (PDF).
    pptxR2Key: text("pptx_r2_key"),

    // Factory v2 (R10) — soffice-converted PDF of the substituted PPTX.
    // Stored alongside pptxR2Key so both artifacts are retrievable by run ID.
    pdfR2Key: text("pdf_r2_key"),

    // Factory v2 (R8) — wish-list log. Each entry records narrative data
    // Lucca had to best-shot via LLM because the app does not natively track it.
    // The wish-list slide builder reads this post-completion to render slide 7.
    wishListLog: jsonb("wish_list_log")
      .$type<WishListLogEntry[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),

    // Enzo verdict cache — keyed by "slide1".."slide6"; value is the
    // SHA-256-like content hash of all slot draft values for that slide at the
    // time the last approved Maya verdict was recorded. Used to skip re-judging
    // unchanged slides on Marco retrigger from `error` status.
    slotContentHashes: jsonb("slot_content_hashes")
      .$type<Record<string, string>>(),

    // Bianca — Visual Quality Verification (T2-4)
    // Populated after deck completion by POST /api/slide-factory-runs/:id/verify.
    // Status lifecycle: null (not yet run) → "running" → "passed" | "failed" | "error"
    verificationStatus: text("verification_status")
      .$type<"running" | "passed" | "failed" | "error">(),
    verificationLog: jsonb("verification_log")
      .$type<VerificationFinding[]>(),

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
