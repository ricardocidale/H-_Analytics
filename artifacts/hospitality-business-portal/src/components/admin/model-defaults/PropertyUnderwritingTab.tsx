import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { IconShieldCheck } from "@/components/icons";
import { useAuth } from "@/lib/auth";
import { Section } from "@/components/ui/field-section";
import EditableValue from "@/components/company-assumptions/EditableValue";
import { PctField, DollarField, NumberField, TabBanner, type Draft } from "./FieldHelpers";
import { AnalystActionButton } from "@/components/analyst/AnalystActionButton";
import { AnalystButton } from "@/components/intelligence/AnalystButton";
import { AnalystVerdictDisplay } from "@/components/analyst/AnalystVerdictDisplay";
import { AnalystRangeIndicator } from "@/components/analyst/AnalystRangeIndicator";
import { useFocusFieldFromUrl } from "@/lib/analyst-focus-field";
import type { AnalystGuidanceRecord } from "@/components/analyst/useAnalystRefresh";
import { PROPERTY_UNDERWRITING_TAB_ANALYST_FIELDS, toGuidanceKeys } from "./analyst-fields";
import {
  DEFAULT_START_ADR,
  DEFAULT_ADR_GROWTH_RATE,
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
  PLATFORM_FEE_RATES,
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

// Cache lifetime for the exit-multiples bands + vertical-suggestion queries.
// These read admin-managed reference rows that rarely change inside an admin
// session, so a 5-minute staleTime keeps both polls cheap. 1000 ms × 60 × 5.
const EXIT_MULTIPLE_QUERY_STALE_MS = 5 * 60 * 1000;

// EditableValue clamp bounds for exit-revenue-multiple. A 0× exit is
// economically meaningless, so the minimum is a small positive number rather
// than 0 — that way the unset (`null`) state stays distinct from a typed-in 0.
// The 20× ceiling matches the upper end of admin-supplied band cards.
const EXIT_MULTIPLE_MIN = 0.1;
const EXIT_MULTIPLE_MAX = 20;
const EXIT_MULTIPLE_STEP = 0.1;
// First-edit default when an admin clicks "Not set — click to enter".
// Picked as a generic-hospitality midpoint; the admin can refine immediately.
const EXIT_MULTIPLE_DEFAULT_ON_EDIT = 1.0;

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
    // Reject empty / non-numeric / out-of-range input before hitting the wire
    // — `parseFloat("") === NaN` and the try/catch below would otherwise
    // silently swallow the resulting validation failure (CodeRabbit PR-108).
    const parsed = parseFloat(platformFeeDraft);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      return;
    }
    try {
      await apiRequest("PATCH", `/api/admin/model-defaults/${strDefaultRow.id}`, {
        value: parsed / 100,
        reason: "Admin updated STR platform fee default",
      });
    } catch {
      // Preserve the prior fire-and-forget behavior: ignore HTTP errors.
    }
    refetchStrDefault();
  };

  const { data: refiMaxLtvRow, refetch: refetchRefiMaxLtv } = useQuery({
    queryKey: ["model-defaults", "funding", "refiMaxLtvToOriginal"],
    queryFn: async () => {
      const res = await fetch("/api/admin/model-defaults?category=management_company&cardKey=funding", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch refi LTV cap default");
      const json = await res.json() as { rows: Array<{ id: number; defaultKey: string; value: unknown }> };
      return json.rows.find(r => r.defaultKey === "mc.funding.refiMaxLtvToOriginal") ?? null;
    },
  });

  const [refiMaxLtvDraft, setRefiMaxLtvDraft] = useState("");
  useEffect(() => {
    if (refiMaxLtvRow?.value != null)
      setRefiMaxLtvDraft(Math.round((refiMaxLtvRow.value as number) * 100).toString());
  }, [refiMaxLtvRow]);

  const saveRefiMaxLtv = async () => {
    if (!refiMaxLtvRow) return;
    const parsed = parseFloat(refiMaxLtvDraft);
    if (!Number.isFinite(parsed) || parsed < 30 || parsed > 150) return;
    try {
      await apiRequest("PATCH", `/api/admin/model-defaults/${refiMaxLtvRow.id}`, {
        value: parsed / 100,
        reason: "Admin updated refi max LTV cap default",
      });
    } catch {
      // Preserve fire-and-forget behavior.
    }
    refetchRefiMaxLtv();
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
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="text-sm text-muted-foreground min-w-0">
            The Analyst evaluates your ancillary revenue mix (F&amp;B, Events, Other, Catering, Marketing) against boutique-luxury comp sets.
          </p>
          <div className="shrink-0">
            <AnalystButton
              onClick={onRevenueAnalystRefresh}
              isRunning={revenueAnalystRunning ?? false}
              disabled={false}
              tooltip="Have the Analyst review the revenue ancillary mix"
              size="sm"
              dataTestId="button-analyst-revenue-mix"
            />
          </div>
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
          fallback={0.55}
          onChange={(_, v) => onChange("defaultStartOccupancy", v)}
          min={0.1} max={1} step={0.01}
          testId="field-defaultStartOccupancy"
          researchRange="50%–65%"
        />
        <PctField
          label="Stabilized Occupancy"
          tooltip="Target occupancy after ramp-up period. Luxury boutique hotels typically stabilize at 75-85%."
          value={draft.defaultMaxOccupancy}
          fallback={0.85}
          onChange={(_, v) => onChange("defaultMaxOccupancy", v)}
          min={0.3} max={1} step={0.01}
          testId="field-defaultMaxOccupancy"
          researchRange="70%–85%"
        />
        <NumberField
          label="Occupancy Ramp"
          tooltip="Number of months to ramp from starting occupancy to stabilized occupancy. Typically 3-12 months for boutique properties."
          value={draft.defaultOccupancyRampMonths}
          fallback={6}
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
          guardrailKey="wacc.cost_of_debt"
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
          guardrailKey="wacc.cost_of_debt"
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
        <div className="space-y-2" data-testid="field-refiMaxLtvToOriginal">
          <Label className="label-text text-foreground flex items-center gap-1.5">
            Max Loan vs. Purchase Price
            <InfoTooltip text="Caps the refinance loan as a percentage of the original purchase price. 70% means the refi loan cannot exceed 70% of the purchase price, regardless of how much the property has appreciated. Applies to new properties; each property stores its own value once saved." />
          </Label>
          <div className="flex gap-2 items-center">
            <Input
              type="number"
              step="1"
              min="30"
              max="150"
              value={refiMaxLtvDraft}
              onChange={(e) => setRefiMaxLtvDraft(e.target.value)}
              className="bg-card border-primary/30 text-foreground w-24"
              data-testid="input-refiMaxLtvToOriginal"
            />
            <span className="text-sm text-muted-foreground">% of purchase price</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (refiMaxLtvRow?.value != null)
                  setRefiMaxLtvDraft(Math.round((refiMaxLtvRow.value as number) * 100).toString());
              }}
            >
              Cancel
            </Button>
            <Button size="sm" variant="outline" onClick={saveRefiMaxLtv}>
              Save
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Recommended: 65%–75%. Lower values reduce equity extraction at refinancing and
            produce more realistic IRR projections.
          </p>
        </div>
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
            <div className="flex items-center justify-between gap-2">
              <Label className="text-foreground label-text min-w-0">
                Macro Inflation Rate (read-only)
              </Label>
              <span
                className="font-mono text-sm text-foreground shrink-0"
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

      <ExitRevenueMultipleSection draft={draft} onChange={onChange} />

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
            <InfoTooltip text={`Blended OTA commission rate (Airbnb ${PLATFORM_FEE_RATES.airbnb * 100}% / VRBO ${PLATFORM_FEE_RATES.vrbo * 100}% / Booking ${PLATFORM_FEE_RATES.booking * 100}%). Users can override per property on the property edit page.`} />
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
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (strDefaultRow?.value != null)
                  setPlatformFeeDraft((+(strDefaultRow.value as number) * 100).toFixed(1));
              }}
            >
              Cancel
            </Button>
            <Button size="sm" variant="outline" onClick={savePlatformFee}>Save</Button>
          </div>
        </div>
      </Section>
    </div>
  );
}

interface ExitMultipleBand {
  dimensionKey: string;
  label: string;
  unit: string;
  valueLow: number | null;
  valueMid: number | null;
  valueHigh: number | null;
}

interface IndustryVerticalSuggestion {
  dimensionKey: string;
  label: string;
  rationale: string;
}

/**
 * Industry-vertical band check for the property exit revenue multiple.
 * Ported from the former front-of-app `PropertyExitDefaultsCard` so the
 * full set of property defaults lives in one Admin tab. Writes to the same
 * `globalAssumptions.industryVertical` / `exitRevenueMultiple` fields the
 * watchdog reads — behavior-neutral move.
 */
function ExitRevenueMultipleSection({
  draft,
  onChange,
}: {
  draft: Draft;
  onChange: (field: string, value: unknown) => void;
}) {
  // Both queries rely on the queryClient's default queryFn (in
  // artifacts/hospitality-business-portal/src/lib/queryClient.ts), which joins
  // `queryKey` into a URL and runs the fetch with `credentials: "include"` +
  // CSRF handling. Inline `fetch("/api/...")` calls were flagged by CodeRabbit
  // for bypassing the shared frontend request contract.
  const { data: exitMultiples = [] } = useQuery<ExitMultipleBand[]>({
    queryKey: ["/api/exit-multiples"],
    staleTime: EXIT_MULTIPLE_QUERY_STALE_MS,
  });

  const selectedVertical = (draft.industryVertical as string | null | undefined) ?? "";

  const { data: suggestionResp } = useQuery<{ suggestion: IndustryVerticalSuggestion | null }>({
    queryKey: ["/api/exit-multiples/suggestion"],
    enabled: !selectedVertical,
    staleTime: EXIT_MULTIPLE_QUERY_STALE_MS,
  });
  const suggestion = !selectedVertical ? suggestionResp?.suggestion ?? null : null;
  const suggestionStillValid = !!(
    suggestion && exitMultiples.some((m) => m.dimensionKey === suggestion.dimensionKey)
  );

  const selectedMultipleRaw = draft.exitRevenueMultiple;
  const selectedMultiple = typeof selectedMultipleRaw === "number" ? selectedMultipleRaw : null;
  const band = exitMultiples.find((m) => m.dimensionKey === selectedVertical) ?? null;
  const hasBand = !!(band && band.valueLow != null && band.valueHigh != null);

  // TODO(specialist-plumbing): no Exit-Multiple Specialist currently emits a
  // verdict for this field — bands come directly from the admin-managed
  // `exit_multiples` table via /api/exit-multiples. Per the Intelligence
  // Display contract (CLAUDE.md §"Intelligence Display"), range badges must be
  // sourced from a specialist. Until a specialist exists, we adapt the table
  // band into the canonical `GuidanceRecord` shape so the badge renders via
  // `AnalystRangeIndicator` instead of bespoke local JSX. Followup: surface a
  // real Specialist (e.g. "exitMultipleSpecialist") that consumes the same
  // table + property locality and emits guidance with conviction + sourceName.
  const exitMultipleGuidance = hasBand && band && band.valueLow != null && band.valueHigh != null
    ? [{
        assumptionKey: "exitRevenueMultiple",
        valueLow: band.valueLow,
        valueMid: band.valueMid,
        valueHigh: band.valueHigh,
        confidence: "moderate" as const,
        reasoning: `Admin-managed band for vertical "${band.label}".`,
        sourceName: "exit_multiples (admin-managed)",
        dataQuality: null,
      }]
    : undefined;

  return (
    <Section
      title="Exit Revenue Multiple"
      description="Cross-check property terminal value against admin-managed bands per industry vertical. The watchdog flags multiples outside the band and recommends the midpoint."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="industryVertical" className="text-xs text-muted-foreground">
            Industry Vertical
          </Label>
          <Select
            value={selectedVertical || "__none__"}
            onValueChange={(v) => onChange("industryVertical", v === "__none__" ? null : v)}
          >
            <SelectTrigger id="industryVertical" data-testid="select-industry-vertical">
              <SelectValue placeholder="Select a vertical…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— None —</SelectItem>
              {exitMultiples.map((m) => (
                <SelectItem
                  key={m.dimensionKey}
                  value={m.dimensionKey}
                  data-testid={`option-vertical-${m.dimensionKey}`}
                >
                  {m.label}
                  {m.valueLow != null && m.valueHigh != null
                    ? ` (${m.valueLow.toFixed(1)}x – ${m.valueHigh.toFixed(1)}x)`
                    : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {suggestion && suggestionStillValid && (
            <div
              className="rounded-md border border-sky-300/70 bg-sky-50 dark:bg-sky-950/40 dark:border-sky-700/50 p-2 text-xs text-sky-900 dark:text-sky-200"
              data-testid="suggestion-industry-vertical"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-medium">Analyst suggestion:</span>{" "}
                  <span data-testid="text-suggested-vertical-label">{suggestion.label}</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 underline underline-offset-2 h-auto p-0 text-xs"
                  onClick={() => onChange("industryVertical", suggestion.dimensionKey)}
                  data-testid="button-apply-vertical-suggestion"
                >
                  Use suggestion
                </Button>
              </div>
              <p className="mt-1 text-[11px] leading-snug opacity-90" data-testid="text-suggested-vertical-rationale">
                {suggestion.rationale}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="exitRevenueMultiple" className="text-xs text-muted-foreground">
            Exit Revenue Multiple (×)
          </Label>
          {selectedMultiple == null ? (
            <button
              type="button"
              // First-edit seed value: prefer the selected vertical's band
              // midpoint so the first persisted value is data-driven; fall
              // back to EXIT_MULTIPLE_DEFAULT_ON_EDIT only when no band is
              // available (no vertical selected yet, or the band has no mid).
              onClick={() =>
                onChange(
                  "exitRevenueMultiple",
                  band?.valueMid ?? EXIT_MULTIPLE_DEFAULT_ON_EDIT,
                )
              }
              className="text-sm text-muted-foreground italic underline-offset-2 hover:underline"
              data-testid="button-set-exit-multiple"
            >
              Not set — click to enter
            </button>
          ) : (
            <EditableValue
              value={selectedMultiple}
              // Distinct unset state: enforce a positive minimum so a typed-in 0
              // cannot be persisted. Use the band midpoint (if available) as the
              // clear-to-unset escape via the dedicated button above instead.
              onChange={(v) => onChange("exitRevenueMultiple", v)}
              format="number"
              min={EXIT_MULTIPLE_MIN}
              max={EXIT_MULTIPLE_MAX}
              step={EXIT_MULTIPLE_STEP}
            />
          )}
          {hasBand && band && (
            <div className="flex items-center gap-2">
              {/* Range signal — sourced from admin-managed `exit_multiples`
                  wrapped in the canonical AnalystRangeIndicator. Severity,
                  copy, and within/above/below verdict all come from the
                  component, not from local JSX. See TODO(specialist-plumbing)
                  above re: replacing the wrapper with a real Specialist. */}
              <AnalystRangeIndicator
                fieldKey="exitRevenueMultiple"
                currentValue={selectedMultiple}
                guidance={exitMultipleGuidance}
                guardrailKey="exitRevenueMultiple"
              />
              <p className="text-xs text-muted-foreground" data-testid="text-exit-multiple-band">
                {band.label} band: {band.valueLow!.toFixed(1)}x – {band.valueHigh!.toFixed(1)}x
                {band.valueMid != null ? ` (mid ${band.valueMid.toFixed(1)}x)` : ""}
              </p>
            </div>
          )}
          {/* "Apply midpoint" remains as a data-driven action — `valueMid`
              is sourced from the admin-managed `exit_multiples` row, not
              authored locally — so it's not the bespoke severity copy CR
              flagged. The amber outside-band severity rendering has been
              removed; AnalystRangeIndicator above now owns that signal. */}
          {hasBand && band && band.valueMid != null && selectedMultiple != null && (
            selectedMultiple < (band.valueLow ?? Number.NEGATIVE_INFINITY) ||
            selectedMultiple > (band.valueHigh ?? Number.POSITIVE_INFINITY)
          ) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start underline underline-offset-2 h-auto p-0 text-xs"
              onClick={() => onChange("exitRevenueMultiple", band.valueMid!)}
              data-testid="button-apply-exit-multiple-mid"
            >
              Apply recommended midpoint {band.valueMid.toFixed(1)}x
            </Button>
          )}
        </div>
      </div>
    </Section>
  );
}
