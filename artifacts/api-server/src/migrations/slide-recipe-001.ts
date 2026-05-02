/**
 * slide-recipe-001 — Create slide_recipe_elements table and seed from JSON inventory.
 *
 * Idempotent: CREATE TABLE/INDEX use IF NOT EXISTS; seed skips if rows exist.
 *
 * Table: slide_recipe_elements
 *   Full inventory of every shape on each of the 6 canonical L+B PPTX slides
 *   (287 total). is_slot=true marks per-property data slots; is_slot=false marks
 *   static template content (page numbers, brand labels, decorative images, etc.).
 *
 * Indexes:
 *   - B-tree on (slide_num, z_order) and (slide_num, name) for shape lookups
 *   - B-tree on (is_slot, kind) for slot filtering
 *   - HNSW on embedding (vector_cosine_ops) — partial (WHERE embedding IS NOT NULL)
 */

import path from "path";
import fs from "fs";
import { db, pool } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] slide-recipe-001";

const COLUMNS = [
  "slide_num", "z_order", "name", "shape_type", "kind",
  "is_slot", "slot_kind",
  "left_px", "top_px", "width_px", "height_px",
  "left_pct", "top_pct", "width_pct", "height_pct",
  "left_emu", "top_emu", "width_emu", "height_emu",
  "fill_type", "fill_color_hex",
  "template_text", "font_name", "font_size_pt",
  "bold", "italic", "color_hex", "alignment",
  "paragraphs",
  "image_content_type", "image_size_bytes", "image_width_px", "image_height_px",
  "table_rows", "table_cols", "table_cells",
  "is_page_number",
] as const;

const N = COLUMNS.length;
const BATCH_SIZE = 25; // 25 rows × 37 cols = 925 params — well within PG limit

type RecipeElement = Record<string, unknown>;

function rowValues(el: RecipeElement, slideNum: number): unknown[] {
  return [
    slideNum,
    el.z_order,
    el.name,
    el.shape_type,
    el.kind,
    el.is_slot,
    el.slot_kind ?? null,
    el.left_px,  el.top_px,  el.width_px,  el.height_px,
    el.left_pct, el.top_pct, el.width_pct, el.height_pct,
    el.left_emu, el.top_emu, el.width_emu, el.height_emu,
    el.fill_type ?? null,
    el.fill_color_hex ?? null,
    el.template_text ?? null,
    el.font_name ?? null,
    el.font_size_pt ?? null,
    el.bold ?? null,
    el.italic ?? null,
    el.color_hex ?? null,
    el.alignment ?? null,
    el.paragraphs != null ? JSON.stringify(el.paragraphs) : null,
    // picture fields (JSON key names match DB column names)
    el.image_content_type ?? null,
    el.image_size_bytes ?? null,
    el.image_width_px ?? null,
    el.image_height_px ?? null,
    // table fields (JSON uses rows/cols/cells; DB uses table_rows/table_cols/table_cells)
    el.rows ?? null,
    el.cols ?? null,
    el.cells != null ? JSON.stringify(el.cells) : null,
    Boolean(el.is_page_number),
  ];
}

async function seedElements(allRows: Array<{ slideNum: number; el: RecipeElement }>) {
  const colList = COLUMNS.join(", ");

  for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
    const batch = allRows.slice(i, i + BATCH_SIZE);
    const placeholders = batch
      .map((_, bi) =>
        `(${Array.from({ length: N }, (_, ci) => `$${bi * N + ci + 1}`).join(", ")})`
      )
      .join(", ");
    const values = batch.flatMap(({ slideNum, el }) => rowValues(el, slideNum));

    await pool.query(
      `INSERT INTO slide_recipe_elements (${colList}) VALUES ${placeholders}`,
      values
    );
  }
}

export async function runSlideRecipe001(): Promise<void> {
  // ── 1. Ensure pgvector extension ─────────────────────────────────────────
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);

  // ── 2. Create table ───────────────────────────────────────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS slide_recipe_elements (
      id              integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      slide_num       integer NOT NULL,
      z_order         integer NOT NULL,
      name            text NOT NULL,
      shape_type      text NOT NULL,
      kind            text NOT NULL,
      is_slot         boolean NOT NULL DEFAULT false,
      slot_kind       text,

      left_px         real NOT NULL,
      top_px          real NOT NULL,
      width_px        real NOT NULL,
      height_px       real NOT NULL,
      left_pct        real NOT NULL,
      top_pct         real NOT NULL,
      width_pct       real NOT NULL,
      height_pct      real NOT NULL,
      left_emu        integer NOT NULL,
      top_emu         integer NOT NULL,
      width_emu       integer NOT NULL,
      height_emu      integer NOT NULL,

      fill_type       text,
      fill_color_hex  text,

      template_text   text,
      font_name       text,
      font_size_pt    real,
      bold            boolean,
      italic          boolean,
      color_hex       text,
      alignment       text,
      paragraphs      jsonb,

      image_content_type  text,
      image_size_bytes    integer,
      image_width_px      integer,
      image_height_px     integer,

      table_rows      integer,
      table_cols      integer,
      table_cells     jsonb,

      is_page_number  boolean NOT NULL DEFAULT false,
      embedding       vector(1536),
      extracted_at    timestamptz NOT NULL DEFAULT now()
    )
  `);

  // ── 3. B-tree indexes ─────────────────────────────────────────────────────
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS sre_slide_num_z_order_idx
    ON slide_recipe_elements (slide_num, z_order)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS sre_slide_num_name_idx
    ON slide_recipe_elements (slide_num, name)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS sre_is_slot_kind_idx
    ON slide_recipe_elements (is_slot, kind)
  `);

  // ── 4. HNSW vector index (partial — only rows with embeddings) ────────────
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS sre_embedding_hnsw_idx
    ON slide_recipe_elements
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
    WHERE embedding IS NOT NULL
  `);

  // ── 5. Seed from slide-slot-recipe.json ───────────────────────────────────
  const { rows: countRows } = await pool.query<{ n: string }>(
    "SELECT COUNT(*)::text AS n FROM slide_recipe_elements"
  );
  const existing = Number(countRows[0].n);
  if (existing > 0) {
    logger.info(`${TAG}: table already seeded (${existing} rows) — skipping`);
    return;
  }

  const recipePath = path.resolve(
    __dirname,
    "../../../../scripts/src/slide-slot-recipe.json"
  );
  if (!fs.existsSync(recipePath)) {
    logger.warn(
      `${TAG}: recipe JSON not found at ${recipePath} — table created but not seeded. ` +
      `Run scripts/src/extract_slot_recipe.py then restart the server to seed.`
    );
    return;
  }

  const recipe = JSON.parse(fs.readFileSync(recipePath, "utf-8")) as {
    slides: Record<string, { elements: RecipeElement[] }>;
  };

  const allRows: Array<{ slideNum: number; el: RecipeElement }> = [];
  for (const [slideNumStr, slideData] of Object.entries(recipe.slides)) {
    const slideNum = parseInt(slideNumStr, 10);
    for (const el of slideData.elements) {
      allRows.push({ slideNum, el });
    }
  }

  await seedElements(allRows);
  logger.info(`${TAG}: seeded ${allRows.length} slide recipe elements`);
}
