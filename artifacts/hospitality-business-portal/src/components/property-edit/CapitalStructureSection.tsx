/**
 * CapitalStructureSection.tsx — Purchase price, financing, and depreciation.
 *
 * This is the most financially dense section on the property editor.
 * It captures everything needed to model the capital stack:
 *
 *   Purchase & Renovation:
 *     • Purchase price, renovation budget, total project cost
 *     • Land value (not depreciable under GAAP)
 *     • FF&E (Furniture, Fixtures & Equipment) budget
 *
 *   Debt Structure:
 *     • LTV (Loan-to-Value ratio) — % of purchase financed by debt
 *     • Interest rate, loan term, amortization period
 *     • Derived values: loan amount, equity required, annual debt service
 *     • DSCR (Debt Service Coverage Ratio) = NOI / Annual Debt Service
 *
 *   Depreciation:
 *     • Building useful life (39 years for nonresidential hotel per IRC §168(e)(2)(A))
 *     • FF&E useful life (typically 5-7 years)
 *     • Cost basis = purchase price − land value (straight-line depreciation)
 *
 * Research Badges appear next to key inputs when AI-generated
 * market benchmarks are available; clicking them auto-fills the input.
 */
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { EditableValue } from "@/components/ui/editable-value";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ResearchContextFieldLabel } from "@/components/research/ResearchContextFieldLabel";
import { GaapBadge } from "@/components/ui/gaap-badge";
import { IconShieldCheck } from "@/components/icons";
import { GOVERNED_FIELDS, DEFAULT_COST_SEG_5YR_PCT, DEFAULT_COST_SEG_7YR_PCT, DEFAULT_COST_SEG_15YR_PCT } from "@shared/constants";
import { MarketRateBenchmark } from "@/components/property-research/MarketRateBenchmark";
import { formatMoneyInput, parseMoneyInput } from "@/lib/formatters";
import { 
  DEFAULT_LTV, 
  DEFAULT_INTEREST_RATE, 
  DEFAULT_TERM_YEARS,
  DEFAULT_REFI_LTV,
  DEFAULT_ACQ_CLOSING_COST_RATE,
  DEFAULT_REFI_CLOSING_COST_RATE,
  DEFAULT_LAND_VALUE_PERCENT
} from "@/lib/financial/loanCalculations";
import { DEFAULT_REFI_PERIOD_YEARS } from "@/lib/constants";
import type { PropertyEditSectionProps } from "./types";

export default function CapitalStructureSection({ draft, onChange, onNumberChange, globalAssumptions, researchValues }: PropertyEditSectionProps) {
  const eid = draft.id as number | undefined;
  const gc = (key: string, label?: string) => eid ? { entityType: "property" as const, entityId: eid, assumptionKey: key, fieldLabel: label } : undefined;

  // Live resolved Model Constant for depreciationYears at this property's
  // locality — same admin endpoint the canonical Model Constants tab and
  // the admin Property Underwriting tab use, so the read-only echo here
  // can never drift from the value the engine consumes.
  // ARCHITECTURE.md §"Model Constants — placement convention" — every
  // surface that displays a Model Constant is read-only and links back
  // to the Model Constants tab. This is the property-edit echo.
  // The endpoint is admin-gated; for non-admin viewers the fetch 4xx's
  // and we fall back to the static GOVERNED_FIELDS metadata so the band
  // still renders meaningfully.
  const propertyCountry = ((draft as { country?: string | null }).country) || "United States";
  const propertyState = ((draft as { stateProvince?: string | null }).stateProvince) || null;
  const { data: depYearsResolved } = useQuery<{ value: unknown } | null>({
    queryKey: ["model-constants-depreciation-years", propertyCountry, propertyState],
    queryFn: async () => {
      const params = new URLSearchParams({ country: propertyCountry });
      if (propertyState) params.set("subdivision", propertyState);
      const res = await fetch(`/api/admin/model-constants?${params.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { items?: Array<{ key: string; effectiveValue: unknown }> };
      const row = json.items?.find((r) => r.key === "depreciationYears");
      return row ? { value: row.effectiveValue } : null;
    },
    staleTime: 60_000,
    retry: false,
  });
  const depYearsLive =
    typeof depYearsResolved?.value === "number" ? depYearsResolved.value : null;

  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="relative p-6 space-y-5">
        <div>
          <h3 className="text-xl font-display text-foreground">Capital Structure</h3>
          <p className="text-muted-foreground text-sm label-text">Purchase and investment details</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          <div className="space-y-1.5">
            <Label className="label-text text-foreground flex items-center gap-1.5">Purchase Price<InfoTooltip text="Total acquisition cost of the property in dollars. This is the basis for equity investment, loan sizing, and depreciation calculations." /><GaapBadge rule="ASC 805: Acquisition cost is the fair value of the total consideration transferred. Includes the purchase price of the asset. The depreciable basis excludes the land allocation." /></Label>
            <Input 
              value={formatMoneyInput(draft.purchasePrice)} 
              onChange={(e) => onNumberChange("purchasePrice", parseMoneyInput(e.target.value).toString())}
              className="bg-card border-primary/30 text-foreground"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="label-text text-foreground flex items-center gap-1.5">Building Improvements<InfoTooltip text="Capital improvements and renovation costs (in dollars) added to the building basis. These are depreciated over 39 years along with the building portion of the purchase price." /><GaapBadge rule="ASC 360 / IRS Pub 946: Capital improvements are added to the depreciable basis and depreciated over 39 years (straight-line). They are not expensed immediately." /></Label>
            <Input 
              value={formatMoneyInput(draft.buildingImprovements)} 
              onChange={(e) => onNumberChange("buildingImprovements", parseMoneyInput(e.target.value).toString())}
              className="bg-card border-primary/30 text-foreground"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="label-text text-foreground flex items-center gap-1.5">Pre-Opening Costs<InfoTooltip text="One-time costs (in dollars) incurred before the property opens: hiring, training, marketing launch, supplies, licensing, and initial inventory." /></Label>
            <Input 
              value={formatMoneyInput(draft.preOpeningCosts)} 
              onChange={(e) => onNumberChange("preOpeningCosts", parseMoneyInput(e.target.value).toString())}
              className="bg-card border-primary/30 text-foreground"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="label-text text-foreground flex items-center gap-1.5">Operating Reserve<InfoTooltip text="Cash reserve (in dollars) set aside at acquisition to cover working capital needs during the ramp-up period before the property reaches stabilized operations." /></Label>
            <Input 
              value={formatMoneyInput(draft.operatingReserve)} 
              onChange={(e) => onNumberChange("operatingReserve", parseMoneyInput(e.target.value).toString())}
              className="bg-card border-primary/30 text-foreground"
            />
          </div>
          {/* `data-field="landValuePercent"` is the destination marker for
              the Analyst's Adjust deep link (registry entry mountPoint
              `property-edit/capital-structure`). The wrapper's only
              writeable descendant is the Slider — the focus hook
              (`useFocusFieldFromUrl()` in
              `client/src/lib/analyst-focus-field.ts`) descends from this
              wrapper to that slider's `[role="slider"]` thumb so an
              Adjust verdict on `landValuePercent` lands focus on the
              control rather than only scrolling the section into view.
              Companion to the registry entry in
              `engine/analyst/registry/field-registry.ts` and the
              destination-marker proof at
              `tests/proof/analyst-deep-link-destination-marker.test.ts`. */}
          <div className="space-y-1.5" data-field="landValuePercent">
            <ResearchContextFieldLabel
              label={<>Land Value (%) <InfoTooltip text="Percentage of the purchase price allocated to land. Land does not depreciate under IRS rules (Publication 946). Only the building portion is depreciated over 39 years. Typical land allocation ranges from 15-40% depending on location and property type." /> <GaapBadge rule="IRS Publication 946: Land is NOT depreciable. Only the building portion (Purchase Price × (1 − Land %) + Improvements) is depreciated over 39 years using straight-line method. Higher land % = lower depreciation deduction." /></>}
              badgeProps={{ entry: researchValues.landValue }}
              onApplyValue={() => researchValues.landValue && onChange("landValuePercent", researchValues.landValue.mid / 100)}
              guidanceContext={gc("landValue", "Land Value")}
              currentValue={draft.landValuePercent ?? DEFAULT_LAND_VALUE_PERCENT} isPercent
            />
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-foreground" data-testid="text-land-value-percent">
                  {((draft.landValuePercent ?? DEFAULT_LAND_VALUE_PERCENT) * 100).toFixed(0)}%
                </span>
                <span className="text-xs text-muted-foreground">
                  Depreciable basis: ${((draft.purchasePrice * (1 - (draft.landValuePercent ?? DEFAULT_LAND_VALUE_PERCENT))) + draft.buildingImprovements).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
              <Slider
                data-testid="slider-land-value-percent"
                value={[(draft.landValuePercent ?? DEFAULT_LAND_VALUE_PERCENT) * 100]}
                onValueChange={(vals: number[]) => onNumberChange("landValuePercent", (vals[0] / 100).toString())}
                min={5}
                max={60}
                step={1}
              />
            </div>
          </div>
        </div>

        {/*
          Authority-Governed band — Model Constants placement convention
          (docs/architecture/ARCHITECTURE.md §"Model Constants — placement
          convention"). Same shield-iconed `section-model-constants-*`
          shell used by the admin Property Underwriting tab so the property
          edit page never invents its own treatment. The read-only echo
          above the override input makes the cascade visible: per-property
          override → company default → authority constant.
        */}
        <section
          className="rounded-lg border border-accent-pop/20 bg-accent-pop/10 dark:bg-accent-pop/20 dark:border-accent-pop/30 overflow-hidden"
          data-testid="section-model-constants-property-edit-depreciation"
        >
          <header className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 border-b border-accent-pop/20 bg-accent-pop/5">
            <IconShieldCheck className="w-4 h-4 text-accent-pop dark:text-accent-pop shrink-0" />
            <h4 className="text-sm font-semibold text-accent-pop dark:text-accent-pop">
              Model Constants — Authority-Governed
            </h4>
            <span
              className="text-xs text-accent-pop/80 dark:text-accent-pop/70"
              data-testid="text-source-model-constants"
            >
              Read-only · Sourced from Model Constants
            </span>
          </header>
          <div className="p-4 space-y-4">
            <div className="space-y-2" data-testid="field-depreciationYears-readonly">
              <Label
                htmlFor="depreciation-years-display"
                className="label-text text-foreground flex flex-wrap items-center gap-x-2 gap-y-1"
              >
                <span>{GOVERNED_FIELDS.depreciationYears.fieldName}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {GOVERNED_FIELDS.depreciationYears.authority}
                </span>
              </Label>
              <Input
                id="depreciation-years-display"
                type="text"
                readOnly
                value={
                  depYearsLive !== null
                    ? `${depYearsLive} years`
                    : GOVERNED_FIELDS.depreciationYears.value
                }
                className="font-mono bg-muted/40 cursor-not-allowed max-w-xs"
                data-testid="text-depreciationYears-readonly"
                aria-readonly="true"
              />
              <p className="text-xs text-muted-foreground leading-relaxed">
                {GOVERNED_FIELDS.depreciationYears.helperText}
                {GOVERNED_FIELDS.depreciationYears.referenceUrl && (
                  <>
                    {" "}
                    <a
                      href={GOVERNED_FIELDS.depreciationYears.referenceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-foreground"
                      data-testid="link-depreciationYears-reference"
                    >
                      Reference
                    </a>
                  </>
                )}
              </p>
            </div>

            {/*
              Per-property override — clearly labeled as the override (not
              the constant). Cascade documented inline so the editor knows
              what wins: per-property override → company default →
              authority constant.
            */}
            <div className="space-y-1.5 border-t border-accent-pop/20 pt-3">
              <Label
                htmlFor="depreciation-years-override"
                className="label-text text-foreground flex items-center gap-1.5"
              >
                Per-Property Override
                <InfoTooltip text="Overrides the authority constant above for THIS property only. Cascade: per-property override → company default → authority constant. Leave blank to inherit." />
              </Label>
              <Input
                id="depreciation-years-override"
                type="number"
                step={0.5}
                min={1}
                placeholder="Inherit (uses constant above)"
                value={draft.depreciationYears ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  onChange("depreciationYears", val === "" ? null : parseFloat(val));
                }}
                className="w-56 input-field"
                data-testid="input-depreciation-years-override"
              />
              <p className="text-xs text-muted-foreground">
                Cascade: per-property override → company default → authority constant. Leave blank to use the constant above.
              </p>
            </div>
          </div>
        </section>

        <div className="border-t border-white/10 pt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="label-text text-foreground flex items-center gap-1.5">
                Cost Segregation Study
                <InfoTooltip text="Apply accelerated depreciation using cost segregation analysis. Instead of straight-line 39-year depreciation, portions of the property value are allocated to 5-year, 7-year, and 15-year schedules (personal property, land improvements, etc.), accelerating tax deductions in the early years." />
                <GaapBadge rule="IRS Rev. Proc. 87-56: Cost segregation reclassifies building components into shorter MACRS recovery periods (5, 7, 15 years). The remaining building basis depreciates over 39 years. Accelerates depreciation deductions but does not change total lifetime depreciation." />
              </Label>
              <p className="text-xs text-muted-foreground">Accelerated 5/7/15-year schedules instead of straight-line</p>
            </div>
            <Switch
              checked={draft.costSegEnabled ?? false}
              onCheckedChange={(checked) => onChange("costSegEnabled", checked)}
              data-testid="switch-cost-seg-enabled"
            />
          </div>
          {draft.costSegEnabled && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pl-1">
              <div className="space-y-1.5">
                <Label className="label-text text-foreground text-xs flex items-center gap-1">
                  5-Year Property (%)
                  <InfoTooltip text="Percentage of depreciable basis allocated to 5-year MACRS property (furniture, fixtures, equipment, carpeting, appliances). Typical range: 10-20%." />
                </Label>
                <div className="flex items-center gap-2">
                  <Slider
                    data-testid="slider-cost-seg-5yr"
                    value={[(draft.costSeg5yrPct ?? DEFAULT_COST_SEG_5YR_PCT) * 100]}
                    onValueChange={(vals: number[]) => onNumberChange("costSeg5yrPct", (vals[0] / 100).toString())}
                    min={0}
                    max={40}
                    step={1}
                    className="flex-1"
                  />
                  <span className="text-xs font-mono text-foreground w-10 text-right">{((draft.costSeg5yrPct ?? DEFAULT_COST_SEG_5YR_PCT) * 100).toFixed(0)}%</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="label-text text-foreground text-xs flex items-center gap-1">
                  7-Year Property (%)
                  <InfoTooltip text="Percentage of depreciable basis allocated to 7-year MACRS property (office furniture, specialized fixtures). Typical range: 5-15%." />
                </Label>
                <div className="flex items-center gap-2">
                  <Slider
                    data-testid="slider-cost-seg-7yr"
                    value={[(draft.costSeg7yrPct ?? DEFAULT_COST_SEG_7YR_PCT) * 100]}
                    onValueChange={(vals: number[]) => onNumberChange("costSeg7yrPct", (vals[0] / 100).toString())}
                    min={0}
                    max={30}
                    step={1}
                    className="flex-1"
                  />
                  <span className="text-xs font-mono text-foreground w-10 text-right">{((draft.costSeg7yrPct ?? DEFAULT_COST_SEG_7YR_PCT) * 100).toFixed(0)}%</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="label-text text-foreground text-xs flex items-center gap-1">
                  15-Year Property (%)
                  <InfoTooltip text="Percentage of depreciable basis allocated to 15-year MACRS property (land improvements, site work, parking lots, landscaping). Typical range: 3-10%." />
                </Label>
                <div className="flex items-center gap-2">
                  <Slider
                    data-testid="slider-cost-seg-15yr"
                    value={[(draft.costSeg15yrPct ?? DEFAULT_COST_SEG_15YR_PCT) * 100]}
                    onValueChange={(vals: number[]) => onNumberChange("costSeg15yrPct", (vals[0] / 100).toString())}
                    min={0}
                    max={20}
                    step={1}
                    className="flex-1"
                  />
                  <span className="text-xs font-mono text-foreground w-10 text-right">{((draft.costSeg15yrPct ?? DEFAULT_COST_SEG_15YR_PCT) * 100).toFixed(0)}%</span>
                </div>
              </div>
              <div className="sm:col-span-3">
                <p className="text-xs text-muted-foreground">
                  Remaining {(100 - ((draft.costSeg5yrPct ?? DEFAULT_COST_SEG_5YR_PCT) + (draft.costSeg7yrPct ?? DEFAULT_COST_SEG_7YR_PCT) + (draft.costSeg15yrPct ?? DEFAULT_COST_SEG_15YR_PCT)) * 100).toFixed(0)}% depreciates over {draft.depreciationYears ?? 39} years (building)
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3 pt-2">
          <Label className="label-text text-foreground flex items-center gap-1.5">Type of Funding<InfoTooltip text="How the acquisition is financed. Full Equity means 100% cash investment. Financed means a portion is covered by a mortgage loan." /></Label>
          <RadioGroup 
            value={draft.type} 
            onValueChange={(v) => onChange("type", v)}
            className="flex gap-8"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="Full Equity" id="funding-equity" className="border-white/40 text-white" />
              <Label htmlFor="funding-equity" className="font-normal cursor-pointer text-foreground">Full Equity</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="Financed" id="funding-financed" className="border-white/40 text-white" />
              <Label htmlFor="funding-financed" className="font-normal cursor-pointer text-foreground">Financed</Label>
            </div>
          </RadioGroup>
        </div>

        {draft.type === "Financed" && (
          <div className="border-t border-white/10 pt-6">
            <h4 className="font-display mb-4 text-foreground">Acquisition Financing</h4>
            <div className="mb-4">
              <MarketRateBenchmark
                compact
                applicableRates={["sofr", "treasury10y", "primeRate"]}
                onApplyRate={(key, value) => {
                  if (key === "sofr") {
                    onChange("acquisitionInterestRate", (value + 2.75) / 100);
                  } else if (key === "primeRate") {
                    onChange("acquisitionInterestRate", value / 100);
                  } else if (key === "treasury10y") {
                    onChange("acquisitionInterestRate", (value + 2.0) / 100);
                  }
                }}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <ResearchContextFieldLabel
                    label={<>LTV <InfoTooltip text="Loan-to-Value ratio: the percentage of the purchase price financed by the lender. Higher LTV means less equity required but more debt service." /> <GaapBadge rule="ASC 470: Debt must be separated into interest expense (Income Statement) and principal repayment (Balance Sheet/Financing Activity). Only interest reduces taxable income." /></>}
                    badgeProps={{ entry: researchValues.acqLtv, sourceType: researchValues.acqLtv?.source === "market" ? "market" : "seed", sourceName: (researchValues.acqLtv as { sourceName?: string })?.sourceName }}
                    onApplyValue={() => researchValues.acqLtv && onChange("acquisitionLTV", researchValues.acqLtv.mid / 100)}
                    guidanceContext={gc("acqLtv", "Acquisition LTV")}
                    currentValue={draft.acquisitionLTV || DEFAULT_LTV} isPercent
                  />
                  <EditableValue
                    value={(draft.acquisitionLTV || DEFAULT_LTV) * 100}
                    onChange={(val) => onChange("acquisitionLTV", val / 100)}
                    format="percent"
                    min={0}
                    max={95}
                    step={5}
                  />
                </div>
                <Slider
                  value={[(draft.acquisitionLTV || DEFAULT_LTV) * 100]}
                  onValueChange={(vals: number[]) => onChange("acquisitionLTV", vals[0] / 100)}
                  min={0}
                  max={95}
                  step={5}
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <ResearchContextFieldLabel
                    label={<>Interest Rate <InfoTooltip text="Annual interest rate on the acquisition loan. Determines monthly debt service payments." /></>}
                    badgeProps={{ entry: researchValues.acqRate, sourceType: researchValues.acqRate?.source === "market" ? "market" : "seed", sourceName: (researchValues.acqRate as { sourceName?: string })?.sourceName }}
                    onApplyValue={() => researchValues.acqRate && onChange("acquisitionInterestRate", researchValues.acqRate.mid / 100)}
                    guidanceContext={gc("acqRate", "Acquisition Interest Rate")}
                    currentValue={draft.acquisitionInterestRate || DEFAULT_INTEREST_RATE} isPercent
                  />
                  <EditableValue
                    value={(draft.acquisitionInterestRate || DEFAULT_INTEREST_RATE) * 100}
                    onChange={(val) => onChange("acquisitionInterestRate", val / 100)}
                    format="percent"
                    min={0}
                    max={20}
                    step={0.25}
                  />
                </div>
                <Slider
                  value={[(draft.acquisitionInterestRate || DEFAULT_INTEREST_RATE) * 100]}
                  onValueChange={(vals: number[]) => onChange("acquisitionInterestRate", vals[0] / 100)}
                  min={0}
                  max={20}
                  step={0.25}
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label className="label-text text-foreground flex items-center gap-1.5">Loan Term<InfoTooltip text="Amortization period for the loan in years. Longer terms reduce monthly payments but increase total interest paid." /></Label>
                  <span className="text-sm font-mono text-foreground">{draft.acquisitionTermYears || DEFAULT_TERM_YEARS} yrs</span>
                </div>
                <Slider
                  value={[draft.acquisitionTermYears || DEFAULT_TERM_YEARS]}
                  onValueChange={(vals: number[]) => onChange("acquisitionTermYears", vals[0])}
                  min={5}
                  max={30}
                  step={5}
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label className="label-text text-foreground flex items-center gap-1.5">Closing Costs<InfoTooltip text="Transaction costs as a percentage of the loan amount: lender fees, appraisal, title insurance, legal fees." /><GaapBadge rule="GAAP: Loan origination costs are capitalized and amortized over the loan term (ASC 310-20). Not expensed immediately. Shown as a reduction of the loan liability on the balance sheet." /></Label>
                  <EditableValue
                    value={(draft.acquisitionClosingCostRate || DEFAULT_ACQ_CLOSING_COST_RATE) * 100}
                    onChange={(val) => onChange("acquisitionClosingCostRate", val / 100)}
                    format="percent"
                    min={0}
                    max={10}
                    step={0.5}
                  />
                </div>
                <Slider
                  value={[(draft.acquisitionClosingCostRate || DEFAULT_ACQ_CLOSING_COST_RATE) * 100]}
                  onValueChange={(vals: number[]) => onChange("acquisitionClosingCostRate", vals[0] / 100)}
                  min={0}
                  max={10}
                  step={0.5}
                />
              </div>
            </div>
          </div>
        )}

        {draft.type === "Full Equity" && (
          <div className="border-t border-white/10 pt-6">
            <div className="space-y-4">
              <div className="space-y-3">
                <Label className="label-text text-foreground flex items-center gap-1.5">Will this property be refinanced?<InfoTooltip text="Whether this property will refinance after the initial equity investment. Refinancing allows extracting equity by placing debt on an appreciated asset." /></Label>
                <RadioGroup 
                  value={draft.willRefinance || "No"} 
                  onValueChange={(v) => onChange("willRefinance", v)}
                  className="flex gap-6"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="Yes" id="refinance-yes" className="border-white/40 text-white" />
                    <Label htmlFor="refinance-yes" className="font-normal cursor-pointer text-foreground">Yes</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="No" id="refinance-no" className="border-white/40 text-white" />
                    <Label htmlFor="refinance-no" className="font-normal cursor-pointer text-foreground">No</Label>
                  </div>
                </RadioGroup>
              </div>

              {draft.willRefinance === "Yes" && (
                <div className="border-t border-white/10 pt-4">
                  <h4 className="font-display mb-4 text-foreground">Refinance Terms</h4>
                  <div className="mb-4">
                    <MarketRateBenchmark
                      compact
                      applicableRates={["sofr", "treasury10y"]}
                      onApplyRate={(key, value) => {
                        if (key === "sofr") {
                          onChange("refinanceInterestRate", (value + 2.75) / 100);
                        } else if (key === "treasury10y") {
                          onChange("refinanceInterestRate", (value + 2.0) / 100);
                        }
                      }}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="label-text text-foreground flex items-center gap-1.5">Refinance Date<InfoTooltip text="When the refinancing occurs. Typically 2-3 years after operations start, once the property has established a track record and appraised value." /></Label>
                      <Input 
                        type="date" 
                        value={draft.refinanceDate || (() => {
                          const refiPeriod = globalAssumptions?.debtAssumptions?.refiPeriodYears ?? DEFAULT_REFI_PERIOD_YEARS;
                          const opsDate = new Date(draft.operationsStartDate);
                          opsDate.setFullYear(opsDate.getFullYear() + refiPeriod);
                          return opsDate.toISOString().split('T')[0];
                        })()} 
                        onChange={(e) => onChange("refinanceDate", e.target.value)}
                        className="bg-card border-primary/30 text-foreground"
                      />
                      <p className="text-xs text-muted-foreground">Suggested: {globalAssumptions?.debtAssumptions?.refiPeriodYears ?? DEFAULT_REFI_PERIOD_YEARS} years after operations start</p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label className="label-text text-foreground flex items-center gap-1.5">Years After Acquisition<InfoTooltip text="Number of years after acquisition before refinancing occurs." /></Label>
                        <span className="text-sm font-mono text-foreground" data-testid="text-refinance-years-after-acquisition">{draft.refinanceYearsAfterAcquisition ?? DEFAULT_REFI_PERIOD_YEARS} yrs</span>
                      </div>
                      <Slider
                        data-testid="slider-refinance-years-after-acquisition"
                        value={[draft.refinanceYearsAfterAcquisition ?? DEFAULT_REFI_PERIOD_YEARS]}
                        onValueChange={(vals: number[]) => onChange("refinanceYearsAfterAcquisition", vals[0])}
                        min={1}
                        max={10}
                        step={1}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <ResearchContextFieldLabel
                          label={<>LTV <InfoTooltip text="Loan-to-Value ratio for the refinance loan, based on the property's appraised value at the time of refinancing." /></>}
                          badgeProps={{ entry: researchValues.refiLtv, sourceType: "seed" }}
                          onApplyValue={() => researchValues.refiLtv && onChange("refinanceLTV", researchValues.refiLtv.mid / 100)}
                          guidanceContext={gc("refiLtv", "Refinance LTV")}
                          currentValue={draft.refinanceLTV || DEFAULT_REFI_LTV}
                          isPercent
                        />
                        <EditableValue
                          value={(draft.refinanceLTV || DEFAULT_REFI_LTV) * 100}
                          onChange={(val) => onChange("refinanceLTV", val / 100)}
                          format="percent"
                          min={0}
                          max={95}
                          step={5}
                        />
                      </div>
                      <Slider
                        value={[(draft.refinanceLTV || DEFAULT_REFI_LTV) * 100]}
                        onValueChange={(vals: number[]) => onChange("refinanceLTV", vals[0] / 100)}
                        min={0}
                        max={95}
                        step={5}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label className="label-text text-foreground flex items-center gap-1.5">Interest Rate<InfoTooltip text="Annual interest rate on the refinance loan." /></Label>
                        <EditableValue
                          value={(draft.refinanceInterestRate || DEFAULT_INTEREST_RATE) * 100}
                          onChange={(val) => onChange("refinanceInterestRate", val / 100)}
                          format="percent"
                          min={0}
                          max={20}
                          step={0.25}
                        />
                      </div>
                      <Slider
                        value={[(draft.refinanceInterestRate || DEFAULT_INTEREST_RATE) * 100]}
                        onValueChange={(vals: number[]) => onChange("refinanceInterestRate", vals[0] / 100)}
                        min={0}
                        max={20}
                        step={0.25}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label className="label-text text-foreground flex items-center gap-1.5">Loan Term<InfoTooltip text="Amortization period for the refinance loan in years." /></Label>
                        <span className="text-sm font-mono text-foreground">{draft.refinanceTermYears || DEFAULT_TERM_YEARS} yrs</span>
                      </div>
                      <Slider
                        value={[draft.refinanceTermYears || DEFAULT_TERM_YEARS]}
                        onValueChange={(vals: number[]) => onChange("refinanceTermYears", vals[0])}
                        min={5}
                        max={30}
                        step={5}
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label className="label-text text-foreground flex items-center gap-1.5">Closing Costs<InfoTooltip text="Transaction costs for the refinance as a percentage of the new loan amount." /></Label>
                        <EditableValue
                          value={(draft.refinanceClosingCostRate || DEFAULT_REFI_CLOSING_COST_RATE) * 100}
                          onChange={(val) => onChange("refinanceClosingCostRate", val / 100)}
                          format="percent"
                          min={0}
                          max={10}
                          step={0.5}
                        />
                      </div>
                      <Slider
                        value={[(draft.refinanceClosingCostRate || DEFAULT_REFI_CLOSING_COST_RATE) * 100]}
                        onValueChange={(vals: number[]) => onChange("refinanceClosingCostRate", vals[0] / 100)}
                        min={0}
                        max={10}
                        step={0.5}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
