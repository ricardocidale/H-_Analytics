/**
 * Task #1626 — Narrow-layout visual regression test
 *
 * Renders the model-defaults flex row structure (FieldHelpers.tsx
 * PctField / DollarField / NumberField pattern) inside a real Chromium
 * browser at 768 px viewport width and asserts that every protected
 * EditableValue chip retains its natural content width.
 *
 * At 768 px the admin model-defaults tabs render a 2-column grid where each
 * card is ~270–358 px wide. Long labels carrying non-wrapping badges (like
 * ResearchRangeLabel) apply flex pressure to the chip. Without `shrink-0`
 * on the chip wrapper and `min-w-0` on the label, the chip is compressed
 * to near zero. The fixture replicates that exact container width so real
 * Chromium flexbox layout is exercised.
 *
 * Per-format minimum thresholds
 * ─────────────────────────────
 *   percent "12.00%"  natural ≈ 56 px  →  MIN = 40 px
 *   dollar  "$1,250"  natural ≈ 56 px  →  MIN = 40 px
 *   number  "24"      natural ≈ 20 px  →  MIN = 15 px
 *
 * The thresholds are set well below the protected chip's natural width but
 * well above what the chip measures when squeezed (regression control
 * confirms the unprotected chip is squeezed to ≤ 10 px in the same container).
 */

import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FIXTURE_URL =
  "file://" + path.resolve(__dirname, "../fixtures/narrow-layout.html");

/** Minimum acceptable widths per chip format (px). */
const MIN_WIDTH: Record<string, number> = {
  percent: 40,
  dollar: 40,
  number: 15,
};

/**
 * Maximum acceptable width for the UNPROTECTED regression chip (px).
 *
 * The chip's natural content width is ~56 px. In the regression card the
 * rigid label takes ~200 px in a 246 px inner container, leaving ~38 px for
 * the chip. Chromium renders it at ~30 px (with overflow:hidden clipping the
 * text). We assert ≤ 35 px — clearly below the protected MIN of 40 px, and
 * well below the chip's natural 56 px.
 */
const MAX_SQUEEZED_PX = 35;

test.describe("Model-defaults narrow-layout (768 px) — EditableValue chip width", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(FIXTURE_URL);
    await page.waitForLoadState("domcontentloaded");
  });

  // ── Individual format checks ──────────────────────────────────────────────

  test("percent chip (PctField row) is at least 40 px wide when protected", async ({
    page,
  }) => {
    const chip = page
      .locator("#card-correct [data-testid='editable-value-chip'][data-format='percent']")
      .first();
    const box = await chip.boundingBox();
    expect(box, "percent chip bounding box must be measurable").not.toBeNull();
    expect(
      box!.width,
      `percent chip must be ≥ ${MIN_WIDTH.percent}px — got ${box!.width}px`,
    ).toBeGreaterThanOrEqual(MIN_WIDTH.percent);
  });

  test("dollar chip (DollarField row) is at least 40 px wide when protected", async ({
    page,
  }) => {
    const chip = page
      .locator("#card-correct [data-testid='editable-value-chip'][data-format='dollar']")
      .first();
    const box = await chip.boundingBox();
    expect(box, "dollar chip bounding box must be measurable").not.toBeNull();
    expect(
      box!.width,
      `dollar chip must be ≥ ${MIN_WIDTH.dollar}px — got ${box!.width}px`,
    ).toBeGreaterThanOrEqual(MIN_WIDTH.dollar);
  });

  test("number chip (NumberField row) is at least 15 px wide when protected", async ({
    page,
  }) => {
    const chip = page
      .locator("#card-correct [data-testid='editable-value-chip'][data-format='number']")
      .first();
    const box = await chip.boundingBox();
    expect(box, "number chip bounding box must be measurable").not.toBeNull();
    expect(
      box!.width,
      `number chip must be ≥ ${MIN_WIDTH.number}px — got ${box!.width}px`,
    ).toBeGreaterThanOrEqual(MIN_WIDTH.number);
  });

  // ── All chips in the protected card ──────────────────────────────────────

  test("all protected chips in card-correct meet per-format minimums", async ({
    page,
  }) => {
    const chips = page.locator(
      "#card-correct [data-testid='editable-value-chip']",
    );
    const count = await chips.count();
    expect(count, "card-correct should have at least 3 chips").toBeGreaterThanOrEqual(3);

    for (let i = 0; i < count; i++) {
      const chip = chips.nth(i);
      const format = (await chip.getAttribute("data-format")) ?? "unknown";
      const minPx = MIN_WIDTH[format] ?? MIN_WIDTH.percent;
      const box = await chip.boundingBox();
      expect(
        box,
        `chip[${i}] (format=${format}) bounding box must be measurable`,
      ).not.toBeNull();
      expect(
        box!.width,
        `chip[${i}] (format=${format}) must be ≥ ${minPx}px — got ${box!.width}px`,
      ).toBeGreaterThanOrEqual(minPx);
    }
  });

  // ── Regression control — fixture verification ─────────────────────────────
  //
  // This test verifies the fixture is effective: the UNPROTECTED chip (no
  // shrink-0 wrapper, no min-w-0 on label) IS squeezed below MAX_SQUEEZED_PX.
  // If this assertion fails the fixture label isn't putting enough pressure on
  // the chip — lengthen the label text or narrow the card container.

  test("unprotected chip (no shrink-0/min-w-0) is squeezed to ≤ MAX_SQUEEZED_PX px — fixture verification", async ({
    page,
  }) => {
    const chip = page.locator(
      "[data-testid='editable-value-chip-unprotected']",
    );
    const box = await chip.boundingBox();
    expect(
      box,
      "unprotected chip bounding box must be measurable",
    ).not.toBeNull();
    expect(
      box!.width,
      `Unprotected chip measured ${box!.width}px — expected ≤ ${MAX_SQUEEZED_PX}px. ` +
        "If this fails, the fixture label is not exerting enough pressure. " +
        "Narrow the card container or lengthen the label text.",
    ).toBeLessThanOrEqual(MAX_SQUEEZED_PX);
  });

  // ── Snapshot: protected chip is visibly wider than unprotected chip ───────

  test("protected percent chip is wider than the squeezed unprotected version", async ({
    page,
  }) => {
    const protected_ = page
      .locator("#card-correct [data-testid='editable-value-chip'][data-format='percent']")
      .first();
    const unprotected = page.locator("[data-testid='editable-value-chip-unprotected']");

    const protectedBox = await protected_.boundingBox();
    const unprotectedBox = await unprotected.boundingBox();
    expect(protectedBox).not.toBeNull();
    expect(unprotectedBox).not.toBeNull();
    expect(
      protectedBox!.width,
      `protected chip (${protectedBox!.width}px) must be wider than unprotected (${unprotectedBox!.width}px)`,
    ).toBeGreaterThan(unprotectedBox!.width);
  });
});
