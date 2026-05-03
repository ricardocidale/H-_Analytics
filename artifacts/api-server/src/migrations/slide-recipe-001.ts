/**
 * slide-recipe-001 — Idempotent seed for slide_recipe_elements from JSON inventory.
 *
 * The schema (table, B-tree indexes, HNSW vector index) is owned by Drizzle
 * migrations. This seed only loads the per-shape inventory for the 6 canonical
 * L+B PPTX slides from `scripts/src/slide-slot-recipe.json` and skips if rows
 * already exist.
 */

import path from "path";
import fs from "fs";
import { pool } from "../db";
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
  // Skip if already seeded.
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
      `${TAG}: recipe JSON not found at ${recipePath} — skipping seed. ` +
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
