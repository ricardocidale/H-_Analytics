/**
 * CostOfEquityCard.tsx — Cost of Equity (Re) for the management company.
 *
 * Lives in the Funding tab. Cost of Equity is the equity investor's required
 * annual return — used as the Re component in WACC for property DCF and as
 * the discount rate for any Management Company DCF (per ARCHITECTURE.md
 * §1a — the HMC has no exit cap rate; FCF/DCF is the only company-level
 * terminal-value method).
 *
 * Build-up breakdown (collapsible):
 *   Re = Rf (FRED 10y Treasury) + ERP (Damodaran Lodging) + Illiq (Duff & Phelps) [+ CRP if non-US]
 */
import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ResearchContextFieldLabel } from "@/components/research/ResearchContextFieldLabel";
import { DEFAULT_COST_OF_EQUITY } from "@shared/constants";
import {
  DEFAULT_RF_RATE_PCT_DISPLAY,
  DEFAULT_ERP_HOSPITALITY_PCT_DISPLAY,
} from "@shared/constants-benchmarks";
import EditableValue from "./EditableValue";
import type { CompanyAssumptionsSectionProps } from "./types";
import { CITATIONS } from "@shared/citations";
import { useMarketRates } from "@/lib/api/market-rates";
import { ChevronDown, ChevronRight } from "@/components/icons/themed-icons";
import { cn } from "@/lib/utils";

// Static illiquidity premium band (Duff & Phelps / Kroll Cost of Capital Navigator 2024)
const ILLIQUIDITY_LOW_PP = 3;
const ILLIQUIDITY_HIGH_PP = 5;
const ILLIQUIDITY_MID_PP = 4;

/** Map a country display name to its crp_* market-rate key. */
function toCrpKey(country: string): string {
  return "crp_" + country.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/_+$/, "");
}

/** Returns true when the company is US-domiciled (CRP row omitted). */
function isUsDomiciled(country: string | null | undefined): boolean {
  if (!country) return true;
  const normalized = country.toLowerCase().trim();
  return normalized === "united states" || normalized === "usa" || normalized === "us";
}

interface CostOfEquityCardProps extends CompanyAssumptionsSectionProps {
  researchValues: Record<string, { display: string; mid: number } | null | undefined>;
}

interface BuildUpRowProps {
  label: string;
  sublabel?: string;
  value: string;
  source: string;
  sourceUrl?: string;
  isSum?: boolean;
}

function BuildUpRow({ label, sublabel, value, source, sourceUrl, isSum }: BuildUpRowProps) {
  return (
    <div className={cn(
      "flex items-start justify-between gap-3 py-1.5",
      isSum && "border-t border-border mt-0.5 pt-2",
    )}>
      <div className="flex-1 min-w-0">
        <span className={cn(
          "text-xs leading-tight",
          isSum ? "text-foreground font-medium" : "text-muted-foreground",
        )}>
          {label}
        </span>
        {sublabel && (
          <span className="block text-[10px] text-muted-foreground/60 leading-tight mt-0.5">{sublabel}</span>
        )}
        {sourceUrl ? (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-[10px] leading-tight mt-0.5 text-primary/60 hover:text-primary transition-colors"
          >
            {source}
          </a>
        ) : (
          <span className="block text-[10px] leading-tight mt-0.5 text-muted-foreground/50">{source}</span>
        )}
      </div>
      <span className={cn(
        "font-mono text-xs shrink-0",
        isSum ? "text-foreground font-semibold" : "text-muted-foreground",
      )}>
        {value}
      </span>
    </div>
  );
}

export default function CostOfEquityCard({ formData, onChange, global, researchValues }: CostOfEquityCardProps) {
  const [showBuildUp, setShowBuildUp] = useState(false);
  const { data: marketRates } = useMarketRates();
  const gc = (key: string, label?: string) => ({ entityType: "company" as const, entityId: 0, assumptionKey: key, fieldLabel: label });

  const companyCountry = global.companyCountry;
  const isUS = isUsDomiciled(companyCountry);

  const rateByKey = (key: string) =>
    marketRates?.find((r) => r.rateKey === key) ?? null;

  const rfRate = rateByKey("treasury_10y");
  const erpRate = rateByKey("erp_boutique_hospitality");
  const crpRate = (!isUS && companyCountry) ? rateByKey(toCrpKey(companyCountry)) : null;

  const rfDisplay: string = rfRate?.displayValue ?? (rfRate?.value != null ? `${rfRate.value.toFixed(2)}%` : "~4.3%–4.5%");
  const erpDisplay: string = erpRate?.displayValue ?? (erpRate?.value != null ? `${erpRate.value.toFixed(1)}%` : "~12.0%");
  const crpDisplay: string | null = crpRate?.displayValue ?? (crpRate?.value != null ? `${crpRate.value.toFixed(2)}%` : null);
  const illiqDisplay = `${ILLIQUIDITY_LOW_PP}%–${ILLIQUIDITY_HIGH_PP}% (mid ${ILLIQUIDITY_MID_PP}%)`;

  const rfVal = rfRate?.value ?? DEFAULT_RF_RATE_PCT_DISPLAY;
  const erpVal = erpRate?.value ?? DEFAULT_ERP_HOSPITALITY_PCT_DISPLAY;
  const crpVal = crpRate?.value ?? 0;
  const totalBuiltUp = rfVal + erpVal + ILLIQUIDITY_MID_PP + crpVal;

  const rfPublished = rfRate?.publishedAt
    ? `as of ${new Date(rfRate.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
    : undefined;

  const sumSublabel = `Rf + ERP + Illiq (mid)${!isUS ? " + CRP" : ""}`;

  return (
    <div className="relative overflow-hidden rounded-lg p-6 bg-card border border-border shadow-sm">
      <div className="relative">
        <div className="space-y-4">
          <h3 className="text-lg font-display text-foreground flex items-center gap-2">
            Cost of Capital
            <InfoTooltip text="The equity investor's required annual return — used as Re in WACC and as the discount rate for company-level DCF." manualSection="analysis" />
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <ResearchContextFieldLabel
                label={<>Cost of Equity <InfoTooltip text="The equity investor's required annual return. Used as the Re component in WACC and as the discount rate for any Management Company DCF. Typical range: 18–28% (private boutique hospitality, USD-denominated, current rate environment)." formula="WACC = (E/V × Re) + (D/V × Rd × (1−T))" manualSection="analysis" /></>}
                badgeProps={{ value: researchValues.costOfEquity?.display, entry: researchValues.costOfEquity ?? undefined, sourceType: "industry", sourceName: CITATIONS.privateReEquityBenchmarks, "data-testid": "badge-cost-of-equity" }}
                onApplyValue={() => researchValues.costOfEquity && onChange("costOfEquity", researchValues.costOfEquity.mid / 100)}
                guidanceContext={gc("costOfEquity", "Cost of Equity")}
                guardrailKey="wacc.cost_of_equity"
                currentValue={formData.costOfEquity ?? global.costOfEquity ?? DEFAULT_COST_OF_EQUITY}
                isPercent
                className="min-w-0"
              />
              <span className="shrink-0">
                <EditableValue
                  value={formData.costOfEquity ?? global.costOfEquity ?? DEFAULT_COST_OF_EQUITY}
                  onChange={(v) => onChange("costOfEquity", v)}
                  format="percent"
                  min={0.05}
                  max={0.40}
                  step={0.005}
                />
              </span>
            </div>
            <Slider
              value={[(formData.costOfEquity ?? global.costOfEquity ?? DEFAULT_COST_OF_EQUITY) * 100]}
              onValueChange={([v]) => onChange("costOfEquity", v / 100)}
              min={5}
              max={40}
              step={0.5}
            />

            {/* Build-up formula collapsible */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowBuildUp((v) => !v)}
                className="flex items-center gap-1 text-[11px] text-muted-foreground/70 hover:text-muted-foreground transition-colors"
                data-testid="buildup-toggle"
              >
                {showBuildUp
                  ? <ChevronDown className="w-3 h-3" />
                  : <ChevronRight className="w-3 h-3" />}
                Build-up breakdown
              </button>

              {showBuildUp && (
                <div className="mt-2 rounded-md border border-border/60 bg-muted/30 px-3 py-1.5 divide-y divide-border/40">
                  <BuildUpRow
                    label="Risk-free rate (Rf)"
                    sublabel={rfPublished}
                    value={rfDisplay}
                    source="FRED — U.S. 10-Year Treasury"
                    sourceUrl="https://fred.stlouisfed.org/series/DGS10"
                  />
                  <BuildUpRow
                    label="Sector equity risk premium (ERP)"
                    sublabel="Boutique lodging — Damodaran"
                    value={erpDisplay}
                    source="Damodaran WACC by Industry"
                    sourceUrl="https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/wacc.html"
                  />
                  <BuildUpRow
                    label="Illiquidity premium"
                    sublabel="Private market, boutique hospitality"
                    value={illiqDisplay}
                    source="Duff & Phelps / Kroll Cost of Capital Navigator 2024"
                  />
                  {!isUS && crpDisplay !== null && (
                    <BuildUpRow
                      label={`Country risk premium — ${companyCountry}`}
                      value={crpDisplay}
                      source="Damodaran Country Risk Premiums"
                      sourceUrl="https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ctryprem.html"
                    />
                  )}
                  {!isUS && crpDisplay === null && (
                    <BuildUpRow
                      label={`Country risk premium — ${companyCountry ?? "international"}`}
                      sublabel="Rate not yet available for this country"
                      value="—"
                      source="Damodaran Country Risk Premiums"
                      sourceUrl="https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/ctryprem.html"
                    />
                  )}
                  <BuildUpRow
                    label="Implied Re (build-up)"
                    sublabel={sumSublabel}
                    value={`~${totalBuiltUp.toFixed(1)}%`}
                    source="Cross-check against Analyst recommendation above"
                    isSum
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
