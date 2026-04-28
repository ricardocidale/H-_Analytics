/**
 * Analyst field registry — single source of truth for the human label, unit,
 * and UI mount point of every field the Analyst tracks.
 *
 * Background:
 * The Voice Renderer's `humanField` formerly derived a display label from
 * the raw field id by string-pattern heuristics (camelCase split, snake_case
 * → spaces, drop trailing "Pct"/"Percent"). That heuristic is fine for
 * fields whose id already reads cleanly, but it cannot:
 *   - know that `defaultCostRateMarketing` should read as "Marketing Cost Rate"
 *     (the id encodes table-column semantics, not a human label)
 *   - know what UI surface a field is mounted on (so deep-link CTAs in the
 *     Analyst's verdicts can target the right page)
 *   - be authored by product copy without a code-edit-and-deploy cycle that
 *     touches the renderer itself.
 *
 * The registry is consulted FIRST by `humanField`. Fields not yet in the
 * registry fall back to the heuristic, so adding the registry is non-breaking
 * for fields the heuristic already handles correctly.
 *
 * Adding a field:
 *   1. Add an entry to FIELD_REGISTRY keyed by the exact field id the
 *      Specialist emits in `VerdictDimension.field`.
 *   2. Provide the human `label`, the display `unit` the Voice Renderer
 *      will format the dimension's value/range in ("%", "$", "mo", or ""
 *      for raw — same set the renderer's `formatNumber` already understands),
 *      and a `mountPoint` string identifying the UI surface (e.g.
 *      "property-edit/<section>", "company-assumptions/<tab>", or
 *      "defaults/<section>"). See `client/src/lib/analyst-mount-points.ts`
 *      for the slug → URL resolver and the full list of supported prefixes.
 *   3. The Voice Renderer will pick up the label automatically; Specialists
 *      read the unit from this registry too (see `getFieldRegistryEntry`),
 *      so adding the entry is the only place the unit needs to live.
 *
 * Note on `unit`: this is the dimension's emit-unit (the unit of the analytic
 * range the Specialist surfaces and the Voice Renderer formats), not always
 * the form-field's natural unit. For example `capitalRaise1Amount` is a
 * dollar field on the form, but the verdict dimension keyed to it is
 * `runwayBufferMonths` — a derived signal measured in months — so the
 * registry's `unit: "mo"` matches the dimension that gets emitted, which is
 * the unit the renderer prints on screen.
 *
 * Mount points are deliberately kept as opaque strings rather than an enum so
 * downstream UI code can read them as routing slugs without coupling the
 * registry to a specific router.
 */

export type FieldUnit = "%" | "$" | "mo" | "date" | "";

export interface FieldRegistryEntry {
  /** User-facing label authored by product copy. Title-cased, no unit suffix. */
  readonly label: string;
  /**
   * Display unit the Voice Renderer's `formatNumber` will use for the
   * dimension keyed to this field. Equal to the `VerdictRange.unit` the
   * Specialist emits — Specialists derive this value from the registry
   * (rather than carrying their own copy) so the two cannot drift.
   */
  readonly unit: FieldUnit;
  /** UI surface where this field is edited. Opaque slug, not a router path. */
  readonly mountPoint: string;
  /**
   * Optional human-readable name of the specific card / sub-region within
   * the `mountPoint` surface that hosts this field — e.g. "Capital Raises"
   * or "Convertible Terms" inside the Funding tab on Company Assumptions.
   *
   * Why this exists (task #788): the section-aware exhaust-budget toast
   * added in task #784 names the field's tab/page from the `mountPoint`
   * slug, but long pages stack several cards under one tab and the toast
   * cannot point at the specific card without an extra hint. When
   * provided, `analyst-focus-field.ts` weaves this name into the toast
   * copy ("try expanding the Convertible Terms card under Funding") so
   * the admin lands on the right card the first time. Optional — entries
   * without it fall back to the existing tab-level copy, so the registry
   * can be filled in incrementally without breaking unregistered fields.
   *
   * Authoring: use the visible heading the user sees on the surface
   * (the `<h3>` inside the card / the `Section title="…"` value), not
   * an internal component name — the toast quotes this string verbatim.
   */
  readonly subSection?: string;
}

export const FIELD_REGISTRY: Readonly<Record<string, FieldRegistryEntry>> = {
  // ─── mgmt-co.funding (Capital Raise Specialist) ─────────────────────────
  // Note: the `unit` on funding entries reflects the *dimension's* unit
  // (runway in months, sizing overshoot in percent, tranche gap in months),
  // not the form-field's natural unit. The form input "Capital Raise 1
  // Amount" is denominated in dollars on screen, but the Analyst dimension
  // it powers is `runwayBufferMonths`, which the Voice Renderer prints in
  // months. See the file header for the full rationale.
  // Funding-tab fields are management-company-level (not property-level), so
  // their `data-field` markers live in `client/src/components/company-assumptions/
  // FundingSection.tsx`, which is rendered on `/company/assumptions?tab=funding`.
  // Pointing the mount-point at `property-edit/*` here would land the user on
  // the wrong surface and the focus hook would silently no-op (task #760).
  // Sub-sections below name the visible cards inside the Funding tab
  // (see `client/src/components/company-assumptions/FundingSection.tsx`):
  // the first three fields live in the "Capital Raises" card (the card
  // whose `<h3>` reads "Funding" — its source-comment / component name
  // is "Capital Raises", which is the disambiguating handle the toast
  // surfaces); the latter two live in the "Capital Stack Discipline"
  // card. Both cards are stacked in the same tab, so the tab-level
  // toast copy cannot tell the user which one to expand without the
  // sub-section hint.
  capitalRaise1Amount: {
    label: "Capital Raise 1 Amount",
    unit: "mo",
    mountPoint: "company-assumptions/funding",
    subSection: "Capital Raises",
  },
  capitalRaise2Amount: {
    label: "Capital Raise 2 Amount",
    unit: "%",
    mountPoint: "company-assumptions/funding",
    subSection: "Capital Raises",
  },
  capitalRaise2Date: {
    label: "Capital Raise 2 Date",
    unit: "mo",
    mountPoint: "company-assumptions/funding",
    subSection: "Capital Raises",
  },
  revenueRampDelayMonths: {
    label: "Revenue Ramp Delay",
    unit: "mo",
    mountPoint: "company-assumptions/funding",
    subSection: "Capital Stack Discipline",
  },
  burnFlexDownPct: {
    label: "Burn Flex Down",
    unit: "%",
    mountPoint: "company-assumptions/funding",
    subSection: "Capital Stack Discipline",
  },

  // ─── mgmt-co.revenue (Revenue Specialist) ───────────────────────────────
  defaultCostRateMarketing: {
    label: "Marketing Cost Rate",
    unit: "%",
    mountPoint: "defaults/revenue",
  },
  defaultRevShareFb: {
    label: "F&B Revenue Share",
    unit: "%",
    mountPoint: "defaults/revenue",
  },
  defaultRevShareEvents: {
    label: "Events Revenue Share",
    unit: "%",
    mountPoint: "defaults/revenue",
  },
  defaultRevShareOther: {
    label: "Other Revenue Share",
    unit: "%",
    mountPoint: "defaults/revenue",
  },
  defaultCateringBoostPct: {
    label: "Catering Boost",
    unit: "%",
    mountPoint: "defaults/revenue",
  },

  // ─── Admin Model Defaults → Company tab ─────────────────────────────────
  // CompanyTab fields (`client/src/components/admin/model-defaults/CompanyTab.tsx`)
  // — management-company-level financial defaults the admin endorses on the
  // "Defaults → Management Company" admin section. The mountPoint slug names
  // the admin section so the resolver can land the user on the right tab
  // (see `client/src/lib/analyst-mount-points.ts`).
  baseManagementFee: {
    label: "Base Management Fee",
    unit: "%",
    mountPoint: "defaults/management-company",
  },
  incentiveManagementFee: {
    label: "Incentive Management Fee",
    unit: "%",
    mountPoint: "defaults/management-company",
  },
  companyTaxRate: {
    label: "Company Income Tax Rate",
    unit: "%",
    mountPoint: "defaults/management-company",
  },
  // costOfEquity is edited on BOTH CompanyTab and MarketMacroTab (same
  // draft.costOfEquity key). The registry can hold one mountPoint per
  // field id; we anchor on the management-company surface because the
  // value is a company-level WACC input and the CompanyTab Cost-of-Equity
  // editor carries the more descriptive tooltip. The MarketMacroTab copy
  // still bears the same `data-testid="field-costOfEquity"` marker, so a
  // verdict targeting that field finds the marker under client/src/
  // either way (which is what the audit test verifies).
  costOfEquity: {
    label: "Cost of Equity",
    unit: "%",
    mountPoint: "defaults/management-company",
  },

  // ─── Admin Model Defaults → Market & Macro tab ──────────────────────────
  // MarketMacroTab fields (`client/src/components/admin/model-defaults/MarketMacroTab.tsx`)
  // — global macro assumptions edited on the "Defaults → Market & Macro"
  // admin section.
  inflationRate: {
    label: "Macro Inflation Rate",
    unit: "%",
    mountPoint: "defaults/market-macro",
  },

  // ─── Admin Model Defaults → Property Underwriting tab ───────────────────
  // PropertyUnderwritingTab fields
  // (`client/src/components/admin/model-defaults/PropertyUnderwritingTab.tsx`)
  // — template values applied when creating a new property. Edited on the
  // "Defaults → Property" admin section.
  // Sub-sections below mirror the visible `<Section title="…">` headings
  // inside `client/src/components/admin/model-defaults/PropertyUnderwritingTab.tsx`.
  // The Property Defaults page stacks several of these `<Section>` cards
  // (Revenue Assumptions, USALI Operating Cost Rates, Exit & Disposition,
  // …) so the tab-level toast cannot tell the user which one to scroll to
  // without the sub-section hint.
  defaultStartAdr: {
    label: "Starting ADR",
    unit: "$",
    mountPoint: "defaults/property",
    subSection: "Revenue Assumptions",
  },
  defaultAdrGrowthRate: {
    label: "ADR Annual Growth",
    unit: "%",
    mountPoint: "defaults/property",
    subSection: "Revenue Assumptions",
  },
  defaultStartOccupancy: {
    label: "Starting Occupancy",
    unit: "%",
    mountPoint: "defaults/property",
    subSection: "Revenue Assumptions",
  },
  defaultMaxOccupancy: {
    label: "Stabilized Occupancy",
    unit: "%",
    mountPoint: "defaults/property",
    subSection: "Revenue Assumptions",
  },
  defaultOccupancyRampMonths: {
    label: "Occupancy Ramp",
    unit: "mo",
    mountPoint: "defaults/property",
    subSection: "Revenue Assumptions",
  },
  defaultCostRateRooms: {
    label: "Housekeeping Cost Rate",
    unit: "%",
    mountPoint: "defaults/property",
  },
  defaultCostRateFb: {
    label: "F&B Cost Rate",
    unit: "%",
    mountPoint: "defaults/property",
  },
  defaultCostRateAdmin: {
    label: "Admin & General Cost Rate",
    unit: "%",
    mountPoint: "defaults/property",
  },
  defaultCostRatePropertyOps: {
    label: "Property Ops Cost Rate",
    unit: "%",
    mountPoint: "defaults/property",
  },
  defaultCostRateUtilities: {
    label: "Utilities Cost Rate",
    unit: "%",
    mountPoint: "defaults/property",
  },
  defaultCostRateIt: {
    label: "IT Cost Rate",
    unit: "%",
    mountPoint: "defaults/property",
  },
  defaultCostRateFfe: {
    label: "FF&E Reserve",
    unit: "%",
    mountPoint: "defaults/property",
  },
  defaultCostRateInsurance: {
    label: "Insurance Cost Rate",
    unit: "%",
    mountPoint: "defaults/property",
  },
  defaultCostRateTaxes: {
    label: "Property Taxes Cost Rate",
    unit: "%",
    mountPoint: "defaults/property",
  },
  defaultLandValuePercent: {
    label: "Land Value Percent",
    unit: "%",
    mountPoint: "defaults/property",
  },
  // salesCommissionRate is classified under COMPANY_TAB_ANALYST_FIELDS in
  // `client/src/components/admin/model-defaults/analyst-fields.ts` (its
  // guidance vocabulary key is `dispositionCommission`), but the actual
  // form input lives on PropertyUnderwritingTab's "Exit & Disposition"
  // section. The mountPoint follows the input, not the classification, so
  // the focus hook lands on the editable field.
  salesCommissionRate: {
    label: "Sales Commission",
    unit: "%",
    mountPoint: "defaults/property",
    subSection: "Exit & Disposition",
  },
};

/**
 * Returns the registered display name for `field`, or `null` when the field
 * is not yet in the registry. Callers (notably the Voice Renderer's
 * `humanField`) fall back to the legacy heuristic on `null`.
 */
export function getFieldDisplayName(field: string): string | null {
  return FIELD_REGISTRY[field]?.label ?? null;
}

/**
 * Returns the full registry entry (label + unit + mountPoint) for `field`,
 * or `null` when the field is not yet registered.
 */
export function getFieldRegistryEntry(
  field: string,
): FieldRegistryEntry | null {
  return FIELD_REGISTRY[field] ?? null;
}
