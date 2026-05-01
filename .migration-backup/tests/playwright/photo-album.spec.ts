/**
 * Executable Playwright e2e — admin photo album happy path.
 *
 * Drives the real UI end-to-end through every admin-only affordance
 * the photo-album feature ships with (upload → AI enhance → multi-
 * select move across two properties → bulk delete). The companion
 * runTest() plan in `tests/browser/photo-album.plan.md` was hand-
 * validated; this spec is the runnable form of it.
 *
 * Mandatory flow (one test, exercised in CI by default):
 *   1. GET /api/properties to pick two real properties.
 *   2. Upload a small PNG to Property A through the upload dialog.
 *   3. Promote the new photo to hero, AI-enhance it via the
 *      `button-enhance-{id}` affordance, accept the preview, and
 *      verify the `badge-enhanced-{id}` badge renders.
 *   4. Multi-select the new card via its checkbox.
 *   5. Open the move dialog, pick Property B in Move mode, confirm.
 *   6. Navigate to Property B and verify the photo arrived.
 *   7. Multi-select the moved card and bulk-delete it. Confirm the
 *      grid no longer contains the photo.
 *
 * Optional (gated by `RUN_REPLICATE=1`): the same enhance step but
 * against the real Replicate provider — useful for nightly smoke
 * tests but skipped in PR CI to avoid burning quota.
 *
 * The dev server's DEV_SKIP_AUTH=true seeds a super_admin session
 * for any browser context, so no interactive login is needed. The
 * enhance step relies on the server-side test bypass: Playwright's
 * `webServer` config in `playwright.config.ts` starts its own dev
 * server on port 8080 with `PHOTO_ENHANCE_TEST_MODE=1`, so
 * `POST /api/property-photos/:id/enhance` synthesizes a
 * deterministic preview instead of calling Replicate. The bypass
 * is dev-only — the route ignores the flag whenever
 * `NODE_ENV === "production"`. If neither the bypass nor
 * `RUN_REPLICATE=1` is available, the enhance assertions are
 * skipped with an explicit message.
 *
 * Run locally:
 *   npx playwright test tests/playwright/photo-album.spec.ts
 *
 * Playwright spawns its own dev server on port 8080 by default; set
 * `E2E_BASE_URL` (and optionally `PW_NO_WEBSERVER=1`) to point at an
 * already-running server instead. See `playwright.config.ts`.
 */
import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=";

interface PickedProperty {
  id: number;
  name: string;
}

async function pickTwoProperties(request: APIRequestContext): Promise<[PickedProperty, PickedProperty]> {
  const res = await request.get("/api/properties");
  expect(res.status(), "GET /api/properties").toBe(200);
  const properties = (await res.json()) as Array<{ id: number; name: string }>;
  expect(
    properties.length,
    "dev DB must contain at least 2 properties so the move-between-properties flow can be exercised",
  ).toBeGreaterThanOrEqual(2);
  return [
    { id: properties[0].id, name: properties[0].name },
    { id: properties[1].id, name: properties[1].name },
  ];
}

async function uploadPhoto(page: Page, propertyId: number, caption: string): Promise<number> {
  await page.goto(`/property/${propertyId}/photos`);
  await page.getByTestId("text-page-title").waitFor({ state: "visible" });

  const beforeIds = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid^="photo-card-"]')).map((el) =>
      Number((el.getAttribute("data-testid") || "").replace("photo-card-", "")),
    ),
  );

  // Open the upload dialog via either the header CTA or the empty-state
  // CTA, whichever is currently rendered.
  const headerBtn = page.getByTestId("button-upload-photo");
  const emptyBtn = page.getByTestId("button-empty-upload");
  if (await headerBtn.count()) {
    await headerBtn.first().click();
  } else {
    await emptyBtn.first().click();
  }

  // Drop a tiny PNG into the hidden file input.
  await page.getByTestId("input-file-upload").setInputFiles({
    name: `${caption}.png`,
    mimeType: "image/png",
    buffer: Buffer.from(TINY_PNG_B64, "base64"),
  });

  // Caption the queued item. PhotoUploadDialog renders one caption
  // <Input> per pending item; with a single file there is exactly one.
  await page.getByTestId("upload-item-0").locator('input[placeholder="Caption (optional)"]').fill(caption);

  // Kick off the upload and wait for the dialog to dismiss (it auto-
  // closes 500ms after success).
  await page.getByTestId("button-upload-all").click();
  await expect(page.getByTestId("button-upload-all")).toBeHidden({ timeout: 30_000 });

  // Wait until a *new* photo-card appears in the grid.
  await expect
    .poll(
      async () =>
        await page.evaluate((before) => {
          const ids = Array.from(document.querySelectorAll('[data-testid^="photo-card-"]')).map((el) =>
            Number((el.getAttribute("data-testid") || "").replace("photo-card-", "")),
          );
          return ids.find((id) => !before.includes(id)) ?? null;
        }, beforeIds),
      { timeout: 30_000, message: "new photo-card-* must render after upload" },
    )
    .not.toBeNull();

  const newId = await page.evaluate((before) => {
    const ids = Array.from(document.querySelectorAll('[data-testid^="photo-card-"]')).map((el) =>
      Number((el.getAttribute("data-testid") || "").replace("photo-card-", "")),
    );
    return ids.find((id) => !before.includes(id))!;
  }, beforeIds);

  expect(typeof newId, "newPhotoId must be a number").toBe("number");
  return newId;
}

async function selectPhoto(page: Page, photoId: number) {
  // Hover the card so the selection checkbox is visible (it lives in
  // the hover overlay), then click it.
  const card = page.getByTestId(`photo-card-${photoId}`);
  await card.hover();
  await page.getByTestId(`checkbox-photo-${photoId}`).click();
  await expect(page.getByTestId("bulk-toolbar")).toBeVisible();
  await expect(page.getByTestId("text-selected-count")).toContainText("1");
}

/**
 * Drives the AI enhance flow through the actual UI: clicks the hero
 * `button-enhance-*` affordance, asserts the preview dialog renders,
 * waits for the enhanced image to land, then clicks the in-dialog
 * Accept button. After the dialog closes we assert the enhanced
 * badge is rendered on the card.
 *
 * The server-side bypass (`PHOTO_ENHANCE_TEST_MODE=1`, set by
 * playwright.config.ts's `webServer`) keeps this fast and free of
 * Replicate quota in CI; with `RUN_REPLICATE=1` we wait the full
 * provider window. The skip path only triggers when an advanced
 * user explicitly points the spec at a server without the bypass.
 */
async function enhancePhoto(
  page: Page,
  request: APIRequestContext,
  propertyId: number,
  photoId: number,
): Promise<"bypass" | "live" | "skipped"> {
  const useLive = process.env.RUN_REPLICATE === "1";

  // Promote the photo to hero so the enhance affordance renders
  // (button-enhance-* is hero-only by design). Auto-promotion of the
  // first photo already happens server-side, but we set it explicitly
  // for clarity and so this works even if the album already had a
  // hero.
  const setHero = await request.patch(`/api/properties/${propertyId}/photos/${photoId}`, {
    data: { isHero: true },
    headers: { "Content-Type": "application/json" },
  });
  expect(setHero.status(), "PATCH set isHero").toBeLessThan(400);
  await page.reload();

  const card = page.getByTestId(`photo-card-${photoId}`);
  await expect(card).toBeVisible({ timeout: 15_000 });

  // The enhance button is hidden behind a hover state (opacity-0,
  // group-hover:opacity-100). Hover the card so it becomes visible.
  await card.hover();
  const enhanceBtn = page.getByTestId(`button-enhance-${photoId}`);
  await expect(enhanceBtn).toBeVisible({ timeout: 5_000 });
  await enhanceBtn.click();

  // Dialog should open immediately. The loading state renders during
  // the in-flight enhance mutation; in bypass mode the round-trip is
  // ~100ms so we assert it best-effort (don't fail the test if the
  // network was faster than the next Playwright poll).
  const dialog = page.getByTestId("dialog-enhance-preview");
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  const loading = page.getByTestId("enhance-loading");
  const sawLoading = await loading
    .waitFor({ state: "visible", timeout: 2_000 })
    .then(() => true)
    .catch(() => false);
  test.info().annotations.push({
    type: "enhance-loading-observed",
    description: String(sawLoading),
  });

  // Wait for the enhanced preview to land. In bypass mode this is
  // ~instant; in live mode we allow the full Replicate window.
  // We assert via the original-vs-enhanced side-by-side images,
  // which only render after `enhancedSrc` is populated.
  const previewTimeout = useLive ? 180_000 : 30_000;
  try {
    await expect(page.getByTestId("img-enhance-enhanced")).toBeVisible({
      timeout: previewTimeout,
    });
  } catch (err) {
    // Server returned an error (closed the dialog + toast). Decide
    // whether to skip (only if user opted out of webServer) or fail.
    const optedOutOfWebServer =
      !!process.env.E2E_BASE_URL || process.env.PW_NO_WEBSERVER === "1";
    if (optedOutOfWebServer) {
      test.info().annotations.push({
        type: "skipped-step",
        description:
          "Enhance preview never rendered on the external server. Set PHOTO_ENHANCE_TEST_MODE=1 on that server (dev) or RUN_REPLICATE=1 with quota.",
      });
      // Best-effort: dismiss any leftover dialog.
      await page.keyboard.press("Escape").catch(() => {});
      return "skipped";
    }
    throw err;
  }

  // Both halves of the comparison should be present.
  await expect(page.getByTestId("img-enhance-original")).toBeVisible();

  // Click the in-dialog accept button. This is the canonical UI
  // action — the click handler invokes the same /enhance/accept
  // endpoint exercised separately in the API-level tests.
  await page.getByTestId("button-accept-enhance").click();

  // Dialog should close, badge should appear on the card.
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await expect(page.getByTestId(`badge-enhanced-${photoId}`)).toBeVisible({
    timeout: 15_000,
  });

  return useLive ? "live" : "bypass";
}

test.describe("Admin photo album — happy path", () => {
  test("upload → enhance → select → move → bulk-delete across two properties", async ({ page, request }) => {
    test.setTimeout(240_000);
    const [propertyA, propertyB] = await pickTwoProperties(request);
    const tag = `e2e-photoalbum-${Date.now().toString(36)}`;

    let movedPhotoId: number | null = null;
    try {
      // ── Step 1: Upload to Property A ──────────────────────────────
      const photoId = await uploadPhoto(page, propertyA.id, tag);
      movedPhotoId = photoId;

      // ── Step 2: AI enhance the photo and accept the preview ──────
      const enhanceMode = await enhancePhoto(page, request, propertyA.id, photoId);
      test.info().annotations.push({ type: "enhance-mode", description: enhanceMode });

      // ── Step 3: Select that photo on Property A ──────────────────
      await selectPhoto(page, photoId);

      // ── Step 4: Open move dialog ─────────────────────────────────
      await page.getByTestId("button-bulk-move").click();
      await expect(page.getByTestId("dialog-move-photos")).toBeVisible();

      // ── Step 5: Pick Property B and confirm move ─────────────────
      // The destination list filters the current property out, so
      // Property B must be visible without searching. Use the search
      // box to narrow if there are many properties.
      const search = page.getByTestId("input-property-search");
      if (await search.count()) {
        await search.first().fill(propertyB.name);
      }
      await page.getByTestId(`option-property-${propertyB.id}`).click();
      await page.getByTestId("button-confirm-move").click();
      await expect(page.getByTestId("dialog-move-photos")).toBeHidden({ timeout: 15_000 });

      // ── Step 6: Property A no longer shows the photo ─────────────
      await expect(page.getByTestId(`photo-card-${photoId}`)).toBeHidden({ timeout: 15_000 });

      // ── Step 7: Property B now shows the photo ───────────────────
      await page.goto(`/property/${propertyB.id}/photos`);
      await page.getByTestId("text-page-title").waitFor({ state: "visible" });
      await expect(page.getByTestId(`photo-card-${photoId}`)).toBeVisible({ timeout: 15_000 });

      // ── Step 8: Multi-select on Property B and bulk-delete ───────
      await selectPhoto(page, photoId);
      await page.getByTestId("button-bulk-delete").click();
      await expect(page.getByTestId("dialog-bulk-delete")).toBeVisible();
      await page.getByTestId("button-confirm-bulk-delete").click();
      await expect(page.getByTestId("dialog-bulk-delete")).toBeHidden({ timeout: 15_000 });

      await expect(page.getByTestId(`photo-card-${photoId}`)).toBeHidden({ timeout: 15_000 });

      // Photo no longer exists -> safety-net cleanup not needed.
      movedPhotoId = null;
    } finally {
      // Defensive cleanup if any assertion failed mid-flow. 204/404
      // are both acceptable terminal states.
      if (movedPhotoId != null) {
        for (const propId of [propertyA.id, propertyB.id]) {
          await request
            .delete(`/api/properties/${propId}/photos/${movedPhotoId}`)
            .catch(() => undefined);
        }
      }
    }
  });
});
