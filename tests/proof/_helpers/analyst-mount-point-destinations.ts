/**
 * Shared `MOUNT_POINT_DESTINATIONS` map for the Analyst deep-link audits.
 *
 * Why this lives in one file:
 *   The Analyst registry's mountPoint slugs (e.g. `company-assumptions/funding`,
 *   `defaults/property`) need a slug-to-file map for the static audits that
 *   verify the registry's deep-link contract end-to-end. Two audits use it:
 *
 *     1. `analyst-deep-link-destination-marker.test.ts` (task #771) — asserts
 *        every registry slug maps to a real on-disk file and every field id
 *        has a `data-field` / `data-testid` marker in that file.
 *     2. `analyst-field-registry-default-state-visibility.test.ts` (task #781)
 *        — assertion every marker in those same files is not gated by a
 *        default-off conditional render.
 *
 *   Before this module existed (task #786) each audit kept its own copy of
 *   the map. Adding a new slug to `FIELD_REGISTRY` required updating three
 *   files; only the registry edit was enforced by code, so the two audit
 *   maps silently rotted until the suite next ran. Centralising the map
 *   here means one edit covers both audits, and the registry-coverage
 *   assertion in the deep-link audit (which iterates `FIELD_REGISTRY`) is
 *   the only forcing function the next person needs to satisfy.
 *
 * Adding a new mountPoint slug:
 *   1. Add an entry below mapping the slug to the file(s) that legitimately
 *      host its `data-field` / `data-testid="field-<id>"` markers. Paths
 *      are repo-root-relative.
 *   2. The deep-link audit will fail if the registry uses a slug not
 *      present here, or if a mapped file does not exist on disk — that's
 *      the forcing function for keeping this map current.
 *
 * Multiple files per slug:
 *   Some surfaces (e.g. property-edit/* sections) are composed of several
 *   sibling files. List every file that legitimately hosts markers for the
 *   slug; the audits accept a marker appearing in any one of them.
 */
export const MOUNT_POINT_DESTINATIONS: Readonly<
  Record<string, readonly string[]>
> = {
  // Funding-tab fields are management-company-level; their `data-field`
  // markers live on the Company Assumptions funding tab, which is composed
  // entirely from FundingSection.tsx's three named cards (CapitalRaisesCard,
  // ConvertibleTermsCard, CapitalStackDisciplineCard). See
  // CompanyAssumptionsTabsView.tsx::renderBody case "funding".
  "company-assumptions/funding": [
    "client/src/components/company-assumptions/FundingSection.tsx",
  ],

  // Compensation-tab fields (partnerCompYearN / partnerCountYearN /
  // staffSalary / staffTier3Fte) are rendered across PartnerCompSection
  // and CompensationSection — both mounted by
  // CompanyAssumptionsTabsView.tsx::renderBody case "compensation".
  // EditableValue wraps each numeric input with the underlying form-field
  // marker; the table-driven PartnerComp grid emits per-year cells.
  "company-assumptions/compensation": [
    "client/src/components/company-assumptions/CompensationSection.tsx",
    "client/src/components/company-assumptions/PartnerCompSection.tsx",
  ],

  // Overhead-tab fields (officeLeaseStart, professionalServicesStart,
  // techInfraStart, businessInsuranceStart, travelCostPerClient,
  // itLicensePerClient) are rendered across FixedOverheadSection (the four
  // fixed lines) and VariableCostsSection (the two per-property variable
  // lines) — both mounted by CompanyAssumptionsTabsView.tsx::renderBody
  // case "overhead". `marketingRate` and `miscOpsRate` also render in
  // VariableCostsSection but are NOT Overhead-tracked dimensions —
  // marketingRate lives under the Revenue Specialist; miscOpsRate is
  // intentionally untracked. See VariableCostsSection's manifest comment.
  "company-assumptions/overhead": [
    "client/src/components/company-assumptions/FixedOverheadSection.tsx",
    "client/src/components/company-assumptions/VariableCostsSection.tsx",
  ],

  // Revenue defaults are admin-only and live on the Property Underwriting
  // tab of Admin → Model Defaults (the "Ancillary Revenue Mix" section
  // and the "USALI Operating Cost Rates" section both render `field-*`
  // markers via the FieldHelpers `testId` prop, which is forwarded to
  // `data-testid` on the rendered input). See ModelDefaultsTab.tsx for
  // the import / mount.
  "defaults/revenue": [
    "client/src/components/admin/model-defaults/PropertyUnderwritingTab.tsx",
  ],

  // Management-company defaults (e.g. cost-of-equity, WACC inputs) live on
  // the Company tab of Admin → Model Defaults. Markers are rendered via
  // the FieldHelpers `testId` prop just like the other Model-Defaults
  // tabs. See ModelDefaultsTab.tsx for the import / mount.
  "defaults/management-company": [
    "client/src/components/admin/model-defaults/CompanyTab.tsx",
  ],

  // Macro & market defaults (inflation, market-rate assumptions, etc.)
  // live on the Market & Macro tab of Admin → Model Defaults. Same
  // FieldHelpers convention as the other Model-Defaults tabs. See
  // ModelDefaultsTab.tsx for the import / mount.
  "defaults/market-macro": [
    "client/src/components/admin/model-defaults/MarketMacroTab.tsx",
  ],

  // Property-level underwriting defaults (the bulk of the property
  // financial model — depreciation lives, refurbishment cycles, etc.)
  // live on the Property Underwriting tab of Admin → Model Defaults,
  // alongside the revenue-defaults sections. Same FieldHelpers
  // convention. See ModelDefaultsTab.tsx for the import / mount.
  "defaults/property": [
    "client/src/components/admin/model-defaults/PropertyUnderwritingTab.tsx",
  ],

  // PropertyEdit's "Other Assumptions" section hosts per-property
  // sliders (Sale Commission, Exit Cap Rate, Country Risk Premium,
  // etc.) — the section the `property-edit/other-assumptions`
  // mountPoint resolves to via `client/src/lib/analyst-mount-points.ts`
  // → `/property/:id/edit#other-assumptions` (task #779; #791 extended
  // it to cover exitCapRate / countryRiskPremium).
  "property-edit/other-assumptions": [
    "client/src/components/property-edit/OtherAssumptionsSection.tsx",
  ],

  // PropertyEdit's "Capital Structure" section hosts the per-property
  // financing inputs (Land Value %, LTV, interest rate, depreciation
  // overrides, etc.). The `property-edit/capital-structure` mountPoint
  // resolves to `/property/:id/edit#capital-structure`. Added in task
  // #791 alongside `landValuePercent`'s registry entry.
  "property-edit/capital-structure": [
    "client/src/components/property-edit/CapitalStructureSection.tsx",
  ],

  // PropertyFinder's Acquisition Pricing panel hosts the four
  // price-history rollup markers (`cumulativeDropPct`, `currentDom`,
  // `relistCount`, `motivationTier`). The mountPoint
  // `property-finder/pricing` resolves to `/property-finder` via
  // `client/src/lib/analyst-mount-points.ts` and the focus hook lands
  // on the matching `data-field="<id>"` on the panel inside the open
  // target detail drawer (Task #805).
  "property-finder/pricing": [
    "client/src/components/property-finder/AcquisitionPricingPanel.tsx",
  ],
};
