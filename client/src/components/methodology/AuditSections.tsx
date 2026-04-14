import { SectionCard } from "@/components/ui/section-card";
import { DEPRECIATION_YEARS } from "@/lib/constants";

interface AuditSectionsProps {
  expandedSections: Set<string>;
  toggleSection: (id: string) => void;
  sectionRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  icon: React.ComponentType<{ className?: string }>;
  depreciationYears?: number;
}

export function AuditSections({ 
  expandedSections, 
  toggleSection, 
  sectionRefs,
  icon,
  depreciationYears,
}: AuditSectionsProps) {
  const resolvedDepreciationYears = depreciationYears ?? DEPRECIATION_YEARS;
  return (
    <SectionCard
      id="verification"
      title="Financial Verification & Audit"
      subtitle="How we verify calculations for GAAP compliance"
      icon={icon}
      variant="light"
      expanded={expandedSections.has("verification")}
      onToggle={() => toggleSection("verification")}
      sectionRef={(el) => { sectionRefs.current["verification"] = el; }}
    >
      <p className="text-sm text-muted-foreground">
        The system includes a comprehensive <strong>PwC-level audit engine</strong> that independently
        recalculates all financial values and compares them against the primary financial engine.
        This ensures accuracy and GAAP compliance across all statements.
      </p>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Audit Sections</h4>
        <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-5">
          <li><strong>Timing Rules (ASC 606)</strong>: Verifies no revenue or expenses before acquisition/operations start dates</li>
          <li><strong>Depreciation (ASC 360)</strong>: Verifies {resolvedDepreciationYears}-year straight-line depreciation starting at acquisition</li>
          <li><strong>Loan Amortization (ASC 470)</strong>: Recalculates PMT formula, verifies interest/principal split each month</li>
          <li><strong>Income Statement</strong>: Verifies Revenue, GOP, NOI, and Net Income calculations</li>
          <li><strong>Balance Sheet (FASB Framework)</strong>: Verifies Assets = Liabilities + Equity for every period</li>
          <li><strong>Cash Flow Statement (ASC 230)</strong>: Verifies indirect method and Operating/Financing activity split</li>
          <li><strong>Management Fees</strong>: Verifies base and incentive fee calculations</li>
        </ul>
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Key GAAP/IRS Rules Enforced</h4>
        <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-5">
          <li><strong>ASC 805</strong>: Acquisition cost = fair value of consideration; depreciable basis excludes land</li>
          <li><strong>ASC 360</strong>: Property assets carried at cost minus accumulated depreciation; impairment testing via cap rate</li>
          <li><strong>ASC 470</strong>: Principal payments are NOT expenses — they reduce the loan balance on the balance sheet, not the income statement</li>
          <li><strong>ASC 230</strong>: Operating Cash Flow = Net Income + Depreciation (indirect method); interest = operating, principal = financing</li>
          <li><strong>ASC 310-20</strong>: Loan origination (closing) costs capitalized and amortized over loan term</li>
          <li><strong>ASC 606</strong>: Revenue recognition — rooms nightly, events point-in-time, F&B at point of sale</li>
          <li><strong>IRC §168</strong>: 39-year straight-line depreciation on building portion (nonresidential hotel per IRC §168(e)(2)(A)); shelters taxable income</li>
          <li><strong>IRC §1250</strong>: Depreciation recapture on sale taxed at up to 25%</li>
          <li><strong>IRC §164</strong>: Property taxes fully deductible as operating expense</li>
          <li><strong>IRS Pub 946</strong>: Land is non-depreciable; only building portion + improvements depreciated</li>
          <li><strong>USALI</strong>: FF&E reserve deducted below GOP; actual replacements capitalized 5–7 years</li>
        </ul>
        <p className="text-xs text-muted-foreground mt-3">These rules are displayed as blue ⓘ badges next to the relevant assumption fields on the property edit page. Hover any badge to see the applicable standard.</p>
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Audit Opinions</h4>
        <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-5">
          <li><strong>UNQUALIFIED</strong>: All calculations verified, no material or critical issues</li>
          <li><strong>QUALIFIED</strong>: Minor material issues found but overall statements are fairly presented</li>
          <li><strong>ADVERSE</strong>: Critical issues found that affect the reliability of the financial projections</li>
        </ul>
      </div>
    </SectionCard>
  );
}
