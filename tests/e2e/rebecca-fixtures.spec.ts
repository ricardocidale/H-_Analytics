/**
 * End-to-end coverage for the Rebecca preview-fixtures admin flow
 * (Task #561).
 *
 * Storage CRUD is already covered by API-level tests, but the full
 * admin UI flow — open Test Chat → run a preview turn → save it as
 * a fixture → replay it → see the diff dialog and per-turn badges →
 * load the snapshot's settings → delete the fixture — was not
 * exercised end-to-end. This spec is the runnable form of that flow.
 *
 * The dev server's `DEV_SKIP_AUTH=true` (server/dev-flags.ts) seeds
 * a super_admin session for any browser context, so no interactive
 * login is needed — the original blocker called out in task-561
 * (the OIDC sessions-table schema error) does not apply when
 * Playwright drives the dev server already wired by
 * `playwright.config.ts → webServer`.
 *
 * `/api/chat` would otherwise call a real LLM provider on every
 * preview turn, which is non-deterministic and burns paid quota.
 * We intercept it with `page.route()` and return synthetic responses
 * so the spec is fast, deterministic, and free of API key
 * requirements.
 *
 * Cleanup: every fixture this spec creates is named with the
 * `FIXTURE_PREFIX` below. We purge any matching rows via the
 * admin-gated `/api/rebecca/fixtures` endpoints in `beforeAll` and
 * `afterAll`, so a failed prior run cannot pollute the next run and
 * we never leave debris in the dev DB.
 *
 * Run locally:
 *   npx playwright test tests/e2e/rebecca-fixtures.spec.ts
 */
import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

const FIXTURE_PREFIX = "e2e-rebecca-fixture";

/**
 * Per-run unique fixture name. Embedding the timestamp keeps two
 * concurrent runs (CI + local) from colliding on the unique-name
 * constraint and makes it trivial to spot debris by prefix.
 */
function uniqueFixtureName(): string {
  return `${FIXTURE_PREFIX}-${Date.now().toString(36)}`;
}

interface RebeccaFixtureRow {
  id: number;
  name: string;
}

async function listFixtures(request: APIRequestContext): Promise<RebeccaFixtureRow[]> {
  const res = await request.get("/api/rebecca/fixtures");
  if (!res.ok()) {
    throw new Error(
      `GET /api/rebecca/fixtures failed: HTTP ${res.status()} ${res.statusText()}`,
    );
  }
  const rows = (await res.json()) as RebeccaFixtureRow[];
  if (!Array.isArray(rows)) {
    throw new Error("GET /api/rebecca/fixtures returned a non-array body");
  }
  return rows;
}

/**
 * Best-effort cleanup helper for the before/after hooks. We swallow
 * transient errors here on purpose — if the fixtures API is down at
 * the start or end of the run we don't want pre-test bookkeeping to
 * mask the real test result. The in-test `listFixtures` call uses
 * the strict variant so the "server-side deletion" assertion still
 * fails loudly if the API misbehaves.
 */
async function purgeTestFixtures(request: APIRequestContext): Promise<void> {
  let rows: RebeccaFixtureRow[];
  try {
    rows = await listFixtures(request);
  } catch {
    return;
  }
  for (const row of rows) {
    if (row.name.startsWith(FIXTURE_PREFIX)) {
      await request.delete(`/api/rebecca/fixtures/${row.id}`).catch(() => undefined);
    }
  }
}

/**
 * Stub `/api/chat` so each preview turn yields a deterministic
 * assistant reply. The shape mirrors what `server/routes/chat.ts`
 * actually returns — `response`, `sourcesUsed`, `blocksIncluded` —
 * so the React panels (BlocksIncludedBadges, SourcesUsedPanel)
 * render exactly as they would in production. We bump a per-call
 * counter into the response so the save → replay flow produces a
 * differing answer (replay #1 vs the saved baseline) and the diff
 * dialog's `differed` badge has something to show.
 */
async function stubChat(page: Page, replyText: () => string): Promise<void> {
  await page.route("**/api/chat", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        response: replyText(),
        conversationId: 0,
        suggestedChips: [],
        detectedLanguage: "en",
        sourcesUsed: [],
        blocksIncluded: ["portfolio", "knowledgeBase"],
      }),
    });
  });
}

async function openRebeccaConfig(page: Page): Promise<void> {
  await page.goto("/ai-intelligence?section=ai-agents");
  // The fixtures panel is the deepest piece of the Test Chat tab; if
  // it has rendered, the whole RebeccaConfig tree has hydrated and
  // is interactive.
  await expect(page.getByTestId("panel-rebecca-fixtures")).toBeVisible({ timeout: 30_000 });
}

test.describe("Rebecca preview fixtures — admin UI flow", () => {
  test.beforeAll(async ({ request }) => {
    await purgeTestFixtures(request);
  });

  test.afterAll(async ({ request }) => {
    await purgeTestFixtures(request);
  });

  test("save → replay → load settings → delete a preview fixture end-to-end", async ({ page, request }) => {
    test.setTimeout(120_000);

    const fixtureName = uniqueFixtureName();

    // Two distinct stubbed replies: the first becomes the saved
    // baseline; the second is what the replay returns, so the diff
    // dialog has a real "differed" turn to highlight.
    let chatCallCount = 0;
    await stubChat(page, () => {
      chatCallCount += 1;
      return chatCallCount === 1
        ? "Baseline reply for the e2e fixture flow."
        : `Replay reply #${chatCallCount} for the e2e fixture flow.`;
    });

    await openRebeccaConfig(page);

    // ── 1. Run a preview turn so there is a transcript to save ──
    const promptText = "Give me a one-line summary of the portfolio.";
    const promptInput = page.getByTestId("input-test-message");
    await expect(promptInput).toBeVisible();
    await promptInput.fill(promptText);
    await page.getByTestId("button-run-test").click();

    // Wait for the assistant turn to land — `preview-turn-assistant-1`
    // means we have one user + one assistant turn rendered (indices
    // 0 and 1 respectively).
    await expect(page.getByTestId("preview-turn-assistant-1")).toContainText(
      "Baseline reply for the e2e fixture flow.",
      { timeout: 15_000 },
    );

    // The `Save current as fixture` button is gated on userTurnCount > 0
    // and should now be enabled.
    const saveButton = page.getByTestId("button-save-fixture");
    await expect(saveButton).toBeEnabled();

    // ── 2. Save the transcript as a named fixture ───────────────
    await saveButton.click();
    await expect(page.getByTestId("dialog-save-fixture")).toBeVisible();
    await page.getByTestId("input-fixture-name").fill(fixtureName);
    await page
      .getByTestId("input-fixture-description")
      .fill("Created by tests/e2e/rebecca-fixtures.spec.ts.");
    await page.getByTestId("button-confirm-save-fixture").click();
    await expect(page.getByTestId("dialog-save-fixture")).toBeHidden({ timeout: 15_000 });

    // The new row should now be in the fixtures list. Resolve the
    // numeric id from the row's testid so we can target the exact
    // Replay / Load / Delete buttons for it.
    const fixtureRowLocator = page.locator(
      `[data-testid^="row-fixture-"]:has([data-testid^="text-fixture-name-"]:has-text("${fixtureName}"))`,
    );
    await expect(fixtureRowLocator).toBeVisible({ timeout: 15_000 });
    const fixtureTestId = await fixtureRowLocator.getAttribute("data-testid");
    expect(fixtureTestId).toMatch(/^row-fixture-\d+$/);
    const fixtureId = Number(fixtureTestId!.replace("row-fixture-", ""));
    expect(Number.isFinite(fixtureId)).toBe(true);

    // ── 3. Replay the fixture and assert the diff dialog renders ──
    await page.getByTestId(`button-replay-fixture-${fixtureId}`).click();

    const replayDialog = page.getByTestId("dialog-replay-results");
    await expect(replayDialog).toBeVisible({ timeout: 15_000 });

    // The summary band should report exactly one turn, and because
    // the second stubbed reply differs from the saved baseline, the
    // `differed` badge must be visible.
    const summary = page.getByTestId("replay-summary");
    await expect(summary).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("badge-replay-total")).toContainText("1");
    await expect(page.getByTestId("badge-replay-differed")).toBeVisible({ timeout: 15_000 });

    // The per-turn diff card for prompt #1 (userIndex = 0) should be
    // present — that's the "per-turn badges" surface the task calls
    // out as needing coverage. Because the stub returned a different
    // reply on replay, the card must carry the "Differs" badge (not
    // "Identical"), so we assert against the visible label text.
    const turnZero = page.getByTestId("replay-turn-0");
    await expect(turnZero).toBeVisible();
    await expect(turnZero).toContainText("Differs");
    await expect(turnZero).not.toContainText("Identical");

    await page.getByTestId("button-close-replay").click();
    await expect(replayDialog).toBeHidden({ timeout: 10_000 });

    // ── 4. Load settings — replaces the editor with the snapshot ──
    // The fixture's snapshot was captured from the *current* live
    // settings, so loading them back is otherwise a no-op. Bump the
    // warmth dial first so we have a value to watch flip back, which
    // gives us a real side-effect to assert beyond the toast.
    const warmthValue = page.getByTestId("value-warmth");
    const baselineWarmth = (await warmthValue.textContent())?.trim() ?? "";
    expect(baselineWarmth).not.toBe("");

    // Drive the warmth slider away from its baseline by tabbing to
    // it and arrow-keying down a few notches. The Radix Slider
    // exposes its thumb as a focusable [role="slider"]; arrow keys
    // step by the configured `step` (5 on this dial).
    const warmthThumb = page.getByTestId("slider-warmth").locator('[role="slider"]').first();
    await warmthThumb.focus();
    await warmthThumb.press("ArrowLeft");
    await warmthThumb.press("ArrowLeft");
    await expect(warmthValue).not.toHaveText(baselineWarmth);

    // Settings just changed, so the transcript was reset by the
    // RebeccaConfig effect — the save button should now be disabled.
    await expect(page.getByTestId("button-save-fixture")).toBeDisabled();

    await page.getByTestId(`button-load-fixture-settings-${fixtureId}`).click();

    // Toast surface confirms the load fired. The visible title is
    // rendered by the Radix-based toaster (client/src/components/ui/
    // toaster.tsx); Radix also injects an off-screen aria-live region
    // with the same copy, so we take `.first()` to land on the
    // visible toast and avoid a strict-mode collision.
    await expect(
      page.getByText("Fixture settings loaded").first(),
    ).toBeVisible({ timeout: 10_000 });

    // And the warmth dial should snap back to the saved baseline.
    await expect(warmthValue).toHaveText(baselineWarmth, { timeout: 10_000 });

    // ── 5. Delete the fixture via the row's destructive action ──
    // The component uses `window.confirm`; auto-accept it so the
    // delete mutation actually fires.
    page.once("dialog", (dialog) => {
      void dialog.accept();
    });
    await page.getByTestId(`button-delete-fixture-${fixtureId}`).click();

    // The row vanishes once the mutation succeeds. We assert against
    // the row testid (stable) rather than the visible name, since
    // testids never collide with prior debris.
    await expect(page.getByTestId(`row-fixture-${fixtureId}`)).toHaveCount(0, { timeout: 15_000 });

    // Belt-and-braces: verify server-side too, so a phantom deletion
    // (UI removed the row but the API still has the row) cannot
    // silently pass this spec.
    const rowsAfter = await listFixtures(request);
    expect(rowsAfter.find((r) => r.id === fixtureId)).toBeUndefined();
  });
});
