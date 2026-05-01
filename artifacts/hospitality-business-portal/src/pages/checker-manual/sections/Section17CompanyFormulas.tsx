import { SectionCard } from "@/components/ui/section-card";
  import { ManualTable } from "@/components/ui/manual-table";
  import { Callout } from "@/components/ui/callout";
  import { IconBriefcase } from "@/components/icons";interface SectionProps {
    expanded: boolean;
    onToggle: () => void;
    sectionRef: (el: HTMLDivElement | null) => void;
  }

  export default function Section17CompanyFormulas({ expanded, onToggle, sectionRef }: SectionProps) {
    return (
      <SectionCard
        id="company-formulas"
        title="17. Management Company Formulas"
        icon={IconBriefcase}
        expanded={expanded}
        onToggle={onToggle}
        sectionRef={sectionRef}
      >
        <Callout>
          Management company revenue is derived from fees charged to managed properties per the Hotel Management Agreement (HMA).
          Fee benchmarks are sourced from the HVS 2024 Fee Survey for specialty/wellness operators. Intercompany fees
          are eliminated on consolidation per ASC 810.
        </Callout>
        <ManualTable
          headers={["Ref ID", "Name", "Formula / Logic", "Industry Basis"]}
          rows={[
            ["F-C-01", "Base Fee Revenue", "Σ (propertyTotalRevenue × baseMgmtFeeRate)", "HVS 2024 Specialty: 6–10% of revenue; default 8.5%"],
            ["F-C-02", "Incentive Fee Revenue", "Σ (propertyGOP × incentiveMgmtFeeRate)", "HVS 2024 Specialty: 12–20% of GOP; only when GOP > 0"],
            ["F-C-02a", "Cost-of-Services Revenue", "Σ (centralized service cost × (1 + serviceMarkup))", "USALI Schedule 16; typical markup 15–25% on pass-through services"],
            ["F-C-03", "Total Revenue", "baseFeeRevenue + incentiveFeeRevenue + costOfServicesRevenue", "—"],
            ["F-C-03a", "Cost of Services Expense", "Σ (actual cost of centralized services provided)", "Matched against cost-of-services revenue; margin = markup %"],
            ["F-C-04", "Partner Comp", "partnerCompScheduleYearN / 12", "Early-stage hotel mgmt: $400K–$700K total partner comp in Years 1–3"],
            ["F-C-05", "Staff Comp", "(headcountTier × staffSalary / 12) × (1 + companyInflation)^year", "AHLA Lodging Survey: $65K–$90K avg hospitality mgmt salary"],
            ["F-C-06", "Fixed Overheads", "annualCost / 12 × (1 + max(escalation, companyInflation))^year", "Early-stage mgmt co: $70K–$110K total fixed overhead (office, legal, tech)"],
            ["F-C-07", "Travel/IT Variable", "managedProperties × costPerProperty / 12 × (1 + companyInflation)^year", "AHLA: $8K–$18K travel + $2K–$5K IT per managed property"],
            ["F-C-08", "Marketing/Misc", "totalCompanyRevenue × rate", "Typical 3–7% marketing + 2–4% misc ops of fee revenue"],
            ["F-C-08a", "Funding Interest Expense", "outstandingPrincipal × annualRate / 12 (or accrued)", "SAFE/convertible note interest; default 8% simple interest, accrues until conversion"],
            ["F-C-09", "Net Income (Pre-Tax)", "totalRevenue − totalExpenses", "—"],
            ["F-C-09a", "EBITDA", "Net Income + Interest + Depreciation + Amortization", "Common valuation metric; early-stage mgmt cos often EBITDA-negative in Years 1–2"],
            ["F-C-09b", "Income Tax", "max(0, taxableIncome) × companyTaxRate", "Default 30% corporate rate; NOL carryforward per IRC §172"],
            ["F-C-10", "Net Income (After-Tax)", "preTaxIncome − incomeTax", "—"],
            ["F-C-11", "Intercompany Elimination", "Base fees + incentive fees are eliminated on consolidation", "ASC 810: management fees are intercompany revenue/expense; net zero on consolidated P&L"],
          ]}
        />
      </SectionCard>
    );
  }
