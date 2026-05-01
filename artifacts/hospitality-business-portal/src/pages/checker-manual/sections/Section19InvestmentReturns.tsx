import { SectionCard } from "@/components/ui/section-card";
import { ManualTable } from "@/components/ui/manual-table";
import { Callout } from "@/components/ui/callout";
import { IconInvestment } from "@/components/icons";

interface SectionProps {
  expanded: boolean;
  onToggle: () => void;
  sectionRef: (el: HTMLDivElement | null) => void;
}

export default function Section19InvestmentReturns({ expanded, onToggle, sectionRef }: SectionProps) {
  return (
    <SectionCard
      id="investment-returns"
      title="19. Investment Returns (DCF/WACC/IRR)"
      icon={IconInvestment}
      expanded={expanded}
      onToggle={onToggle}
      sectionRef={sectionRef}
    >
      <ManualTable
        headers={["Ref ID", "Name", "Formula / Logic"]}
        rows={[
          ["F-R-01", "Free Cash Flow (FCF)", "CFO − CapEx"],
          ["F-R-02", "FCF to Equity (FCFE)", "CFO − CapEx − principalRepayment + loanProceeds"],
          ["F-R-03", "Equity Invested", "Total Project Cost − Initial Loan Amount"],
          ["F-R-04", "Multiple (MOIC)", "Total Distributions / Equity Invested"],
          ["F-R-05", "Terminal Value", "Year N NOI / exitCapRate"],
          ["F-R-06", "Net Exit Proceeds", "terminalValue × (1 − commissionRate) − remainingLoanBalance"],
          ["F-R-07", "IRR", "Internal Rate of Return — the discount rate r where NPV = 0. Solved via Newton-Raphson (max 100 iterations, 1e-8 tolerance)."],
          ["F-R-08", "WACC", "(E/V × Re) + (D/V × Rd × (1 − T)). The discount rate for DCF valuation. Blends cost of equity and after-tax cost of debt by capital structure weights."],
          ["F-R-09", "Cost of Equity (Re)", "User-provided required equity return (default 18%). For private hospitality, CAPM is not used — investors specify their hurdle rate directly."],
          ["F-R-10", "After-Tax Cost of Debt", "Rd × (1 − T). Interest payments are tax-deductible, creating a tax shield that reduces the effective cost of debt."],
          ["F-R-11", "Capital Weights", "E/V = Equity / (Equity + Debt), D/V = Debt / (Equity + Debt). Derived from property-level LTV and purchase price."],
          ["F-R-12", "Portfolio WACC", "Capital-weighted average of individual property WACCs. Each property's WACC contributes proportionally to its share of total portfolio capital."],
          ["F-R-13", "DCF Portfolio Value", "Σ [ATCF_t / (1 + WACC)^t] + Terminal Value / (1 + WACC)^N"],
          ["F-R-14", "NPV", "DCF Portfolio Value − Total Equity Invested. Positive = value creation above required return."],
        ]}
      />
      <Callout severity="info" title="WACC vs. IRR as Discount Rate">
        The DCF analysis uses WACC (Weighted Average Cost of Capital) as the discount rate, not the portfolio IRR.
        Using IRR as a discount rate is circular — IRR is the rate that makes NPV zero, so NPV would always be ~$0.
        WACC represents the actual cost of capital (what investors and lenders require), making NPV meaningful:
        positive NPV means the investment exceeds required returns, negative means it falls short.
      </Callout>
      <Callout severity="info" title="Cost of Equity for Private Companies">
        For publicly traded REITs, cost of equity is derived via CAPM (risk-free rate + beta × equity risk premium).
        For private hospitality companies, beta is unreliable, so investors specify their required equity return directly
        (typically 15–25% depending on property risk profile). This is the industry standard intermediate approach.
      </Callout>
    </SectionCard>
  );
}
