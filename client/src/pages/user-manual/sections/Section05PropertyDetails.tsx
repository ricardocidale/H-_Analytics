import { SectionCard } from "@/components/ui/section-card";
import { ManualTable } from "@/components/ui/manual-table";
import { Callout } from "@/components/ui/callout";
import { IconInvestment } from "@/components/icons";interface SectionProps {
  expanded: boolean;
  onToggle: () => void;
  sectionRef: (el: HTMLDivElement | null) => void;
}

export default function Section05PropertyDetails({ expanded, onToggle, sectionRef }: SectionProps) {
  return (
    <SectionCard
      id="property-details"
      title="5. Property Details & Financials"
      icon={IconInvestment}
      variant="light"
      expanded={expanded}
      onToggle={onToggle}
      sectionRef={sectionRef}
    >
      <p className="text-sm text-muted-foreground">
        Each property detail page shows comprehensive financial projections organized into tabs and sections.
        The page opens with a full-width hero image that uses a parallax scrolling effect — as you scroll down,
        the image moves at 30% of your scroll speed with a subtle scale-up and progressive overlay, giving the
        page a cinematic depth before the financial content begins.
      </p>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Financial Statements</h4>
        <ManualTable
          variant="light"
          headers={["Statement", "What It Shows"]}
          rows={[
            ["Income Statement", "Revenue, operating expenses, the full USALI waterfall (GOP → NOI → ANOI), debt service, and GAAP net income — by month and year"],
            ["Balance Sheet", "Assets (cash, property, deferred costs), liabilities (mortgage notes), and equity (paid-in capital, retained earnings) for each period"],
            ["Cash Flow Statement", "Operating, investing, and financing activities using the indirect method (GAAP ASC 230), plus FCF, FCFE, DSCR, and cash-on-cash return"],
          ]}
        />
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Income Statement Waterfall (USALI)</h4>
        <div className="bg-card/50 rounded p-3 font-mono text-xs space-y-1">
          <div>Total Revenue (Rooms + Events + F&B + Other)</div>
          <div>− Operating Expenses</div>
          <div className="font-semibold">= Gross Operating Profit (GOP)</div>
          <div>− Fixed Charges (Property Taxes)</div>
          <div className="font-semibold">= Net Operating Income (NOI)</div>
          <div>− Management Fees (Base + Incentive)</div>
          <div>− FF&E Reserve</div>
          <div className="font-semibold">= Adjusted NOI (ANOI)</div>
          <div>− Interest Expense − Depreciation − Amortization</div>
          <div className="font-semibold">= GAAP Net Income</div>
        </div>
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Cash Flow Statement Sections</h4>
        <ManualTable
          variant="light"
          headers={["Section", "Key Items"]}
          rows={[
            ["Cash from Operations", "Room revenue, event revenue, F&B, operating expenses, management fees, taxes, interest"],
            ["Cash from Investing", "Property acquisition, capital expenditures, exit sale proceeds"],
            ["Cash from Financing", "Loan proceeds, principal payments, equity contributions, refinancing"],
            ["Free Cash Flow (FCF)", "= CFO − Capital Expenditures"],
            ["Free Cash Flow to Equity (FCFE)", "= FCF − Net Debt Payments"],
          ]}
        />
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Key Property Metrics</h4>
        <ManualTable
          variant="light"
          headers={["Metric", "Description"]}
          rows={[
            ["ADR (Rate)", "Rack rate — the posted average daily room rate"],
            ["ADR (Effective)", "Room Revenue ÷ Sold Rooms — the actual realized rate"],
            ["Occupancy", "Sold Rooms ÷ Available Rooms — percentage of rooms occupied"],
            ["RevPAR", "Room Revenue ÷ Available Rooms — revenue per available room"],
            ["GOP (Gross Operating Profit)", "Total Revenue minus departmental operating expenses"],
            ["NOI (Net Operating Income)", "GOP minus fixed charges (property taxes)"],
            ["ANOI (Adjusted NOI)", "NOI minus management fees minus FF&E reserve"],
            ["DSCR (Debt Service Coverage Ratio)", "ANOI ÷ Total Debt Service — measures ability to cover loan payments"],
            ["Cash-on-Cash Return", "Annual after-tax cash flow ÷ total equity invested"],
            ["IRR (Internal Rate of Return)", "Annualized return considering all cash flows including exit"],
            ["Equity Multiple", "Total cash returned to investors ÷ equity invested"],
          ]}
        />
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Formula Rows</h4>
        <p className="text-sm text-muted-foreground">
          Every calculated subtotal and metric in the financial statements has a collapsible "Formula" row
          indicated by a chevron icon. Click it to reveal the exact formula and component values used for
          that line item. This includes operating expense breakdowns, metric calculations (ADR, RevPAR,
          Occupancy), and all waterfall subtotals.
        </p>
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Balance Sheet Structure</h4>
        <ManualTable
          variant="light"
          headers={["Category", "Line Items"]}
          rows={[
            ["Current Assets", "Cash & Cash Equivalents (operating reserves + cumulative operating cash flow + refinancing proceeds)"],
            ["Fixed Assets", "Property, Plant & Equipment (acquisition cost + improvements) less Accumulated Depreciation"],
            ["Other Assets", "Deferred Financing Costs (refinancing closing costs)"],
            ["Liabilities", "Mortgage Notes Payable (outstanding debt per property)"],
            ["Equity", "Paid-In Capital (equity invested) + Retained Earnings (cumulative net income less pre-opening costs)"],
            ["Ratios", "Debt-to-Assets and Equity-to-Assets ratios"],
          ]}
        />
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Seasonality Profile</h4>
        <p className="text-sm text-muted-foreground">
          Set monthly multipliers (0.5–1.5) to model seasonal occupancy and ADR variations. Occupancy is
          capped at your max occupancy; ADR can exceed the base. A flat profile (all 1.0) means no seasonal
          adjustment. Seasonality profiles are assigned per property and apply to every projection year.
        </p>
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Occupancy Ramp Curve</h4>
        <p className="text-sm text-muted-foreground">
          Define year-by-year occupancy ramp as percentages of stabilized occupancy. This overrides the
          default step-function ramp. For example, [0.60, 0.75, 0.85, 0.92, 1.0] ramps the property
          from 60% to 100% of its stabilized occupancy over 5 years. Each entry represents one operating
          year; once the array is exhausted, the property stays at stabilized occupancy.
        </p>
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Regenerate Intelligence</h4>
        <p className="text-sm text-muted-foreground">
          After entering base property info (address, rooms, quality tier), press <strong>Regenerate Intelligence</strong> to
          run AI research. Gold badges appear next to every assumption field showing recommended ranges.
          Adjust your assumptions based on these ranges. Research results are cached — you only need to
          regenerate when property characteristics change or data becomes stale.
        </p>
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Risk Insights</h4>
        <p className="text-sm text-muted-foreground mb-2">
          A collapsible <strong>Risk Insights</strong> panel on the Property Edit page shows the property's risk grade
          (A through F), top risks with severity badges, and strengths. The panel summarizes:
        </p>
        <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
          <li>Overall risk grade based on financial, market, and operational factors</li>
          <li>Top risks ranked by severity (Critical, High, Medium, Low)</li>
          <li>Key strengths that mitigate risk for the property</li>
        </ul>
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Stress Scenarios</h4>
        <p className="text-sm text-muted-foreground mb-2">
          Five deterministic stress tests show the impact of adverse conditions on property performance:
        </p>
        <ManualTable
          variant="light"
          headers={["Scenario", "Shock Applied", "Key Outputs"]}
          rows={[
            ["Occupancy Stress", "Occupancy −15%", "NOI and DSCR impact"],
            ["Rate Stress", "ADR −10%", "Revenue and NOI impact"],
            ["Interest Rate Stress", "Rates +200 basis points", "Debt service and DSCR impact"],
            ["Cost Stress", "Operating costs +20%", "GOP and NOI impact"],
            ["Combined Stress", "All four shocks simultaneously", "Worst-case NOI and DSCR"],
          ]}
        />
      </div>

      <Callout variant="light">
        All financial calculations are deterministic — computed by the financial engine, never estimated or
        approximated. Click any "Formula" chevron to see exactly how a value was derived.
      </Callout>
    </SectionCard>
  );
}
