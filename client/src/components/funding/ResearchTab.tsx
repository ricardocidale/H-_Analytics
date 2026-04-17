import { ScrollReveal } from "@/components/graphics";
import { IconTrending, IconDollarSign, IconSettings, IconCheckCircle } from "@/components/icons";
import { ContentPanel } from "@/components/ui/content-panel";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "@/components/icons/themed-icons";
import { formatMoney } from "@/lib/financialEngine";
import { analyzeFundingNeeds } from "@/lib/financial/funding-predictor";
import { OPERATING_RESERVE_BUFFER, COMPANY_FUNDING_BUFFER } from "@/lib/constants";
import { DEFAULT_CAPITAL_RAISE_VALUATION_CAP, DEFAULT_CAPITAL_RAISE_DISCOUNT_RATE, DEFAULT_TRANCHE_BUFFER_MULTIPLIER, DEFAULT_EARLY_STAGE_CAP_DISCOUNT, DEFAULT_EARLY_STAGE_DISCOUNT_PREMIUM, DEFAULT_FUNDING_ROUNDING_INCREMENT } from "@shared/constants";
import { StatRow } from "./shared";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ResearchTab({ analysis, fundingLabel, marketRates, global, navigate }: {
  analysis: NonNullable<ReturnType<typeof analyzeFundingNeeds>>;
  fundingLabel: string;
  marketRates: any;
  global: any;
  navigate: (to: string) => void;
}) {
  const rateCards = [
    { key: 'fed_funds', label: 'Fed Funds Rate', description: 'Federal Reserve benchmark rate' },
    { key: 'sofr', label: 'SOFR', description: 'Secured Overnight Financing Rate' },
    { key: 'treasury_10y', label: '10-Year Treasury', description: 'U.S. Treasury yield benchmark' },
    { key: 'hotel_lending_spread', label: 'Hotel Lending Spread', description: 'Basis points over SOFR for hospitality debt' },
  ];

  return (
    <>
      <ScrollReveal>
        <ContentPanel data-testid="panel-market-rates">
          <div className="flex items-start gap-3 mb-4">
            <IconTrending className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-display text-foreground">Market Intelligence</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Live rates that inform capital raise ({fundingLabel}) terms and valuation</p>
            </div>
          </div>

          {marketRates && marketRates.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {rateCards.map(({ key, label, description }) => {
                const rate = marketRates.find((r: any) => r.rateKey === key);
                return (
                  <div key={key} className="rounded-lg bg-muted/50 p-3 border border-border/50" data-testid={`metric-rate-${key}`}>
                    <p className="text-xs font-medium text-foreground">{label}</p>
                    <p className="text-lg font-mono font-semibold text-foreground mt-1">
                      {rate?.value !== null && rate?.value !== undefined
                        ? key === 'hotel_lending_spread' ? `${rate.value} bps` : `${Number(rate.value).toFixed(2)}%`
                        : '—'}
                    </p>
                    <p className="text-[10px] text-muted-foreground/60 mt-1">{description}</p>
                    {rate?.source && (
                      <p className="text-[10px] text-muted-foreground/50 mt-0.5">Source: {rate.source}</p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg bg-muted/30 border border-border/40 p-4 text-center">
              <p className="text-sm text-muted-foreground">No market rate data available. Refresh rates in the Research Center.</p>
            </div>
          )}

          <p className="text-sm text-muted-foreground/80 leading-relaxed mt-3" data-testid="text-market-context">
            {analysis.marketContext}
          </p>
        </ContentPanel>
      </ScrollReveal>

      <ScrollReveal>
        <ContentPanel data-testid="panel-funding-instruments">
          <div className="flex items-start gap-3 mb-4">
            <IconDollarSign className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-display text-foreground">Funding Instruments</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Reference only — does not affect the simulation</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              {
                name: "SAFE",
                fit: "Pre-revenue / seed",
                pros: ["Fast to close", "No debt on balance sheet", "Delays valuation"],
                cons: ["Dilution uncertain until conversion", "No investor governance rights"],
              },
              {
                name: "Convertible Note",
                fit: "Early stage",
                pros: ["Investor downside protection", "Familiar to institutional investors"],
                cons: ["Creates debt obligation", "Maturity date pressure"],
              },
              {
                name: "Priced Equity",
                fit: "Revenue-stage / Series A+",
                pros: ["Clear ownership math", "Investor governance rights"],
                cons: ["Requires defensible valuation", "Slower to close"],
              },
              {
                name: "Revenue-Based",
                fit: "Post-revenue",
                pros: ["Non-dilutive", "Payments flex with revenue"],
                cons: ["Requires existing revenue", "Reduces near-term cash flow"],
              },
              {
                name: "Mezzanine",
                fit: "Asset-backed / later stage",
                pros: ["Leverages property collateral", "Structured for hospitality"],
                cons: ["Requires tangible assets", "Higher cost of capital"],
              },
            ].map((inst) => (
              <div key={inst.name} className="rounded-lg border border-border/50 bg-muted/30 p-3" data-testid={`instrument-${inst.name.toLowerCase().replace(/\s+/g, "-")}`}>
                <h4 className="text-sm font-display font-medium text-foreground">{inst.name}</h4>
                <p className="text-[11px] text-primary/80 font-medium mb-2">{inst.fit}</p>
                <div className="space-y-1.5">
                  {inst.pros.map((p, i) => (
                    <p key={`p${i}`} className="text-[11px] text-muted-foreground/70 flex items-start gap-1">
                      <span className="text-primary shrink-0">+</span> {p}
                    </p>
                  ))}
                  {inst.cons.map((c, i) => (
                    <p key={`c${i}`} className="text-[11px] text-muted-foreground/70 flex items-start gap-1">
                      <span className="text-accent-pop shrink-0">–</span> {c}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground/60 mt-3">
            Set your chosen instrument label in Company Assumptions. The simulation engine is instrument-agnostic.
          </p>
        </ContentPanel>
      </ScrollReveal>

      <ScrollReveal>
        <ContentPanel data-testid="panel-engine-parameters">
          <div className="flex items-start gap-3 mb-4">
            <IconSettings className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-display text-foreground">Engine Parameters</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Constants and assumptions used by the funding analysis engine</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wider mb-2">Reserves & Buffers</p>
              <div className="space-y-0">
                <StatRow label="Operating Reserve" value={formatMoney(OPERATING_RESERVE_BUFFER)} />
                <StatRow label="Company Funding Buffer" value={formatMoney(COMPANY_FUNDING_BUFFER)} />
                <StatRow label="Tranche Buffer Multiplier" value={`${DEFAULT_TRANCHE_BUFFER_MULTIPLIER}×`} />
              </div>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground/60 uppercase tracking-wider mb-2">Default Instrument Terms</p>
              <div className="space-y-0">
                <StatRow label="Default Valuation Cap" value={formatMoney(DEFAULT_CAPITAL_RAISE_VALUATION_CAP)} />
                <StatRow label="Default Discount Rate" value={`${(DEFAULT_CAPITAL_RAISE_DISCOUNT_RATE * 100).toFixed(0)}%`} />
                <StatRow label="Early-Stage Cap Discount" value={`${(DEFAULT_EARLY_STAGE_CAP_DISCOUNT * 100).toFixed(0)}%`} />
                <StatRow label="Early-Stage Discount Premium" value={`${(DEFAULT_EARLY_STAGE_DISCOUNT_PREMIUM * 100).toFixed(0)} pp`} />
              </div>
            </div>
          </div>
        </ContentPanel>
      </ScrollReveal>

      <ScrollReveal>
        <ContentPanel data-testid="panel-methodology">
          <div className="flex items-start gap-3 mb-3">
            <IconCheckCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-display text-foreground">Methodology</h3>
              <p className="text-xs text-muted-foreground mt-0.5">How the engine computes the recommended capital raise</p>
            </div>
          </div>
          <div className="space-y-3 text-sm text-muted-foreground/80 leading-relaxed">
            <p>
              The engine generates a month-by-month company pro forma from all property-level financials, computing net income (fee revenue minus corporate overhead) each month. The cumulative cash position without funding reveals the peak cash deficit — the maximum capital the company needs before fee revenue exceeds expenses.
            </p>
            <p>
              The total raise target adds the operating reserve ({formatMoney(OPERATING_RESERVE_BUFFER)}) and company funding buffer ({formatMoney(COMPANY_FUNDING_BUFFER)}) to the peak deficit, then rounds up to the nearest {formatMoney(DEFAULT_FUNDING_ROUNDING_INCREMENT)}. Tranches are sized using the {DEFAULT_TRANCHE_BUFFER_MULTIPLIER}× buffer multiplier applied to the cash deficit at each tranche timing point.
            </p>
            <p>
              Valuation caps and discount rates are calibrated against the 10-Year Treasury yield (risk-free rate proxy). Early tranches receive a {(DEFAULT_EARLY_STAGE_CAP_DISCOUNT * 100).toFixed(0)}% cap discount and {(DEFAULT_EARLY_STAGE_DISCOUNT_PREMIUM * 100).toFixed(0)} percentage point discount premium to compensate investors for pre-revenue risk. Later tranches use the configured base terms as the company demonstrates revenue traction.
            </p>
          </div>
        </ContentPanel>
      </ScrollReveal>

      <ScrollReveal>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/admin")}
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors rounded-lg border border-border/50 px-3 py-2 h-auto"
            data-testid="link-admin-research"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Research Center
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/admin")}
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors rounded-lg border border-border/50 px-3 py-2 h-auto"
            data-testid="link-admin-assumptions"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Company Assumptions
          </Button>
        </div>
      </ScrollReveal>
    </>
  );
}
