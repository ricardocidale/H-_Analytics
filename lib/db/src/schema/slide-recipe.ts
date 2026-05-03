import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { vector } from "./vector-chunks";

// ── JSONB shapes ──────────────────────────────────────────────────────────────

export type SlideRecipeParagraph = {
  text: string;
  alignment: string;
  font_name: string | null;
  font_size_pt: number | null;
  bold: boolean | null;
  italic: boolean | null;
  color_hex: string | null;
};

export type SlideRecipeCell = {
  text: string;
  fill_color_hex: string | null;
};

// ── Table ─────────────────────────────────────────────────────────────────────

/**
 * Full inventory of every shape on each of the 6 canonical L+B PPTX slides.
 * Populated once from scripts/src/slide-slot-recipe.json at first boot.
 * Re-seeded when the canonical template changes (truncate + reseed).
 *
 * is_slot=true  → shape carries per-property data (filled by Track 1 / Track 2)
 * is_slot=false → static template content (same on every property deck)
 *
 * embedding is nullable and populated async; use NULL as the "not yet embedded"
 * sentinel rather than a zero vector.
 */
export const slideRecipeElements = pgTable(
  "slide_recipe_elements",
  {
    id: serial("id").primaryKey(),

    // Identity
    slideNum: integer("slide_num").notNull(),   // 1–6 (template slide, not deck page)
    zOrder: integer("z_order").notNull(),        // document order = Z-order (low = back)
    name: text("name").notNull(),
    shapeType: text("shape_type").notNull(),     // e.g. "AUTO_SHAPE (1)", "PICTURE (13)"
    kind: text("kind").notNull(),               // text | picture | table | shape
    isSlot: boolean("is_slot").notNull().default(false),
    slotKind: text("slot_kind"),                // text | picture | table | null

    // Geometry on 1920×1080 canvas
    leftPx: real("left_px").notNull(),
    topPx: real("top_px").notNull(),
    widthPx: real("width_px").notNull(),
    heightPx: real("height_px").notNull(),
    leftPct: real("left_pct").notNull(),
    topPct: real("top_pct").notNull(),
    widthPct: real("width_pct").notNull(),
    heightPct: real("height_pct").notNull(),
    leftEmu: integer("left_emu").notNull(),
    topEmu: integer("top_emu").notNull(),
    widthEmu: integer("width_emu").notNull(),
    heightEmu: integer("height_emu").notNull(),

    // Fill
    fillType: text("fill_type"),
    fillColorHex: text("fill_color_hex"),

    // Text (kind = 'text')
    templateText: text("template_text"),
    fontName: text("font_name"),
    fontSizePt: real("font_size_pt"),
    bold: boolean("bold"),
    italic: boolean("italic"),
    colorHex: text("color_hex"),
    alignment: text("alignment"),
    paragraphs: jsonb("paragraphs").$type<SlideRecipeParagraph[]>(),

    // Picture (kind = 'picture')
    imageContentType: text("image_content_type"),
    imageSizeBytes: integer("image_size_bytes"),
    imageWidthPx: integer("image_width_px"),
    imageHeightPx: integer("image_height_px"),

    // Table (kind = 'table')
    tableRows: integer("table_rows"),
    tableCols: integer("table_cols"),
    tableCells: jsonb("table_cells").$type<SlideRecipeCell[][]>(),

    // Flags
    isPageNumber: boolean("is_page_number").notNull().default(false),

    // Vector embedding — 1536-dim, cosine similarity, populated async
    embedding: vector("embedding", { dimensions: 1536 }),

    extractedAt: timestamp("extracted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("sre_slide_num_z_order_idx").on(t.slideNum, t.zOrder),
    index("sre_slide_num_name_idx").on(t.slideNum, t.name),
    index("sre_is_slot_kind_idx").on(t.isSlot, t.kind),
  ],
);

export type SlideRecipeElement = typeof slideRecipeElements.$inferSelect;
export type InsertSlideRecipeElement = typeof slideRecipeElements.$inferInsert;
