/**
 * Task #1457 — Capital Stack Discipline placement contract.
 *
 * The four Capital Stack Discipline thresholds (runwayBufferMonths,
 * sizingOvershootPct, revenueRampDelayMonths, burnFlexDownPct) were moved
 * from the front-of-app Company Assumptions → Funding tab into the
 * admin-only Capital Stack Discipline tab in task #1400. These tests
 * lock that placement in by source-grep so a future refactor cannot
 * silently re-introduce the front-of-app card or remove the admin one.
 *
 * Source-level (not render-level) checks because:
 *   - The two component files render through several context providers
 *     (Tooltip, panel-manager, wouter), so SSR fixtures would have to
 *     stub each — buying noise, not signal. The contract under test is
 *     "which file mounts which card", and that lives in the source text.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FUNDING_SECTION = resolve(
  __dirname,
  "../components/company-assumptions/FundingSection.tsx",
);
const TABS_VIEW = resolve(
  __dirname,
  "../components/company-assumptions/CompanyAssumptionsTabsView.tsx",
);
const ADMIN_CSD_TAB = resolve(
  __dirname,
  "../components/admin/model-defaults/CapitalStackDisciplineTab.tsx",
);

describe("Company Assumptions → Funding tab no longer renders CapitalStackDisciplineCard", () => {
  it("FundingSection.tsx exports no CapitalStackDisciplineCard component", () => {
    const src = readFileSync(FUNDING_SECTION, "utf8");
    // No exported, declared, or imported reference to the legacy card.
    expect(src).not.toMatch(/function\s+CapitalStackDisciplineCard\b/);
    expect(src).not.toMatch(/<CapitalStackDisciplineCard\b/);
    expect(src).not.toMatch(/export\s+\{[^}]*CapitalStackDisciplineCard/);
  });

  it("FundingSection.tsx no longer renders fields for the four Capital Stack Discipline keys", () => {
    const src = readFileSync(FUNDING_SECTION, "utf8");
    // No bound usage like `formData.runwayBufferMonths` should remain in
    // the front-of-app card — those fields must come from the admin tab
    // via the global-assumptions overlay.
    expect(src).not.toMatch(/formData\.runwayBufferMonths/);
    expect(src).not.toMatch(/formData\.sizingOvershootPct/);
    expect(src).not.toMatch(/formData\.revenueRampDelayMonths/);
    expect(src).not.toMatch(/formData\.burnFlexDownPct/);
  });

  it("CompanyAssumptionsTabsView.tsx funding case mounts no CapitalStackDisciplineCard", () => {
    const src = readFileSync(TABS_VIEW, "utf8");
    expect(src).not.toMatch(/CapitalStackDisciplineCard/);
  });
});

describe("Admin Capital Stack Discipline tab renders the four Capital Stack Discipline fields", () => {
  it("CapitalStackDisciplineTab.tsx renders all four field testIds", () => {
    const src = readFileSync(ADMIN_CSD_TAB, "utf8");
    expect(src).toContain('testId="field-runwayBufferMonths"');
    expect(src).toContain('testId="field-sizingOvershootPct"');
    expect(src).toContain('testId="field-revenueRampDelayMonths"');
    expect(src).toContain('testId="field-burnFlexDownPct"');
  });

  it("CapitalStackDisciplineTab.tsx wires each field's onChange to the matching admin-defaults key", () => {
    const src = readFileSync(ADMIN_CSD_TAB, "utf8");
    // The admin-defaults Save flow saves these onto globalAssumptions
    // under the same key the Funding Specialist reads. A typo here would
    // silently break the read path the backend test guards.
    expect(src).toMatch(/onChange\(\s*"runwayBufferMonths"/);
    expect(src).toMatch(/onChange\(\s*"sizingOvershootPct"/);
    expect(src).toMatch(/onChange\(\s*"revenueRampDelayMonths"/);
    expect(src).toMatch(/onChange\(\s*"burnFlexDownPct"/);
  });
});
