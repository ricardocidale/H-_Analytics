/**
 * OtherAssumptionsSection.tsx — Exit strategy, cap rate, and disposition.
 *
 * Configures assumptions for modeling the eventual sale of the property:
 *
 *   • Exit year     – which projection year the property is sold (e.g. Year 7)
 *   • Exit cap rate – capitalization rate used to value the property at sale.
 *                     Valuation = NOI at exit / cap rate. A lower cap rate
 *                     implies higher value (cap rate is an inverse yield).
 *   • Sales commission rate – broker commission as % of gross sale price
 *   • Depreciation basis   – total depreciable cost (purchase − land) used
 *                            to compute gain on sale and tax implications
 *
 * The exit cap rate is arguably the most sensitive single assumption in
 * the model: a 50 bps change can swing the property IRR by several points.
 */
import { Label } from "@/components/ui/label";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Slider } from "@/components/ui/slider";
import { EditableValue } from "@/components/ui/editable-value";
import { GaapBadge } from "@/components/ui/gaap-badge";
import { ResearchContextFieldLabel } from "@/components/research/ResearchContextFieldLabel";
import { MarketRateBenchmark } from "@/components/property-research/MarketRateBenchmark";
import { useEffect, useState, useCallback } from "react";
import {
  DEFAULT_EXIT_CAP_RATE,
  DEFAULT_PROPERTY_TAX_RATE,
  DEFAULT_COMMISSION_RATE,
  DEFAULT_PROPERTY_INFLATION_RATE,
} from "@/lib/constants";
import type { OtherAssumptionsSectionProps } from "./types";

export default function OtherAssumptionsSection({ draft, onChange, researchValues, exitYear }: OtherAssumptionsSectionProps) {
  const [crpLoading, setCrpLoading] = useState(false);
  const [crpCountry, setCrpCountry] = useState<string | null>(null);
  const eid = draft.id as number | undefined;
  const gc = (key: string, label?: string) => eid ? { entityType: "property" as const, entityId: eid, assumptionKey: key, fieldLabel: label } : undefined;

  const fetchCRP = useCallback(async () => {
    const location = draft.location;
    if (!location) return;
    setCrpLoading(true);
    try {
      const res = await fetch(`/api/country-risk-premium/lookup?location=${encodeURIComponent(location)}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.found) {
          onChange("countryRiskPremium", data.crp);
          setCrpCountry(data.country);
        }
      }
    } catch { /* silent */ } finally {
      setCrpLoading(false);
    }
  }, [draft.location, onChange]);

  useEffect(() => {
    if (draft.countryRiskPremium == null && draft.location) {
      fetchCRP();
    }
  }, []);

  return (
    <div className="relative overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="relative p-6">
        <div className="mb-6">
          <h3 className="text-xl font-display text-foreground flex items-center">
            Other Assumptions
            <InfoTooltip text="Exit cap rate sets the terminal value when this property is sold. Tax rate and country risk affect after-tax IRR and WACC calculations for this specific property." />
          </h3>
          <p className="text-muted-foreground text-sm label-text">Exit valuation, tax rate, and country risk assumptions</p>
        </div>
        <div className="mb-4">
          <MarketRateBenchmark
            compact
            applicableRates={["treasury10y"]}
            onApplyRate={(key, value) => {
              if (key === "treasury10y") {
                onChange("exitCapRate", (value + 1.5) / 100);
              }
            }}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:items-end">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <ResearchContextFieldLabel
                label={<>Exit Cap Rate <InfoTooltip text={`The capitalization rate used to determine terminal (exit) value. Exit Value = Year ${exitYear} NOI ÷ Cap Rate. A lower cap rate implies higher property valuation.`} /> <GaapBadge rule="ASC 360: The exit cap rate determines terminal value for impairment testing. Gain on sale = Sale Price − (Adjusted Basis − Accumulated Depreciation). Depreciation recapture taxed at up to 25% under IRC §1250." /></>}
                badgeProps={{ entry: researchValues.capRate }}
                onApplyValue={() => researchValues.capRate && onChange("exitCapRate", researchValues.capRate.mid / 100)}
                guidanceContext={gc("capRate", "Exit Cap Rate")}
              />
              <EditableValue
                value={(draft.exitCapRate ?? DEFAULT_EXIT_CAP_RATE) * 100}
                onChange={(val) => onChange("exitCapRate", val / 100)}
                format="percent"
                min={1}
                max={10}
                step={0.1}
              />
            </div>
            <Slider 
              value={[(draft.exitCapRate ?? DEFAULT_EXIT_CAP_RATE) * 100]}
              onValueChange={(vals: number[]) => onChange("exitCapRate", vals[0] / 100)}
              min={1}
              max={10}
              step={0.1}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Exit Value = Year {exitYear} NOI ÷ {((draft.exitCapRate ?? DEFAULT_EXIT_CAP_RATE) * 100).toFixed(1)}%
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <ResearchContextFieldLabel
                label={<>Income Tax Rate <InfoTooltip text="Income tax rate for this property's SPV entity, applied to taxable income (NOI minus interest and depreciation) to calculate after-tax cash flow. Set per property to reflect the jurisdiction where the property is located." /> <GaapBadge rule="IRC §168: Taxable income = NOI − Interest − Depreciation. The 39-year straight-line depreciation on the building portion (nonresidential hotel) creates a non-cash deduction that shelters cash flow from taxes." /></>}
                badgeProps={{ entry: researchValues.incomeTax }}
                onApplyValue={() => researchValues.incomeTax && onChange("taxRate", researchValues.incomeTax.mid / 100)}
                guidanceContext={gc("incomeTax", "Income Tax Rate")}
              />
              <EditableValue
                value={(draft.taxRate ?? DEFAULT_PROPERTY_TAX_RATE) * 100}
                onChange={(val) => onChange("taxRate", val / 100)}
                format="percent"
                min={0}
                max={50}
                step={1}
              />
            </div>
            <Slider 
              value={[(draft.taxRate ?? DEFAULT_PROPERTY_TAX_RATE) * 100]}
              onValueChange={(vals: number[]) => onChange("taxRate", vals[0] / 100)}
              min={0}
              max={50}
              step={1}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Applied to taxable income (NOI − interest − depreciation)
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <ResearchContextFieldLabel
                label={<>Inflation Rate <InfoTooltip text="Annual inflation rate for this property. Escalates fixed operating costs and serves as the floor for revenue growth. If left blank, the global system default is used." /></>}
                badgeProps={{ entry: researchValues.inflationRate }}
                onApplyValue={() => researchValues.inflationRate && onChange("inflationRate", researchValues.inflationRate.mid / 100)}
                guidanceContext={gc("inflationRate", "Inflation Rate")}
              />
              <EditableValue
                value={draft.inflationRate != null ? draft.inflationRate * 100 : DEFAULT_PROPERTY_INFLATION_RATE * 100}
                onChange={(val) => onChange("inflationRate", val / 100)}
                format="percent"
                min={0}
                max={20}
                step={0.1}
              />
            </div>
            <Slider 
              value={[(draft.inflationRate ?? DEFAULT_PROPERTY_INFLATION_RATE) * 100]}
              onValueChange={(vals: number[]) => onChange("inflationRate", vals[0] / 100)}
              min={0}
              max={20}
              step={0.1}
            />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <ResearchContextFieldLabel
                label={<>Sale Commission <InfoTooltip text="Broker commission percentage applied when this property is sold." /></>}
                badgeProps={{ entry: researchValues.saleCommission }}
                onApplyValue={() => researchValues.saleCommission && onChange("dispositionCommission", researchValues.saleCommission.mid / 100)}
                guidanceContext={gc("saleCommission", "Sale Commission")}
              />
              <EditableValue
                data-testid="editable-disposition-commission"
                value={(draft.dispositionCommission ?? DEFAULT_COMMISSION_RATE) * 100}
                onChange={(val) => onChange("dispositionCommission", val / 100)}
                format="percent"
                min={0}
                max={10}
                step={0.5}
              />
            </div>
            <Slider 
              data-testid="slider-disposition-commission"
              value={[(draft.dispositionCommission ?? DEFAULT_COMMISSION_RATE) * 100]}
              onValueChange={(vals: number[]) => onChange("dispositionCommission", vals[0] / 100)}
              min={0}
              max={10}
              step={0.5}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <div className="flex justify-between items-center">
              <div className="flex flex-col gap-0.5">
                <Label className="flex items-center label-text text-foreground gap-1.5">
                  Country Risk Premium
                  <InfoTooltip text="Additional equity return premium for country-specific risk (Damodaran, Jan 2026). Added to the base cost of equity when computing WACC for DCF analysis. US = 0%, Colombia = 2.85%." />
                  <GaapBadge rule="Country risk premium adjusts the discount rate for sovereign risk, affecting DCF valuations per ASC 820 fair value measurements." />
                </Label>
                {crpCountry && (
                  <span className="text-xs text-muted-foreground">
                    Detected: {crpCountry}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={fetchCRP}
                  disabled={crpLoading || !draft.location}
                  className="text-xs px-2 py-1 rounded border border-border hover:bg-muted disabled:opacity-50"
                  data-testid="button-fetch-crp"
                >
                  {crpLoading ? 'Loading...' : 'Auto-detect'}
                </button>
                <EditableValue
                  data-testid="editable-country-risk-premium"
                  value={(draft.countryRiskPremium ?? 0) * 100}
                  onChange={(val) => onChange("countryRiskPremium", val / 100)}
                  format="percent"
                  min={0}
                  max={20}
                  step={0.1}
                />
              </div>
            </div>
            <Slider
              data-testid="slider-country-risk-premium"
              value={[(draft.countryRiskPremium ?? 0) * 100]}
              onValueChange={(vals: number[]) => onChange("countryRiskPremium", vals[0] / 100)}
              min={0}
              max={20}
              step={0.1}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Source: Damodaran (NYU Stern) · Cost of Equity = Base Re ({((draft.globalAssumptions?.costOfEquity ?? 0.18) * 100).toFixed(0)}%) + CRP ({((draft.countryRiskPremium ?? 0) * 100).toFixed(1)}%)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
