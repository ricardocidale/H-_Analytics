import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { IconShieldCheck } from "@/components/icons";
import { useAuth } from "@/lib/auth";
import { Section, PctField, DollarField, NumberField, TabBanner, type Draft } from "./FieldHelpers";
import { AnalystActionButton } from "@/components/analyst/AnalystActionButton";
import { AnalystButton } from "@/components/intelligence/AnalystButton";
import { AnalystVerdictDisplay } from "@/components/analyst/AnalystVerdictDisplay";
import { useFocusFieldFromUrl } from "@/lib/analyst-focus-field";
import type { AnalystGuidanceRecord } from "@/components/analyst/useAnalystRefresh";
import { PROPERTY_UNDERWRITING_TAB_ANALYST_FIELDS, toGuidanceKeys } from "./analyst-fields";
import {
  DEFAULT_START_ADR,
  DEFAULT_ADR_GROWTH_RATE,
  DEFAULT_START_OCCUPANCY,
  DEFAULT_MAX_OCCUPANCY,
  DEFAULT_OCCUPANCY_RAMP_MONTHS,
  DEFAULT_ROOM_COUNT,
  DEFAULT_REV_SHARE_FB,
  DEFAULT_REV_SHARE_EVENTS,
  DEFAULT_REV_SHARE_OTHER,
  DEFAULT_CATERING_BOOST_PCT,
  DEFAULT_COST_RATE_ROOMS,
  DEFAULT_COST_RATE_FB,
  DEFAULT_COST_RATE_ADMIN,
  DEFAULT_COST_RATE_MARKETING,
  DEFAULT_COST_RATE_PROPERTY_OPS,
  DEFAULT_COST_RATE_UTILITIES,
  DEFAULT_COST_RATE_IT,
  DEFAULT_COST_RATE_FFE,
  DEFAULT_COST_RATE_OTHER,
  DEFAULT_COST_RATE_INSURANCE,
  DEFAULT_PROPERTY_INCOME_TAX_RATE,
  DEFAULT_LAND_VALUE_PERCENT,
} from "@shared/constants";
import { getFactoryNumber } from "@shared/model-constants-registry";

// Task #404 reconciliation — PERMANENT US-baseline fallback.
//
// This tab edits the company-wide template defaults applied when a new
// property is *created* (`defaultCostRateTaxes`). At that point no country
// or state has been chosen yet — the locality is established later when the
// admin fills in the property's address. The displayed placeholder
// therefore cannot be made locality-aware here; it is intentionally pinned
// to the US registry baseline (1.2%) as the platform-wide template.
//
// Per-property locality awareness happens in two places downstream:
//   1. `OperatingCostRatesSection` (Property Edit) re-resolves the fallback
//      against the property's own country + state via getFactoryNumber.
//   2. `engine/helpers/default-resolver.ts` resolves the runtime number
//      from the registry using the property's locality.
//
// If the admin wants a non-US default for new properties, they override
// `defaultCostRateTaxes` in this tab — the override is country-agnostic and
// applies to every newly created property regardless of locality.
const DEFAULT_COST_RATE_TAXES = getFactoryNumber("costRateTaxes", "United States");

interface PropertyUnderwritingTabProps {
  draft: Draft;
  onChange: (field: string, value: any) => void;
  guidance?: AnalystGuidanceRecord[];
  onAnalystRefresh?: (fields?: string[]) => void;
  analystRunning?: boolean;
  analystCooldownMs?: number;
  // G2-v1: Revenue Specialist verdict path
  onRevenueAnalystRefresh?: () => void;
  revenueAnalystRunning?: boolean;
  revenueAnalystCooldownMs?: number;
  revenueVerdict?: import("@engine/analyst/contracts/verdict").AnalystVerdict | null;
}

export function PropertyUnderwritingTab(props: PropertyUnderwritingTabProps) {
  const {
    draft,
    onChange,
    onAnalystRefresh,
    analystRunning,
    analystCooldownMs,
    onRevenueAnalystRefresh,
    revenueAnalystRunning,
    revenueAnalystCooldownMs: _revenueAnalystCooldownMs,
    revenueVerdict,
  } = props;
  const { isSuperAdmin } = useAuth();

  // Honour `?focus=<fieldId>` deep links produced by the Analyst verdict
  // mount-point resolver (task #751). Revenue Specialist dimensions whose
  // registry mountPoint is `defaults/revenue` land here; this hook scrolls
  // + focuses the matching `data-testid="field-<id>"` input on mount.
  //
  // Cross-section deep links (task #773): this tab is gated by the Admin
  // shell's `activeSection` (must equal `defaults-property` for it to
  // render at all). The resolver imperatively calls
  // `setAdminSection("defaults-property")` for in-app SPA clicks, AND the
  // Admin shell mirrors `window.location.hash` (`#defaults-property/...`)
  // back into `activeSection` so a fresh page load / refresh / new tab on
  // the deep link still mounts this tab. The URL-reactive focus hook then
  // fires here once the tab actually mounts. See `client/src/pages/Admin.tsx`
  // for the hash → section sync.
  useFocusFieldFromUrl();

  const { data: strDefaultRow, refetch: refetchStrDefault } = useQuery({
    queryKey: ["model-defaults", "property_defaults", "platformFeeRate"],
    queryFn: async () => {
      const res = await fetch("/api/admin/model-defaults?category=management_company&cardKey=property_defaults", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch STR defaults");
      const json = await res.json() as { rows: Array<{ id: number; defaultKey: string; value: unknown }> };
      return json.rows.find(r => r.defaultKey === "mc.property_defaults.platformFeeRate") ?? null;
    },
  });

  const [platformFeeDraft, setPlatformFeeDraft] = useState("");
  useEffect(() => {
    if (strDefaultRow?.value != null)
      setPlatformFeeDraft((+(strDefaultRow.value as number) * 100).toFixed(1));
  }, [strDefaultRow]);

  const savePlatformFee = async () => {
    if (!strDefaultRow) return;
    await fetch(`/api/admin/model-defaults/${strDefaultRow.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ value: parseFloat(platformFeeDraft) / 100, reason: "Admin updated STR platform fee default" }),
    });
    refetchStrDefault();
  };

  const acq = draft.standardAcqPackage ?? {};
  const debt = draft.debtAssumptions ?? {};
  const analystEnabled = typeof onAnalystRefresh === "function";

  // depreciationYears is sourced from the canonical Model Constants layer
  // (Admin → Model Defaults → Model Constants), not from globalAssumptions.
  // We fetch the resolved effective value via the same admin endpoint the
  // Constants tab uses, so this read-only display can never drift from the
  // Constants tab. See docs/audits/task-379-defaults-vs-source-of-truth.md
  // and ARCHITECTURE.md §"Model Constants — placement convention".
  // Only fetched for super_admins — the regulatory band is gated below.
  const { data: depYearsResolved } = useQuery<{ value: unknown } | null>({
    queryKey: ["admin-model-constants-depreciation-years", "United States"],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/model-constants?country=${encodeURIComponent("United States")}`,
        { credentials: "include" },
      );
      if (!res.ok) return null;
      // Endpoint shape: { country, subdivision, items: [{ key, effectiveValue, ... }] }
      // (server/routes/admin/model-constants.ts GET handler).
      const json = (await res.json()) as { items?: Array<{ key: string; effectiveValue: unknown }> };
      const row = json.items?.find((r) => r.key === "depreciationYears");
      return row ? { value: row.effectiveValue } : null;
    },
    staleTime: 30_000,
  });
  const depYearsDisplay =
    typeof depYearsResolved?.value === "number" ? depYearsResolved.value : null;

  const onAcq = (field: string, value: number) => {
    onChange("standardAcqPackage", { ...acq, [field]: value });
  };
  const onDebt = (field: string, value: number) => {
    onChange("debtAssumptions", { ...debt, [field]: value });
  };

  return (
    <div className="space-y-5">
      {/*
        Authority-governed Model Constants live at the top of this tab in
        a dedicated, full-width band — separate from the editable
        Defaults grid below. Gated to super_admin only because these
        values come from external authorities (IRS Pub 946, GAAP, USALI),
        not from internal calibration. Regular `admin` users see only the
        editable Defaults — they can still discover and edit these
        constants via the dedicated Model Constants tab. The pattern
        documented here (shield-iconed band → Input + helper text →
        link back to Constants tab) is how the next authority-governed
        constant (e.g. ASC 842 lease term) drops in alongside.
        See ARCHITECTURE.md §"Model Constants — placement convention".
      */}
      {isSuperAdmin && (
        <section
          className="rounded-lg border border-accent-pop/20 bg-accent-pop/10 dark:bg-accent-pop/20 dark:border-accent-pop/30 overflow-hidden"
          data-testid="section-model-constants-property-underwriting"
        >
          <header className="flex items-center gap-2 px-4 py-3 border-b border-accent-pop/20 bg-accent-pop/5">
            <IconShieldCheck className="w-4 h-4 text-accent-pop shrink-0" />
            <h3 className="text-sm font-semibold text-accent-pop">
              Model Constants — Authority-Governed
            </h3>
            <span className="text-xs text-accent-pop/80 ml-1">
              Read-only · Super Admin
            </span>
          </header>
          <div className="p-4 space-y-4">
            <div className="space-y-2" data-testid="field-depreciationYears-readonly">
              <label
                htmlFor="depreciationYears-display"
                className="text-sm font-medium text-foreground"
              >
                Depreciation Years
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  IRS Publication 946
                </span>
              </label>
              <Input
                id="depreciationYears-display"
                type="text"
                readOnly
                value={depYearsDisplay !== null ? `${depYearsDisplay} years` : "—"}
                className="font-mono bg-muted/40 cursor-not-allowed max-w-xs"
                data-testid="text-depreciationYears-readonly"
              />
              <p className="text-xs text-muted-foreground leading-relaxed">
                39 years: nonresidential real property (hotels per IRC §168(e)(2)(A)).
                27.5 years applies only to residential rental property. Sourced from
                Admin → Model Defaults → <strong>Model Constants</strong> (United States
                baseline). Edit there to change the value the financial engine consumes —
                per-property overrides on each property's edit page still win the cascade.{" "}
                <a
                  href="https://www.irs.gov/publications/p946"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  Reference
                </a>
              </p>
            </div>
          </div>
        </section>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <TabBanner>
          Template values applied when creating new properties. Existing properties retain their current values. NULL fields fall back to system constants.
        </TabBanner>
        {analystEnabled && (
          <div className="shrink-0">
            <AnalystActionButton
              variant="header"
              running={analystRunning}
              cooldownRemainingMs={analystCooldownMs}
              onClick={() =>
                onAnalystRefresh?.(toGuidanceKeys(PROPERTY_UNDERWRITING_TAB_ANALYST_FIELDS))
              }
              testIdSuffix="property-underwriting"
            />
          </div>
        )}
      </div>

      {/* Revenue Analyst CTA — fires the G2-v1 Revenue Specialist */}
      {onRevenueAnalystRefresh && (
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm text-muted-foreground">
            The Analyst evaluates your ancillary revenue mix (F&amp;B, Events, Other, Catering, Marketing) against boutique-luxury comp sets.
          </p>
          <AnalystButton
            onClick={onRevenueAnalystRefresh}
            isRunning={revenueAnalystRunning ?? false}
            disabled={false}
            tooltip="Have the Analyst review the revenue ancillary mix"
            size="sm"
            dataTestId="button-ask-analyst-revenue-mix"
          />
        </div>
      )}

      <Section grid title="Revenue Assumptions" description="Default revenue parameters pre-filled when adding a new hotel to the portfolio.">
        <DollarField
          label="Starting ADR"
          tooltip="Average Daily Rate at property opening. This is the base rate before any growth adjustments."
          value={draft.defaultStartAdr}
          fallback={DEFAULT_START_ADR}
          onChange={(_, v) => onChange("defaultStartAdr", v)}
          min={50} max={1500} step={25}
          testId="field-defaultStartAdr"
          researchRange="$150–$500"
        />
        <PctField
          label="ADR Annual Growth"
          tooltip="Annual rate at which ADR increases year-over-year, typically tracking inflation plus market premiums."
          value={draft.defaultAdrGrowthRate}
          fallback={DEFAULT_ADR_GROWTH_RATE}
          onChange={(_, v) => onChange("defaultAdrGrowthRate", v)}
          min={0} max={0.15} step={0.005}
          testId="field-defaultAdrGrowthRate"
          researchRange="2%–5%"
        />
        <PctField
          label="Starting Occupancy"
          tooltip="Occupancy rate at property opening, before ramp-up to stabilization. Typically 50-60% for new boutique hotels."
          value={draft.defaultStartOccupancy}
          fallback={DEFAULT_START_OCCUPANCY}
          onChange={(_, v) => onChange("defaultStartOccupancy", v)}
          min={0.1} max={1} step={0.01}
          testId="field-defaultStartOccupancy"
          researchRange="50%–65%"
        />
        <PctField
          label="Stabilized Occupancy"
          tooltip="Target occupancy after ramp-up period. Luxury boutique hotels typically stabilize at 75-85%."
          value={draft.defaultMaxOccupancy}
          fallback={DEFAULT_MAX_OCCUPANCY}
          onChange={(_, v) => onChange("defaultMaxOccupancy", v)}
          min={0.3} max={1} step={0.01}
          testId="field-defaultMaxOccupancy"
          researchRange="70%–85%"
        />
        <NumberField
          label="Occupancy Ramp"
          tooltip="Number of months to ramp from starting occupancy to stabilized occupancy. Typically 3-12 months for boutique properties."
          value={draft.defaultOccupancyRampMonths}
          fallback={DEFAULT_OCCUPANCY_RAMP_MONTHS}
          onChange={(_, v) => onChange("defaultOccupancyRampMonths", Math.round(v))}
          min={0} max={24} step={1}
          testId="field-defaultOccupancyRampMonths"
          researchRange="3–12 mo"
        />
        <NumberField
          label="Room Count"
          tooltip="Number of keys (rooms) for a new property. Boutique hotels are typically 10-100 rooms."
          value={draft.defaultRoomCount}
          fallback={DEFAULT_ROOM_COUNT}
          onChange={(_, v) => onChange("defaultRoomCount", Math.round(v))}
          min={1} max={500} step={1}
          testId="field-defaultRoomCount"
          researchRange="10–100 keys"
        />
        <PctField
          label="F&B Revenue Share"
          tooltip="Food & Beverage revenue as a percentage of total room revenue. Varies by hotel concept and restaurant program."
          value={draft.defaultRevShareFb}
          fallback={DEFAULT_REV_SHARE_FB}
          onChange={(_, v) => onChange("defaultRevShareFb", v)}
          min={0} max={0.5} step={0.01}
          testId="field-defaultRevShareFb"
          researchRange="15%–30%"
        />
        <PctField
          label="Events Revenue Share"
          tooltip="Events/banquet revenue as a percentage of total room revenue. Higher for properties with dedicated event spaces."
          value={draft.defaultRevShareEvents}
          fallback={DEFAULT_REV_SHARE_EVENTS}
          onChange={(_, v) => onChange("defaultRevShareEvents", v)}
          min={0} max={0.5} step={0.01}
          testId="field-defaultRevShareEvents"
          researchRange="5%–15%"
        />
        <PctField
          label="Other Revenue Share"
          tooltip="Miscellaneous revenue (spa, parking, retail) as a percentage of total revenue."
          value={draft.defaultRevShareOther}
          fallback={DEFAULT_REV_SHARE_OTHER}
          onChange={(_, v) => onChange("defaultRevShareOther", v)}
          min={0} max={0.3} step={0.005}
          testId="field-defaultRevShareOther"
          researchRange="3%–10%"
        />
        <PctField
          label="Catering Boost"
          tooltip="Additional catering revenue uplift applied to events revenue. Represents incremental F&B from event catering."
          value={draft.defaultCateringBoostPct}
          fallback={DEFAULT_CATERING_BOOST_PCT}
          onChange={(_, v) => onChange("defaultCateringBoostPct", v)}
          min={0} max={0.5} step={0.01}
          testId="field-defaultCateringBoostPct"
          researchRange="5%–20%"
        />
      </Section>

      {/* Revenue Specialist verdict — renders after the user runs the Analyst */}
      {revenueVerdict && (
        <div data-testid="revenue-verdict-section">
          <AnalystVerdictDisplay verdict={revenueVerdict} />
        </div>
      )}

      <Section grid title="USALI Operating Cost Rates" description="Uniform System of Accounts for the Lodging Industry — expense rates as a percentage of total revenue.">
        <PctField
          label="Housekeeping"
          tooltip="Housekeeping, front desk, guest supplies, linens. USALI Dept 1."
          value={draft.defaultCostRateRooms}
          fallback={DEFAULT_COST_RATE_ROOMS}
          onChange={(_, v) => onChange("defaultCostRateRooms", v)}
          min={0} max={0.4} step={0.005}
          testId="field-defaultCostRateRooms"
          researchRange="18%–25%"
        />
        <PctField
          label="F&B"
          tooltip="F&B cost of goods sold plus labor. USALI Dept 2."
          value={draft.defaultCostRateFb}
          fallback={DEFAULT_COST_RATE_FB}
          onChange={(_, v) => onChange("defaultCostRateFb", v)}
          min={0} max={0.4} step={0.005}
          testId="field-defaultCostRateFb"
          researchRange="5%–12%"
        />
        <PctField
          label="Admin & General"
          tooltip="General & Administrative expenses — accounting, HR, legal, office supplies. USALI undistributed."
          value={draft.defaultCostRateAdmin}
          fallback={DEFAULT_COST_RATE_ADMIN}
          onChange={(_, v) => onChange("defaultCostRateAdmin", v)}
          min={0} max={0.2} step={0.005}
          testId="field-defaultCostRateAdmin"
          researchRange="7%–10%"
        />
        <PctField
          label="Marketing"
          tooltip="Advertising, OTA commissions, sales team costs, loyalty programs."
          value={draft.defaultCostRateMarketing}
          fallback={DEFAULT_COST_RATE_MARKETING}
          onChange={(_, v) => onChange("defaultCostRateMarketing", v)}
          min={0} max={0.15} step={0.005}
          testId="field-defaultCostRateMarketing"
          researchRange="5%–8%"
        />
        <PctField
          label="Property Ops"
          tooltip="Building maintenance, grounds, engineering, repairs. USALI POM."
          value={draft.defaultCostRatePropertyOps}
          fallback={DEFAULT_COST_RATE_PROPERTY_OPS}
          onChange={(_, v) => onChange("defaultCostRatePropertyOps", v)}
          min={0} max={0.15} step={0.005}
          testId="field-defaultCostRatePropertyOps"
          researchRange="4%–7%"
        />
        <PctField
          label="Utilities"
          tooltip="Electric, water, gas, internet, telecom. Split between fixed base load and variable occupancy-driven costs."
          value={draft.defaultCostRateUtilities}
          fallback={DEFAULT_COST_RATE_UTILITIES}
          onChange={(_, v) => onChange("defaultCostRateUtilities", v)}
          min={0} max={0.15} step={0.005}
          testId="field-defaultCostRateUtilities"
          researchRange="3%–6%"
        />
        <PctField
          label="Property Taxes"
          tooltip="Real estate / property taxes as a rate of total revenue."
          value={draft.defaultCostRateTaxes}
          fallback={DEFAULT_COST_RATE_TAXES}
          onChange={(_, v) => onChange("defaultCostRateTaxes", v)}
          min={0} max={0.1} step={0.005}
          testId="field-defaultCostRateTaxes"
          researchRange="2%–4%"
        />
        <PctField
          label="IT"
          tooltip="PMS, POS, WiFi infrastructure, IT support, cybersecurity."
          value={draft.defaultCostRateIt}
          fallback={DEFAULT_COST_RATE_IT}
          onChange={(_, v) => onChange("defaultCostRateIt", v)}
          min={0} max={0.05} step={0.001}
          testId="field-defaultCostRateIt"
          researchRange="1%–3%"
        />
        <PctField
          label="FF&E Reserve"
          tooltip="Furniture, Fixtures & Equipment replacement reserve. Industry standard 4% of revenue for ongoing capital replacement."
          value={draft.defaultCostRateFfe}
          fallback={DEFAULT_COST_RATE_FFE}
          onChange={(_, v) => onChange("defaultCostRateFfe", v)}
          min={0} max={0.1} step={0.005}
          testId="field-defaultCostRateFfe"
          researchRange="3%–5%"
        />
        <PctField
          label="Insurance"
          tooltip="Property insurance — liability, property, business interruption coverage."
          value={draft.defaultCostRateInsurance}
          fallback={DEFAULT_COST_RATE_INSURANCE}
          onChange={(_, v) => onChange("defaultCostRateInsurance", v)}
          min={0} max={0.05} step={0.001}
          testId="field-defaultCostRateInsurance"
          researchRange="1%–2%"
        />
        <PctField
          label="Other"
          tooltip="Miscellaneous operating costs not captured in other categories."
          value={draft.defaultCostRateOther}
          fallback={DEFAULT_COST_RATE_OTHER}
          onChange={(_, v) => onChange("defaultCostRateOther", v)}
          min={0} max={0.15} step={0.005}
          testId="field-defaultCostRateOther"
          researchRange="1%–3%"
        />
      </Section>

      <Section grid title="Revenue Stream Expense Rates" description="Direct expense rates tied to specific ancillary revenue streams.">
        <PctField
          label="Event Expense Rate"
          tooltip="Cost ratio for event revenue (catering, staffing, setup)."
          value={draft.eventExpenseRate}
          fallback={0.5}
          onChange={onChange}
          min={0} max={1} step={0.01}
          testId="field-eventExpenseRate"
          researchRange="40%–60%"
        />
        <PctField
          label="Other Revenue Expense Rate"
          tooltip="Cost ratio for miscellaneous other revenue streams."
          value={draft.otherExpenseRate}
          fallback={0.3}
          onChange={onChange}
          min={0} max={1} step={0.01}
          testId="field-otherExpenseRate"
          researchRange="20%–40%"
        />
        <PctField
          label="Utilities Variable Split"
          tooltip="Percentage of utilities that vary with occupancy (vs. fixed base load)."
          value={draft.utilitiesVariableSplit}
          fallback={0.4}
          onChange={onChange}
          min={0} max={1} step={0.01}
          testId="field-utilitiesVariableSplit"
          researchRange="30%–50%"
        />
      </Section>

      <Section grid title="Acquisition Financing" description="Default loan terms applied when adding a new financed property.">
        <PctField
          label="LTV"
          tooltip="Loan-to-value ratio for acquisition debt."
          value={debt.acqLTV}
          fallback={0.75}
          onChange={(_, v) => onDebt("acqLTV", v)}
          min={0} max={1} step={0.01}
          testId="field-acqLTV"
          researchRange="60%–80%"
        />
        <PctField
          label="Interest Rate"
          tooltip="Annual interest rate for acquisition financing."
          value={debt.interestRate}
          fallback={0.09}
          onChange={(_, v) => onDebt("interestRate", v)}
          min={0} max={0.2} step={0.0025}
          testId="field-acqInterestRate"
          researchRange="6%–10%"
        />
        <NumberField
          label="Loan Term"
          tooltip="Loan amortization period in years."
          value={debt.amortizationYears}
          fallback={25}
          onChange={(_, v) => onDebt("amortizationYears", Math.round(v))}
          min={1} max={40} step={1}
          testId="field-acqTerm"
          researchRange="20–30 yrs"
        />
        <PctField
          label="Closing Costs"
          tooltip="Transaction costs as a percentage of purchase price."
          value={debt.acqClosingCostRate}
          fallback={0.02}
          onChange={(_, v) => onDebt("acqClosingCostRate", v)}
          min={0} max={0.1} step={0.0025}
          testId="field-acqClosingCost"
          researchRange="1%–3%"
        />
      </Section>

      <Section grid title="Refinance Terms" description="Default terms applied when modeling a property refinance event.">
        <PctField
          label="Refinance LTV"
          tooltip="Loan-to-value ratio for refinanced debt."
          value={debt.refiLTV}
          fallback={0.75}
          onChange={(_, v) => onDebt("refiLTV", v)}
          min={0} max={1} step={0.01}
          testId="field-refiLTV"
          researchRange="60%–80%"
        />
        <PctField
          label="Refinance Interest Rate"
          tooltip="Annual interest rate for refinanced loans."
          value={debt.refiInterestRate}
          fallback={0.09}
          onChange={(_, v) => onDebt("refiInterestRate", v)}
          min={0} max={0.2} step={0.0025}
          testId="field-refiInterestRate"
          researchRange="5%–9%"
        />
        <NumberField
          label="Refinance Term"
          tooltip="Amortization period for refinanced loans."
          value={debt.refiAmortizationYears}
          fallback={25}
          onChange={(_, v) => onDebt("refiAmortizationYears", Math.round(v))}
          min={1} max={40} step={1}
          testId="field-refiTerm"
          researchRange="20–30 yrs"
        />
        <PctField
          label="Refinance Closing Costs"
          tooltip="Transaction costs for refinancing as a percentage of new loan amount."
          value={debt.refiClosingCostRate}
          fallback={0.02}
          onChange={(_, v) => onDebt("refiClosingCostRate", v)}
          min={0} max={0.1} step={0.0025}
          testId="field-refiClosingCost"
          researchRange="0.5%–2%"
        />
      </Section>

      <Section grid title="Depreciation & Tax" description="Tax-related defaults for property underwriting.">
        {/*
          Depreciation Years (IRS Pub 946) used to live here as a
          GovernedFieldWrapper read-only display. It now lives in the
          dedicated "Model Constants — Authority-Governed" band at the
          top of this tab (super_admin gated). See ARCHITECTURE.md
          §"Model Constants — placement convention".
        */}
        <PctField
          label="Property Income Tax Rate"
          tooltip="Income tax rate applied to gain on property sale and operating income. This is NOT the real estate/ad valorem property tax — that is modeled as a USALI operating expense (costRateTaxes)."
          value={draft.defaultPropertyTaxRate}
          fallback={DEFAULT_PROPERTY_INCOME_TAX_RATE}
          onChange={(_, v) => onChange("defaultPropertyTaxRate", v)}
          min={0} max={0.50} step={0.01}
          testId="field-defaultPropertyTaxRate"
          researchRange="20%–30%"
        />
        <PctField
          label="Land Value (%)"
          tooltip="Portion of total property value attributed to land (non-depreciable). IRS guidelines suggest 15-30% for commercial real estate."
          value={draft.defaultLandValuePercent}
          fallback={DEFAULT_LAND_VALUE_PERCENT}
          onChange={(_, v) => onChange("defaultLandValuePercent", v)}
          min={0.05} max={0.5} step={0.01}
          testId="field-defaultLandValuePercent"
          researchRange="15%–30%"
        />
        {/*
          Inflation rate edit surface lives on the Market & Macro tab —
          per Task #379 audit (§4.2), that is the canonical Defaults home
          for this value. The duplicate editor that used to live here was
          removed; both surfaces wrote to the same draft key so the move
          is behavior-neutral. We keep a read-only reference here so
          admins who remember the old field can find where it moved.
          Task #382.
        */}
        <div className="col-span-full">
          <div
            className="rounded-md border border-border bg-muted/30 p-3 space-y-2"
            data-testid="reference-inflationRate"
          >
            <div className="flex items-center justify-between">
              <Label className="text-foreground label-text">
                Macro Inflation Rate (read-only)
              </Label>
              <span
                className="font-mono text-sm text-foreground"
                data-testid="text-inflationRate-readonly"
              >
                {typeof draft.inflationRate === "number"
                  ? `${(draft.inflationRate * 100).toFixed(2)}%`
                  : "—"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Edit on the <strong>Market &amp; Macro</strong> tab — the
              canonical Defaults home for inflation. See
              <code className="mx-1">docs/audits/task-379-defaults-vs-source-of-truth.md</code>
              (§4.2).
            </p>
          </div>
        </div>
      </Section>

      <Section grid title="Exit & Disposition" description="Defaults for property sale/exit modeling.">
        <PctField
          label="Exit Cap Rate"
          tooltip="Capitalization rate used to estimate property value at disposition."
          value={draft.exitCapRate}
          fallback={0.085}
          onChange={onChange}
          min={0.03} max={0.15} step={0.0025}
          testId="field-exitCapRate"
          researchRange="6%–10%"
        />
        <PctField
          label="Sales Commission"
          tooltip="Broker commission rate applied at property sale."
          value={draft.salesCommissionRate}
          fallback={0.05}
          onChange={onChange}
          min={0} max={0.1} step={0.005}
          testId="field-salesCommissionRate"
          researchRange="3%–6%"
        />
        <PctField
          label="Acquisition Commission"
          tooltip="Broker commission rate applied at property acquisition."
          value={draft.commissionRate}
          fallback={0.05}
          onChange={onChange}
          min={0} max={0.1} step={0.005}
          testId="field-commissionRate"
          researchRange="1%–3%"
        />
      </Section>

      <Section grid title="Default Acquisition Package" description="Standard purchase assumptions pre-filled when adding a new property to the portfolio.">
        <DollarField
          label="Purchase Price"
          tooltip="Default property purchase price."
          value={acq.purchasePrice}
          fallback={5000000}
          onChange={(_, v) => onAcq("purchasePrice", v)}
          min={100000} max={100000000} step={100000}
          testId="field-purchasePrice"
          researchRange="$2M–$20M"
        />
        <DollarField
          label="Building Improvements"
          tooltip="Default capital for building improvements and renovations."
          value={acq.buildingImprovements}
          fallback={500000}
          onChange={(_, v) => onAcq("buildingImprovements", v)}
          min={0} max={50000000} step={50000}
          testId="field-buildingImprovements"
          researchRange="$250K–$5M"
        />
        <DollarField
          label="Pre-Opening Costs"
          tooltip="Costs incurred before the property begins operations (staffing, marketing, training)."
          value={acq.preOpeningCosts}
          fallback={150000}
          onChange={(_, v) => onAcq("preOpeningCosts", v)}
          min={0} max={5000000} step={10000}
          testId="field-preOpeningCosts"
          researchRange="$100K–$500K"
        />
        <DollarField
          label="Operating Reserve"
          tooltip="Cash reserve set aside for initial operations before stabilization."
          value={acq.operatingReserve}
          fallback={100000}
          onChange={(_, v) => onAcq("operatingReserve", v)}
          min={0} max={5000000} step={10000}
          testId="field-operatingReserve"
          researchRange="$50K–$300K"
        />
        <NumberField
          label="Months to Operations"
          tooltip="Expected months from closing to start of hotel operations."
          value={acq.monthsToOps}
          fallback={6}
          onChange={(_, v) => onAcq("monthsToOps", Math.round(v))}
          min={0} max={36} step={1}
          testId="field-monthsToOps"
          researchRange="3–12 mo"
        />
      </Section>

      <Section grid title="Short-Term Rental Defaults" description="Default rates applied to new STR properties when no per-property override is set.">
        <div className="space-y-2">
          <Label className="label-text text-foreground flex items-center gap-1.5">
            Platform Fee Rate (%)
            <InfoTooltip text="Blended OTA commission rate (Airbnb 15.5% / VRBO 8% / Booking 15%). Users can override per property on the property edit page." />
          </Label>
          <div className="flex gap-2 items-center">
            <Input
              type="number" step="0.1" min="0" max="100"
              value={platformFeeDraft}
              onChange={(e) => setPlatformFeeDraft(e.target.value)}
              className="bg-card border-primary/30 text-foreground w-32"
              data-testid="input-default-platform-fee-rate"
            />
            <span className="text-sm text-muted-foreground">%</span>
            <Button size="sm" variant="outline" onClick={savePlatformFee}>Save</Button>
          </div>
        </div>
      </Section>
    </div>
  );
}
