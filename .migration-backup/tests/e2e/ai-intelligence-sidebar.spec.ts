/**
 * Persona-first AI Intelligence sidebar + summary panel — locked-in
 * coverage.
 *
 * Background (Task #489 + #494):
 *   The AI Intelligence sidebar leads with each Specialist's *human*
 *   name (e.g. "Helena") and keeps the role label ("Tax Authority
 *   Research") as a quieter second line. The Specialist page also
 *   renders a top-of-page summary card that answers four questions
 *   for a first-time visitor: who they are, what they do, where in
 *   the app their output shows up, and which Resources they read or
 *   write — plus a Refresh cadence row for Constants Specialists.
 *
 *   None of that was protected by an automated test, so a future
 *   refactor of `AiIntelligenceSidebar.tsx` or the `SPECIALIST_CATALOG`
 *   shape could silently drop the persona-first layout (or the
 *   `summary-*` testids the rest of the admin tooling depends on).
 *
 * What this spec asserts:
 *   1. Each catalog Specialist row in the AI Intelligence sidebar
 *      exposes the new `ai-intelligence-nav-{section}-primary` and
 *      `…-secondary` testids and renders the expected human name as
 *      the primary line and the role label as the secondary line.
 *   2. Opening a non-Constants Specialist (Ana — Funding Intelligence)
 *      renders the summary panel with the Who/Job/Where/Resources
 *      sections — but no cadence row, because Funding is not a
 *      Constants Specialist.
 *   3. Opening a Constants Specialist (Helena — Tax Authority
 *      Research) renders the summary panel with all five sections,
 *      including the cadence row sourced from
 *      `refreshCadenceDays = 30 → "Monthly"`.
 *
 * The spec uses the new `data-testid` hooks named in Task #494:
 *   - `ai-intelligence-nav-{section}-primary`
 *   - `ai-intelligence-nav-{section}-secondary`
 *   - `specialist-summary-panel`
 *   - `summary-human-name`, `summary-job`
 *   - `summary-where`, `summary-resources`, `summary-cadence`
 *
 * The dev server's `DEV_SKIP_AUTH = true` (server/dev-flags.ts) seeds
 * a super_admin session for any browser context, so no interactive
 * login is needed. Playwright spawns its own dev server on port 8080
 * via `playwright.config.ts` → `webServer`; set `E2E_BASE_URL` (and
 * optionally `PW_NO_WEBSERVER=1`) to point at an already-running
 * server instead.
 *
 * Run locally:
 *   npx playwright test tests/e2e/ai-intelligence-sidebar.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";

/**
 * Expected sidebar copy for every Specialist row, kept as plain
 * literals so a silent rename in `SPECIALIST_CATALOG` (or the
 * sidebar's role-label fallback chain) trips this spec instead of
 * silently shipping. The `role` column matches the catalog's
 * `displayName ?? realName` — what `specialistRow()` in
 * `AiIntelligenceSidebar.tsx` surfaces as the secondary line.
 */
interface SpecialistRow {
  section: string;
  humanName: string;
  role: string;
}

const SPECIALIST_ROWS: readonly SpecialistRow[] = [
  { section: "specialist-mgmt-co-funding",          humanName: "Ana",      role: "Funding Intelligence" },
  { section: "specialist-mgmt-co-revenue",          humanName: "Bia",      role: "Revenue Intelligence" },
  { section: "specialist-mgmt-co-icp-intelligence", humanName: "Cecília",  role: "ICP Intelligence" },
  { section: "specialist-property-risk-intelligence", humanName: "Daniela", role: "Property Risk Intelligence" },
  { section: "specialist-property-executive-summary", humanName: "Eloá",    role: "Executive Summary" },
  { section: "specialist-photos-photo-enhancer",    humanName: "Fernanda", role: "Photo Enhancer & Renders" },
  { section: "specialist-portfolio-ops-watchdog",   humanName: "Giovanna", role: "Portfolio Watchdog" },
  { section: "specialist-constants-tax-research",   humanName: "Helena",   role: "Tax Authority Research" },
  { section: "specialist-constants-macro-research", humanName: "Isadora",  role: "Macro Indicators Research" },
  { section: "specialist-constants-depreciation-research", humanName: "Júlia",  role: "Depreciation Schedule Research" },
  { section: "specialist-constants-reporting-research",    humanName: "Kamila", role: "Reporting Conventions Research" },
  { section: "specialist-resources-builder",        humanName: "Letícia",  role: "Resource Builder" },
] as const;

/**
 * Wait for the AI Intelligence sidebar to mount. The sidebar lives
 * inside the AiIntelligence page chrome, so we key off the first
 * Specialist row's primary testid — its presence proves the sidebar
 * has rendered and the persona-first layout took.
 */
async function waitForSidebar(page: Page) {
  await expect(
    page.getByTestId(`ai-intelligence-nav-${SPECIALIST_ROWS[0].section}-primary`),
  ).toBeVisible({ timeout: 30_000 });
}

test.describe("AI Intelligence sidebar — persona-first lock-in", () => {
  test("every Specialist row leads with human name and trails with role", async ({ page }) => {
    await page.goto("/ai-intelligence");
    await waitForSidebar(page);

    for (const row of SPECIALIST_ROWS) {
      const primary = page.getByTestId(`ai-intelligence-nav-${row.section}-primary`);
      const secondary = page.getByTestId(`ai-intelligence-nav-${row.section}-secondary`);

      await expect(primary, `primary line for ${row.section}`).toBeVisible();
      await expect(primary, `primary text for ${row.section}`).toHaveText(row.humanName);

      await expect(secondary, `secondary line for ${row.section}`).toBeVisible();
      await expect(secondary, `secondary text for ${row.section}`).toHaveText(row.role);
    }
  });

  test("non-Constants Specialist summary panel renders Who/Job/Where/Resources (no cadence)", async ({ page }) => {
    // Funding (Ana) — mgmt-co Specialist, no `refreshCadenceDays`,
    // so the cadence row must be absent. Deep-linking via
    // `?section=…` mirrors how the band-drop notification emails
    // open the page and avoids a brittle click-then-navigate hop.
    await page.goto("/ai-intelligence?section=specialist-mgmt-co-funding");
    await waitForSidebar(page);

    const panel = page.getByTestId("specialist-summary-panel");
    await expect(panel).toBeVisible({ timeout: 30_000 });

    await expect(panel.getByTestId("summary-human-name")).toHaveText("Ana");
    await expect(panel.getByTestId("summary-role")).toContainText("Funding Intelligence");

    // Job (description) — sourced from the catalog; assert it
    // renders and is non-empty so a future blank `description` in
    // the catalog doesn't silently strip the only line that tells
    // an admin what this Specialist actually does.
    const job = panel.getByTestId("summary-job");
    await expect(job).toBeVisible();
    await expect(job).not.toBeEmpty();

    // Where they help — Funding's subject "mgmt-co" surfaces as
    // "Management Company pages" and its candidateFields all live
    // under "Company Assumptions". We assert the section renders
    // with both surface labels.
    const where = panel.getByTestId("summary-where");
    await expect(where).toBeVisible();
    await expect(where).toContainText("Management Company pages");
    await expect(where).toContainText("Company Assumptions");

    // Resources used — Funding declares two assignment refs in the
    // catalog (a model + a benchmark). Assert the section renders
    // with both kinds present (case-insensitive on the BENCHMARK /
    // MODEL prefixes the panel renders).
    const resources = panel.getByTestId("summary-resources");
    await expect(resources).toBeVisible();
    await expect(resources).toContainText("MODEL");
    await expect(resources).toContainText("BENCHMARK");

    // Cadence row must NOT render for non-Constants Specialists.
    await expect(panel.getByTestId("summary-cadence")).toHaveCount(0);
  });

  test("Constants Specialist summary panel renders Who/Job/Where/Resources/Cadence", async ({ page }) => {
    // Helena (Tax Authority Research) — `refreshCadenceDays = 30`
    // in the catalog → cadence row reads "Monthly".
    await page.goto("/ai-intelligence?section=specialist-constants-tax-research");
    await waitForSidebar(page);

    const panel = page.getByTestId("specialist-summary-panel");
    await expect(panel).toBeVisible({ timeout: 30_000 });

    await expect(panel.getByTestId("summary-human-name")).toHaveText("Helena");
    await expect(panel.getByTestId("summary-role")).toContainText("Tax Authority Research");

    const job = panel.getByTestId("summary-job");
    await expect(job).toBeVisible();
    await expect(job).not.toBeEmpty();

    // Constants Specialists surface the Constants tab as their
    // primary "where they help" target.
    const where = panel.getByTestId("summary-where");
    await expect(where).toBeVisible();
    await expect(where).toContainText("Constants tab");

    // Helena's catalog entry declares two assignmentRefs (model +
    // api) and three `constantsOwned` keys, all of which materialize
    // as CONSTANT — … rows in the resources list.
    const resources = panel.getByTestId("summary-resources");
    await expect(resources).toBeVisible();
    await expect(resources).toContainText("MODEL");
    await expect(resources).toContainText("API");
    await expect(resources).toContainText("CONSTANT");

    // Cadence row — gated on `defaultRefreshCadenceDays != null`.
    // 30 days maps to "Monthly" via cadenceLabel().
    const cadence = panel.getByTestId("summary-cadence");
    await expect(cadence).toBeVisible();
    await expect(cadence).toContainText("Monthly");
  });
});
