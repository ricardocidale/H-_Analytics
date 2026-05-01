import { formatMoney } from "@/lib/financialEngine";
import {
  SectionHeader,
  LineItem,
  ExpandableLineItem,
  ExpandableMetricRow,
  SpacerRow,
  MetricRow,
  MarginRow,
  FormulaDetailStringRow,
} from "@/components/financial-table";

interface YearlyDetail {
  year: number;
  availableRooms: number;
  soldRooms: number;
  cleanAdr: number;
  revenueRooms: number;
  revenueEvents: number;
  revenueFB: number;
  revenueOther: number;
  revenueTotal: number;
  totalExpenses: number;
  expenseRooms: number;
  expenseFB: number;
  expenseEvents: number;
  expenseOther: number;
  expenseMarketing: number;
  expensePropertyOps: number;
  expenseUtilitiesVar: number;
  expenseUtilitiesFixed: number;
  expenseAdmin: number;
  expenseIT: number;
  expenseInsurance: number;
  expenseOtherCosts: number;
  expenseTaxes: number;
  expenseFFE: number;
  feeBase: number;
  feeIncentive: number;
  gop: number;
  agop: number;
  noi: number;
  anoi: number;
}

interface CashFlowOperatingRowsProps {
  yearlyDetails: YearlyDetail[];
  expanded: Record<string, boolean>;
  toggleSection: (section: string) => void;
  colSpan: number;
  property: { startAdr?: number; adrGrowthRate?: number };
}

export function CashFlowOperatingRows({
  yearlyDetails,
  expanded,
  toggleSection,
  colSpan,
  property,
}: CashFlowOperatingRowsProps) {
  return (
    <>
      <SectionHeader
        label="Cash Flow from Operating Activities"
        colSpan={colSpan}
        tooltip="Cash generated from day-to-day property operations (ASC 230). Shows actual cash received from guests and paid to vendors/staff."
      />

      <ExpandableLineItem
        label="Cash Received from Guests & Clients"
        values={yearlyDetails.map(y => y.revenueTotal)}
        tooltip="Click to expand: ADR, Occupancy, RevPAR, and revenue by stream."
        expanded={!!expanded.revenue}
        onToggle={() => toggleSection('revenue')}
      >
        <MetricRow
          label="Total Rooms Available"
          tooltip="Total room-nights available for the year. Room Count × Days per Month × 12."
          values={yearlyDetails.map(y => y.availableRooms.toLocaleString())}
        />

        <ExpandableMetricRow
          label="ADR (Rate)"
          tooltip="Average Daily Rate — the published end-of-year room rate after annual ADR growth. This is the 'clean' rate, not blended across rate changes."
          values={yearlyDetails.map(y => y.cleanAdr > 0 ? `$${y.cleanAdr.toFixed(2)}` : "-")}
          expanded={!!expanded.cfAdrRate}
          onToggle={() => toggleSection('cfAdrRate')}
        >
          <FormulaDetailStringRow
            label="Starting ADR × (1 + growth rate)^year"
            values={yearlyDetails.map(y => {
              if (y.cleanAdr <= 0) return "-";
              const startAdr = property.startAdr ?? 0;
              const growthRate = property.adrGrowthRate ?? 0;
              return `$${startAdr.toFixed(2)} × (1+${(growthRate * 100).toFixed(1)}%)^${y.year}`;
            })}
          />
        </ExpandableMetricRow>

        <ExpandableMetricRow
          label="ADR (Effective)"
          tooltip="Effective ADR — the actual blended average rate earned. Room Revenue ÷ Sold Rooms."
          values={yearlyDetails.map(y => y.soldRooms > 0 ? `$${(y.revenueRooms / y.soldRooms).toFixed(2)}` : "-")}
          expanded={!!expanded.cfAdrEff}
          onToggle={() => toggleSection('cfAdrEff')}
        >
          <FormulaDetailStringRow
            label="Room Revenue ÷ Sold Rooms"
            values={yearlyDetails.map(y =>
              y.soldRooms > 0 ? `${formatMoney(y.revenueRooms)} ÷ ${y.soldRooms.toLocaleString()}` : "-"
            )}
          />
        </ExpandableMetricRow>

        <ExpandableMetricRow
          label="Occupancy"
          tooltip="Occupancy Rate — percentage of available rooms sold. Sold Rooms ÷ Available Rooms × 100."
          values={yearlyDetails.map(y =>
            y.availableRooms > 0 ? `${((y.soldRooms / y.availableRooms) * 100).toFixed(1)}%` : "0%"
          )}
          expanded={!!expanded.cfOcc}
          onToggle={() => toggleSection('cfOcc')}
        >
          <FormulaDetailStringRow
            label="Sold Rooms"
            values={yearlyDetails.map(y => y.soldRooms.toLocaleString())}
          />
          <FormulaDetailStringRow
            label="Available Rooms"
            values={yearlyDetails.map(y => y.availableRooms.toLocaleString())}
          />
        </ExpandableMetricRow>

        <ExpandableMetricRow
          label="RevPAR"
          tooltip="Revenue Per Available Room — Room Revenue ÷ Available Rooms (or ADR × Occupancy)."
          values={yearlyDetails.map(y =>
            y.availableRooms > 0 ? `$${(y.revenueRooms / y.availableRooms).toFixed(2)}` : "-"
          )}
          expanded={!!expanded.cfRevpar}
          onToggle={() => toggleSection('cfRevpar')}
        >
          <FormulaDetailStringRow
            label="Room Revenue ÷ Available Rooms"
            values={yearlyDetails.map(y =>
              y.availableRooms > 0 ? `${formatMoney(y.revenueRooms)} ÷ ${y.availableRooms.toLocaleString()}` : "-"
            )}
          />
          <FormulaDetailStringRow
            label="Cross-check: ADR × Occupancy"
            values={yearlyDetails.map(y => {
              if (y.availableRooms === 0) return "-";
              const effAdr = y.soldRooms > 0 ? y.revenueRooms / y.soldRooms : 0;
              const occ = y.soldRooms / y.availableRooms;
              return `$${effAdr.toFixed(2)} × ${(occ * 100).toFixed(1)}% = $${(effAdr * occ).toFixed(2)}`;
            })}
          />
        </ExpandableMetricRow>

        <LineItem label="Guest Room Revenue" values={yearlyDetails.map(y => y.revenueRooms)} indent />
        <LineItem label="Event & Venue Revenue" values={yearlyDetails.map(y => y.revenueEvents)} indent />
        <LineItem label="Food & Beverage Revenue" values={yearlyDetails.map(y => y.revenueFB)} indent />
        <LineItem label="Other Revenue (Spa/Experiences)" values={yearlyDetails.map(y => y.revenueOther)} indent />

        <ExpandableMetricRow
          label="TRevPAR"
          tooltip="Total Revenue Per Available Room — Total Revenue ÷ Available Rooms. The broadest top-line efficiency metric."
          values={yearlyDetails.map(y =>
            y.availableRooms > 0 ? `$${(y.revenueTotal / y.availableRooms).toFixed(2)}` : "-"
          )}
          expanded={!!expanded.cfTrevpar}
          onToggle={() => toggleSection('cfTrevpar')}
        >
          <FormulaDetailStringRow
            label="Total Revenue ÷ Available Rooms"
            values={yearlyDetails.map(y =>
              y.availableRooms > 0 ? `${formatMoney(y.revenueTotal)} ÷ ${y.availableRooms.toLocaleString()}` : "-"
            )}
          />
        </ExpandableMetricRow>
      </ExpandableLineItem>

      <ExpandableLineItem
        label="Cash Paid for Operating Expenses"
        values={yearlyDetails.map(y => y.totalExpenses - y.expenseFFE)}
        tooltip="Click to expand: Direct costs, overhead & admin, and management fees. Excludes FF&E (shown in Investing)."
        expanded={!!expanded.expenses}
        onToggle={() => toggleSection('expenses')}
        negate
      >
        <ExpandableLineItem
          label="Departmental Expenses"
          values={yearlyDetails.map(y => y.expenseRooms + y.expenseFB + y.expenseEvents + y.expenseOther)}
          tooltip="Direct departmental costs that scale with occupancy and revenue (USALI Schedule 1–4)."
          expanded={!!expanded.cfDirect}
          onToggle={() => toggleSection('cfDirect')}
        >
          <LineItem label="Rooms" values={yearlyDetails.map(y => y.expenseRooms)} indent />
          <LineItem label="Food & Beverage" values={yearlyDetails.map(y => y.expenseFB)} indent />
          <LineItem label="Events & Banquets" values={yearlyDetails.map(y => y.expenseEvents)} indent />
          <LineItem label="Other Departmental" values={yearlyDetails.map(y => y.expenseOther)} indent />
        </ExpandableLineItem>

        <ExpandableLineItem
          label="Undistributed Operating Expenses"
          values={yearlyDetails.map(y => y.expenseMarketing + y.expensePropertyOps + y.expenseUtilitiesVar + y.expenseUtilitiesFixed + y.expenseAdmin + y.expenseIT + y.expenseInsurance + y.expenseOtherCosts)}
          tooltip="Shared overhead not allocated to individual departments (USALI Schedule 5–10): marketing, property ops, admin, IT, insurance, utilities. Excludes Property Taxes (classified as Fixed Charges per USALI)."
          expanded={!!expanded.cfOverhead}
          onToggle={() => toggleSection('cfOverhead')}
        >
          <LineItem label="Marketing & Sales" values={yearlyDetails.map(y => y.expenseMarketing)} indent />
          <LineItem label="Property Operations & Maintenance" values={yearlyDetails.map(y => y.expensePropertyOps)} indent />
          <LineItem label="Utilities (Variable)" values={yearlyDetails.map(y => y.expenseUtilitiesVar)} indent />
          <LineItem label="Utilities (Fixed)" values={yearlyDetails.map(y => y.expenseUtilitiesFixed)} indent />
          <LineItem label="Insurance" values={yearlyDetails.map(y => y.expenseInsurance)} indent />
          <LineItem label="Administrative & General" values={yearlyDetails.map(y => y.expenseAdmin)} indent />
          <LineItem label="IT & Technology" values={yearlyDetails.map(y => y.expenseIT)} indent />
          <LineItem label="Other Undistributed" values={yearlyDetails.map(y => y.expenseOtherCosts)} indent />
        </ExpandableLineItem>

        <LineItem
          label="Fixed Charges (Property Taxes)"
          values={yearlyDetails.map(y => y.expenseTaxes)}
          tooltip="Property taxes classified as Fixed Charges per USALI 12th Ed. Deducted after AGOP to arrive at NOI."
        />

        <ExpandableLineItem
          label="Management Fees"
          values={yearlyDetails.map(y => y.feeBase + y.feeIncentive)}
          tooltip="Fees paid to the management company: base fee (% of total revenue) and incentive fee (% of GOP)."
          expanded={!!expanded.cfMgmtFees}
          onToggle={() => toggleSection('cfMgmtFees')}
        >
          <LineItem label="Base Management Fee" values={yearlyDetails.map(y => y.feeBase)} indent />
          <LineItem label="Incentive Management Fee" values={yearlyDetails.map(y => y.feeIncentive)} indent />
        </ExpandableLineItem>
      </ExpandableLineItem>
      <MarginRow label="% of Total Revenue" values={yearlyDetails.map(y => y.totalExpenses - y.expenseFFE)} baseValues={yearlyDetails.map(y => y.revenueTotal)} />

      <SpacerRow colSpan={colSpan} />
    </>
  );
}

export function CashFlowUSALIRows({
  yearlyDetails,
  expanded,
  toggleSection,
  colSpan,
}: Omit<CashFlowOperatingRowsProps, 'property'>) {
  return (
    <>
      <SectionHeader
        label="USALI Profitability Subtotals"
        colSpan={colSpan}
        tooltip="Key profitability milestones from the Income Statement (USALI 12th Ed). These reference values show the operating waterfall before cash adjustments for interest and taxes."
      />

      <ExpandableLineItem
        label="Gross Operating Profit (GOP)"
        values={yearlyDetails.map(y => y.gop)}
        tooltip="Revenue minus all departmental and undistributed operating expenses. The property's core operating profitability before management fees."
        expanded={!!expanded.cfGop}
        onToggle={() => toggleSection('cfGop')}
      >
        <LineItem label="Total Revenue" values={yearlyDetails.map(y => y.revenueTotal)} indent />
        <LineItem label="Less: Departmental Expenses" values={yearlyDetails.map(y => y.expenseRooms + y.expenseFB + y.expenseEvents + y.expenseOther)} indent negate />
        <LineItem label="Less: Undistributed Expenses" values={yearlyDetails.map(y => y.expenseMarketing + y.expensePropertyOps + y.expenseUtilitiesVar + y.expenseUtilitiesFixed + y.expenseAdmin + y.expenseIT + y.expenseInsurance + y.expenseOtherCosts)} indent negate />
        <MetricRow
          label="GOP Margin"
          values={yearlyDetails.map(y => y.revenueTotal > 0 ? `${((y.gop / y.revenueTotal) * 100).toFixed(1)}%` : "-")}
          tooltip="GOP as a percentage of Total Revenue."
        />
        <MetricRow
          label="GOPPAR"
          values={yearlyDetails.map(y => y.availableRooms > 0 ? `$${(y.gop / y.availableRooms).toFixed(2)}` : "-")}
          tooltip="Gross Operating Profit Per Available Room — GOP ÷ Available Rooms."
        />
      </ExpandableLineItem>

      <ExpandableLineItem
        label="Adjusted GOP (AGOP)"
        values={yearlyDetails.map(y => y.agop)}
        tooltip="GOP minus management fees. Shows profitability after the operator takes their share."
        expanded={!!expanded.cfAgop}
        onToggle={() => toggleSection('cfAgop')}
      >
        <LineItem label="Gross Operating Profit" values={yearlyDetails.map(y => y.gop)} indent />
        <LineItem label="Less: Base Management Fee" values={yearlyDetails.map(y => y.feeBase)} indent negate />
        <LineItem label="Less: Incentive Management Fee" values={yearlyDetails.map(y => y.feeIncentive)} indent negate />
        <MetricRow
          label="AGOP Margin"
          values={yearlyDetails.map(y => y.revenueTotal > 0 ? `${((y.agop / y.revenueTotal) * 100).toFixed(1)}%` : "-")}
          tooltip="AGOP as a percentage of Total Revenue."
        />
      </ExpandableLineItem>

      <ExpandableLineItem
        label="Net Operating Income (NOI)"
        values={yearlyDetails.map(y => y.noi)}
        tooltip="AGOP minus fixed charges (property taxes). The property's bottom-line operating income before capital reserves and debt."
        expanded={!!expanded.cfNoi}
        onToggle={() => toggleSection('cfNoi')}
      >
        <LineItem label="Adjusted GOP" values={yearlyDetails.map(y => y.agop)} indent />
        <LineItem label="Less: Fixed Charges (Property Taxes)" values={yearlyDetails.map(y => y.expenseTaxes)} indent negate />
        <MetricRow
          label="NOI Margin"
          values={yearlyDetails.map(y => y.revenueTotal > 0 ? `${((y.noi / y.revenueTotal) * 100).toFixed(1)}%` : "-")}
          tooltip="NOI as a percentage of Total Revenue."
        />
        <MetricRow
          label="NOIPOR"
          values={yearlyDetails.map(y => y.availableRooms > 0 ? `$${(y.noi / y.availableRooms).toFixed(2)}` : "-")}
          tooltip="Net Operating Income Per Available Room — NOI ÷ Available Rooms."
        />
      </ExpandableLineItem>

      <ExpandableLineItem
        label="Adjusted NOI (ANOI)"
        values={yearlyDetails.map(y => y.anoi)}
        tooltip="NOI minus FF&E reserve. The owner's true operating cash flow before financing — the key metric for debt coverage."
        expanded={!!expanded.cfAnoi}
        onToggle={() => toggleSection('cfAnoi')}
      >
        <LineItem label="Net Operating Income" values={yearlyDetails.map(y => y.noi)} indent />
        <LineItem label="Less: FF&E Reserve" values={yearlyDetails.map(y => y.expenseFFE)} indent negate />
        <MetricRow
          label="ANOI Margin"
          values={yearlyDetails.map(y => y.revenueTotal > 0 ? `${((y.anoi / y.revenueTotal) * 100).toFixed(1)}%` : "-")}
          tooltip="ANOI as a percentage of Total Revenue."
        />
      </ExpandableLineItem>

      <SpacerRow colSpan={colSpan} />
    </>
  );
}
