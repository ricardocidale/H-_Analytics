import { SectionCard } from "@/components/ui/section-card";
import { Callout } from "@/components/ui/callout";
import { IconVerify } from "@/components/icons";interface SectionProps {
  expanded: boolean;
  onToggle: () => void;
  sectionRef: (el: HTMLDivElement | null) => void;
}

export default function Section17BusinessRules({ expanded, onToggle, sectionRef }: SectionProps) {
  return (
    <SectionCard
      id="business-constraints"
      title="17. Business Rules & Constraints"
      icon={IconVerify}
      variant="light"
      className="border-primary/30 bg-primary/5"
      expanded={expanded}
      onToggle={onToggle}
      sectionRef={sectionRef}
    >
      <p className="text-sm text-muted-foreground">
        The financial model enforces mandatory business rules that reflect real-world constraints.
        These rules cannot be overridden — if any are violated, the system flags the scenario as invalid.
      </p>

      <Callout severity="critical" variant="light" title="1. Management Company Funding Gate">
        <p>
          Operations of the Management Company cannot begin before funding is received. The company requires
          capital tranches to cover startup costs before management fee revenue begins flowing from properties.
        </p>
      </Callout>

      <Callout severity="critical" variant="light" title="2. Property Activation Gate">
        <p>
          A property cannot begin operating before it is purchased and funding is in place. Revenue and operating
          expenses only begin after the acquisition date and operations start date.
        </p>
      </Callout>

      <Callout severity="critical" variant="light" title="3. No Negative Cash Rule">
        <p>
          Cash balances for each property, the Management Company, and the aggregated portfolio must never be negative.
        </p>
      </Callout>

      <Callout severity="critical" variant="light" title="4. Debt-Free at Exit">
        <p>
          At exit, all properties must be debt-free. Outstanding loan balances are repaid from gross sale proceeds
          before calculating net proceeds to equity.
        </p>
        <div className="bg-muted rounded p-2 font-mono text-xs mt-2">
          <div>Gross Sale Value = Final Year NOI / Exit Cap Rate</div>
          <div>Less: Sales Commission</div>
          <div>Less: Outstanding Debt Balance (must be fully repaid)</div>
          <div>= Net Proceeds to Equity</div>
        </div>
      </Callout>

      <Callout severity="critical" variant="light" title="5. No Over-Distribution Rule">
        <p>
          FCF distributions and refinancing proceeds returned to investors must not exceed available cash.
        </p>
      </Callout>

      <Callout severity="critical" variant="light" title="6. Income Statement: Interest Only (No Principal)">
        <p>
          The income statement shows <strong>only interest expense</strong>, never principal repayment.
          Principal payments are balance sheet transactions that reduce the loan liability.
        </p>
      </Callout>

      <Callout severity="critical" variant="light" title="7. Capital Structure Presentation">
        <p>
          All financial reports must present capital sources on separate lines for clarity:
        </p>
        <div className="bg-card/50 rounded p-2 font-mono text-xs mt-2 space-y-1">
          <div><strong>Equity (Cash) Infusion</strong> — one line item</div>
          <div><strong>Loan Proceeds</strong> — separate line item (acquisition financing)</div>
          <div><strong>Refinancing Proceeds</strong> — separate line item (cash-out from refi)</div>
        </div>
      </Callout>

      <Callout severity="critical" variant="light" title="8. Intercompany Fee Elimination (ASC 810)">
        <p>
          Management fees (base and incentive) are revenue to the management company and an expense to
          each property. On the consolidated income statement, these intercompany transactions must be
          eliminated so they net to zero. The consolidated view shows only external revenue and third-party
          expenses per ASC 810 (Consolidation).
        </p>
        <div className="bg-card/50 rounded p-2 font-mono text-xs mt-2 space-y-1">
          <div><strong>Property P&L:</strong> Base Fee Expense + Incentive Fee Expense (deducted from GOP to arrive at AGOP)</div>
          <div><strong>Company P&L:</strong> Base Fee Revenue + Incentive Fee Revenue (income)</div>
          <div><strong>Consolidated P&L:</strong> Both lines eliminated → net $0 impact</div>
        </div>
      </Callout>

      <Callout severity="critical" variant="light" title="9. USALI Income Statement Ordering">
        <p>
          The property income statement follows the USALI (Uniform System of Accounts for the Lodging Industry)
          12th Edition line-item ordering. This ensures consistency with industry standards and auditability:
        </p>
        <div className="bg-card/50 rounded p-2 font-mono text-xs mt-2 space-y-1">
          <div>Total Revenue</div>
          <div>− Departmental Expenses (Rooms, F&B, Events, Other)</div>
          <div>− Undistributed Operating Expenses (A&G, S&M, POM, Utilities, IT, Insurance, Other)</div>
          <div>= <strong>Gross Operating Profit (GOP)</strong></div>
          <div>− Management Fees (Base + Incentive)</div>
          <div>= <strong>Adjusted GOP (AGOP)</strong></div>
          <div>− Property Taxes</div>
          <div>= <strong>Net Operating Income (NOI)</strong></div>
          <div>− FF&E Reserve</div>
          <div>= <strong>Adjusted NOI (ANOI)</strong></div>
        </div>
      </Callout>
    </SectionCard>
  );
}
