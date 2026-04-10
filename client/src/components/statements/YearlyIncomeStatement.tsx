/**
 * YearlyIncomeStatement.tsx — Multi-year USALI income statement for a single property.
 *
 * Aggregates the monthly MonthlyFinancials[] array into annual columns and
 * renders a comprehensive income statement following the USALI (Uniform System
 * of Accounts for the Lodging Industry) format:
 *
 *   Revenue
 *     Room Revenue         — rooms sold × ADR (Average Daily Rate)
 *     F&B Revenue          — food & beverage (restaurant, room service, minibar)
 *     Event / Catering     — meetings & banquets, boosted by catering factor
 *     Other Revenue        — spa, parking, resort fees, etc.
 *   Departmental Expenses  — costs directly tied to each revenue center
 *   Undistributed Expenses — admin, marketing, utilities, maintenance, IT
 *   Gross Operating Profit (GOP) — revenue minus all operating expenses
 *   Management Fees        — base fee + incentive fee to operator
 *   Adjusted GOP (AGOP)    — GOP minus management fees
 *   Fixed Charges           — property tax
 *   Net Operating Income (NOI) — AGOP minus fixed charges (property taxes)
 *   FF&E Reserve            — furniture, fixtures & equipment set-aside
 *   Adjusted NOI (ANOI)     — NOI minus FF&E reserve
 *   Debt Service             — mortgage interest + principal (if financed)
 *   Net Income               — depreciation, tax, cash flow
 *
 * Rows are expandable to show calculation details (e.g. "rooms × ADR × days").
 * Margin percentages are shown inline for key subtotals.
 */
import { useState } from "react";
import { MonthlyFinancials, formatMoney } from "@/lib/financialEngine";
import {
  DEFAULT_COST_RATE_PROPERTY_OPS, DEFAULT_COST_RATE_UTILITIES,
  DEFAULT_COST_RATE_ADMIN, DEFAULT_COST_RATE_TAXES, DEFAULT_COST_RATE_INSURANCE,
  DEFAULT_COST_RATE_IT, DEFAULT_COST_RATE_OTHER,
  MONTHS_PER_YEAR,
} from "@shared/constants";
import {
  TableShell,
  SectionHeader,
  SubtotalRow,
  LineItem,
  SpacerRow,
  MarginRow,
  MetricRow,
  ExpandableMetricRow,
  ExpandableLineItem,
  useCalcDetails,
  FormulaDetailStringRow,
} from "@/components/financial-table";
import { aggregatePropertyByYear } from "@/lib/financial/yearlyAggregator";
import { TableRow, TableCell } from "@/components/ui/table";
import {
  DAYS_PER_MONTH,
  DEFAULT_REV_SHARE_EVENTS,
  DEFAULT_REV_SHARE_FB,
  DEFAULT_REV_SHARE_OTHER,
  DEFAULT_CATERING_BOOST_PCT,
  DEFAULT_PROPERTY_INFLATION_RATE,
} from "@shared/constants";

interface Props {
  data: MonthlyFinancials[];
  years?: number;
  startYear?: number;
  property?: any;
  global?: any;
  allExpanded?: boolean;
}



export function YearlyIncomeStatement({ data, years = 5, startYear = 2026, property, global, allExpanded = false }: Props) {
  const yd = aggregatePropertyByYear(data, years);
  const columns = yd.map((y) => `${startYear + y.year}`);
  const colSpan = years + 1;

  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const toggle = (key: string) =>
    setExpandedRows((prev) => ({ ...prev, [key]: !prev[key] }));
  const isExpanded = (key: string) => allExpanded || !!expandedRows[key];

  const hasContext = property && global;

  let baseMonthlyTotalRev = 0;
  let fixedEscRate = 0;
  let costRates: Record<string, number> = {};
  let totalPropertyValue = 0;

  if (hasContext) {
    const revShareEvents = property.revShareEvents ?? DEFAULT_REV_SHARE_EVENTS;
    const revShareFB = property.revShareFB ?? DEFAULT_REV_SHARE_FB;
    const revShareOther = property.revShareOther ?? DEFAULT_REV_SHARE_OTHER;
    const cateringBoostPct = property.cateringBoostPercent ?? DEFAULT_CATERING_BOOST_PCT;
    const cateringBoostMultiplier = 1 + cateringBoostPct;

    const resolvedDaysPerMonth = global.daysPerMonth ?? DAYS_PER_MONTH;
    const baseMonthlyRoomRev = property.roomCount * resolvedDaysPerMonth * property.startAdr * property.startOccupancy;
    const baseMonthlyEventsRev = baseMonthlyRoomRev * revShareEvents;
    const baseMonthlyFBRev = baseMonthlyRoomRev * revShareFB * cateringBoostMultiplier;
    const baseMonthlyOtherRev = baseMonthlyRoomRev * revShareOther;
    baseMonthlyTotalRev = baseMonthlyRoomRev + baseMonthlyEventsRev + baseMonthlyFBRev + baseMonthlyOtherRev;

    totalPropertyValue = property.purchasePrice + (property.buildingImprovements ?? 0);
    fixedEscRate = global.fixedCostEscalationRate ?? property.inflationRate ?? global.inflationRate ?? DEFAULT_PROPERTY_INFLATION_RATE;
    costRates = {
      propertyOps: property.costRatePropertyOps ?? DEFAULT_COST_RATE_PROPERTY_OPS,
      utilities: property.costRateUtilities ?? DEFAULT_COST_RATE_UTILITIES,
      admin: property.costRateAdmin ?? DEFAULT_COST_RATE_ADMIN,
      taxes: property.costRateTaxes ?? DEFAULT_COST_RATE_TAXES,
      insurance: property.costRateInsurance ?? DEFAULT_COST_RATE_INSURANCE,
      it: property.costRateIT ?? DEFAULT_COST_RATE_IT,
      other: property.costRateOther ?? DEFAULT_COST_RATE_OTHER,
    };
  }

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const fmt = (n: number) => formatMoney(n);

  const getMonthlyFactors = (yearIndex: number): number[] => {
    if (!hasContext) return [];
    const opsStart = new Date(property.operationsStartDate);
    const modelStart = new Date(global.modelStartDate);
    const factors: number[] = [];
    for (let m = 0; m < 12; m++) {
      const monthOffset = yearIndex * MONTHS_PER_YEAR + m;
      const currentDate = new Date(modelStart);
      currentDate.setMonth(currentDate.getMonth() + monthOffset);
      const isOperational = currentDate >= opsStart;
      if (!isOperational) {
        factors.push(0);
        continue;
      }
      const monthsSinceOps = (currentDate.getFullYear() - opsStart.getFullYear()) * MONTHS_PER_YEAR + currentDate.getMonth() - opsStart.getMonth();
      const opsYear = Math.floor(monthsSinceOps / MONTHS_PER_YEAR);
      const safeFactor = Number.isFinite(fixedEscRate) ? Math.pow(1 + fixedEscRate, opsYear) : 1;
      factors.push(safeFactor);
    }
    return factors;
  };

  const fixedCostFormulaRows = (rateKey: string, yearlyValues: number[], isUtilities?: boolean) => {
    if (!hasContext) return null;
    const rate = costRates[rateKey];
    const utilitiesVariableSplit = global.utilitiesVariableSplit ?? 0.60;
    const effectiveRate = isUtilities ? rate * (1 - utilitiesVariableSplit) : rate;
    return (
      <>
        <FormulaDetailStringRow
          label={`Base Mo. Revenue`}
          values={yd.map(() => fmt(baseMonthlyTotalRev))}
        />
        <FormulaDetailStringRow
          label={isUtilities ? `Fixed portion rate (${pct(rate)} × ${pct(1 - utilitiesVariableSplit)} = ${pct(effectiveRate)})` : `Rate: ${pct(rate)}`}
          values={yd.map(() => `${fmt(baseMonthlyTotalRev * effectiveRate)}/mo base`)}
        />
        <FormulaDetailStringRow
          label="Monthly base × escalation factor, summed over 12 months"
          values={yd.map((y) => {
            const factors = getMonthlyFactors(y.year);
            const operatingMonths = factors.filter(f => f > 0).length;
            const uniqueFactors = Array.from(new Set(factors.filter(f => f > 0)));
            if (uniqueFactors.length === 1) {
              return `×${uniqueFactors[0].toFixed(4)} × ${operatingMonths} mo`;
            }
            return uniqueFactors.map(f => `×${f.toFixed(4)}`).join(", ") + ` (${operatingMonths} mo)`;
          })}
        />
        <FormulaDetailStringRow
          label="= Annual total (sum of monthly amounts)"
          values={yd.map((_, i) => fmt(yearlyValues[i]))}
        />
      </>
    );
  };

  return (
    <TableShell title="Income Statement" columns={columns} stickyLabel="Income Statement">
      {/* ── Revenue ── */}
      <SectionHeader label="Revenue" colSpan={colSpan} />

      <MetricRow
        label="Total Rooms Available"
        tooltip="Total room-nights available for the year. This is the theoretical maximum supply of room-nights your property can sell."
        formula="Room Count × 30.5 days × 12 months"
        values={yd.map((y) => y.availableRooms.toLocaleString())}
      />

      <ExpandableMetricRow
        label="ADR (Rate)"
        tooltip="Average Daily Rate — the published end-of-year room rate after annual ADR growth is applied. This is the 'clean' rate, not blended across rate changes."
        values={yd.map((y) =>
          y.cleanAdr > 0 ? `$${y.cleanAdr.toFixed(2)}` : "-"
        )}
        expanded={isExpanded("adrRate")}
        onToggle={() => toggle("adrRate")}
      >
        <FormulaDetailStringRow
          label="Starting ADR × (1 + growth rate)^year"
          values={yd.map((y) =>
            y.cleanAdr > 0 ? `$${property?.startAdr?.toFixed(2) ?? "?"} × (1+${pct(property?.adrGrowthRate ?? 0)})^${y.year}` : "-"
          )}
        />
      </ExpandableMetricRow>

      <ExpandableMetricRow
        label="ADR (Effective)"
        tooltip="Effective ADR — the actual blended average rate earned. Calculated as Room Revenue ÷ Sold Rooms. Differs from the Rate ADR when rates change mid-year."
        values={yd.map((y) =>
          y.soldRooms > 0 ? `$${(y.revenueRooms / y.soldRooms).toFixed(2)}` : "-"
        )}
        expanded={isExpanded("adrEffective")}
        onToggle={() => toggle("adrEffective")}
      >
        <FormulaDetailStringRow
          label="Room Revenue ÷ Sold Rooms"
          values={yd.map((y) =>
            y.soldRooms > 0 ? `${fmt(y.revenueRooms)} ÷ ${y.soldRooms.toLocaleString()}` : "-"
          )}
        />
      </ExpandableMetricRow>

      <ExpandableMetricRow
        label="Occupancy"
        tooltip="Occupancy Rate — percentage of available rooms that were sold. Calculated as Sold Rooms ÷ Available Rooms × 100."
        values={yd.map((y) =>
          y.availableRooms > 0
            ? `${((y.soldRooms / y.availableRooms) * 100).toFixed(1)}%`
            : "0%"
        )}
        expanded={isExpanded("occupancy")}
        onToggle={() => toggle("occupancy")}
      >
        <FormulaDetailStringRow
          label="Sold Rooms"
          values={yd.map((y) => y.soldRooms.toLocaleString())}
        />
        <FormulaDetailStringRow
          label="Available Rooms"
          values={yd.map((y) => y.availableRooms.toLocaleString())}
        />
      </ExpandableMetricRow>

      <ExpandableMetricRow
        label="RevPAR"
        tooltip="Revenue Per Available Room — measures how well rooms generate revenue, including unsold nights. Calculated as Room Revenue ÷ Available Rooms (or ADR × Occupancy)."
        values={yd.map((y) =>
          y.availableRooms > 0 ? `$${(y.revenueRooms / y.availableRooms).toFixed(2)}` : "-"
        )}
        expanded={isExpanded("revpar")}
        onToggle={() => toggle("revpar")}
      >
        <FormulaDetailStringRow
          label="Room Revenue ÷ Available Rooms"
          values={yd.map((y) =>
            y.availableRooms > 0 ? `${fmt(y.revenueRooms)} ÷ ${y.availableRooms.toLocaleString()}` : "-"
          )}
        />
        <FormulaDetailStringRow
          label="Cross-check: ADR × Occupancy"
          values={yd.map((y) => {
            if (y.availableRooms === 0) return "-";
            const effAdr = y.soldRooms > 0 ? y.revenueRooms / y.soldRooms : 0;
            const occ = y.soldRooms / y.availableRooms;
            return `$${effAdr.toFixed(2)} × ${(occ * 100).toFixed(1)}% = $${(effAdr * occ).toFixed(2)}`;
          })}
        />
      </ExpandableMetricRow>

      <LineItem label="Room Revenue"        values={yd.map((y) => y.revenueRooms)} tooltip="Income from guest room bookings — the primary revenue driver for any hotel. Grows with both ADR increases and occupancy ramp-up." formula="Rooms × Days × ADR × Occupancy" />
      <LineItem label="Food & Beverage"     values={yd.map((y) => y.revenueFB)} tooltip="Income from restaurants, bars, room service, minibar, and catering operations. Expressed as a percentage of Room Revenue, then boosted by the catering uplift factor for properties with significant banquet business." formula="Room Revenue × F&B Share × (1 + Catering Boost)" />
      <LineItem label="Events & Functions"   values={yd.map((y) => y.revenueEvents)} tooltip="Income from conferences, weddings, corporate events, and banquet bookings. Driven by the property's event facilities and local demand." formula="Room Revenue × Events Share" />
      <LineItem label="Other Revenue"        values={yd.map((y) => y.revenueOther)} tooltip="Ancillary income from spa services, parking, resort fees, retail shops, and other guest amenities." formula="Room Revenue × Other Share" />
      <SubtotalRow label="Total Revenue"     values={yd.map((y) => y.revenueTotal)} positive tooltip="All revenue streams combined — rooms, food & beverage, events, and other income. This is the top line against which expense ratios are measured." />

      <SpacerRow colSpan={colSpan} />

      {/* ── Departmental Expenses ── */}
      <SectionHeader label="Departmental Expenses" colSpan={colSpan} />

      <LineItem label="Housekeeping"             values={yd.map((y) => y.expenseRooms)} tooltip="USALI Rooms Department — variable cost covering cleaning labor, linens, guest supplies, and amenities. Directly proportional to room revenue: when occupancy rises, so does this cost." formula="Room Revenue × Housekeeping Rate" />
      <LineItem label="Food & Beverage"          values={yd.map((y) => y.expenseFB)} tooltip="USALI F&B Department — variable cost covering kitchen labor, food procurement, and beverage costs. Scales with F&B revenue volume." formula="F&B Revenue × F&B Expense Rate" />
      <LineItem label="Events & Functions"        values={yd.map((y) => y.expenseEvents)} tooltip="Variable cost for event setup, staffing, and AV equipment. Scales with events revenue." formula="Events Revenue × Event Expense Rate" />
      <LineItem label="Other Departments"         values={yd.map((y) => y.expenseOther)} tooltip="Variable costs for ancillary departments (spa, parking, retail). Scales with other revenue." formula="Other Revenue × Other Dept Rate" />
      <SubtotalRow label="Total Departmental Expenses" values={yd.map((y) => y.expenseRooms + y.expenseFB + y.expenseEvents + y.expenseOther)} tooltip="Direct costs tied to revenue-producing departments: Rooms, F&B, Events, and Other." />
      <MarginRow label="% of Total Revenue" values={yd.map((y) => y.expenseRooms + y.expenseFB + y.expenseEvents + y.expenseOther)} baseValues={yd.map((y) => y.revenueTotal)} />

      <SpacerRow colSpan={colSpan} />

      {/* ── Undistributed Operating Expenses ── */}
      <SectionHeader label="Undistributed Operating Expenses" colSpan={colSpan} />

      <LineItem label="Sales & Marketing"         values={yd.map((y) => y.expenseMarketing)} tooltip="Variable cost for advertising, OTA commissions, loyalty programs, and local promotions. Scales with total revenue." formula="Total Revenue × Marketing Rate" />

      {hasContext ? (
        <>
          <ExpandableLineItem
            label="Property Operations"
            tooltip={`USALI fixed cost: ${pct(costRates.propertyOps)} of Year 1 base revenue (${fmt(baseMonthlyTotalRev)}/mo), escalating ${pct(fixedEscRate)}/yr. NOT a percentage of current revenue.`}
            values={yd.map((y) => y.expensePropertyOps)}
            expanded={isExpanded("propertyOps")}
            onToggle={() => toggle("propertyOps")}
          >
            {fixedCostFormulaRows("propertyOps", yd.map((y) => y.expensePropertyOps))}
          </ExpandableLineItem>

          <ExpandableLineItem
            label="Administrative & General"
            tooltip={`USALI fixed cost: ${pct(costRates.admin)} of Year 1 base revenue (${fmt(baseMonthlyTotalRev)}/mo), escalating ${pct(fixedEscRate)}/yr. NOT a percentage of current revenue.`}
            values={yd.map((y) => y.expenseAdmin)}
            expanded={isExpanded("admin")}
            onToggle={() => toggle("admin")}
          >
            {fixedCostFormulaRows("admin", yd.map((y) => y.expenseAdmin))}
          </ExpandableLineItem>

          <ExpandableLineItem
            label="IT & Technology"
            tooltip={`USALI fixed cost: ${pct(costRates.it)} of Year 1 base revenue (${fmt(baseMonthlyTotalRev)}/mo), escalating ${pct(fixedEscRate)}/yr.`}
            values={yd.map((y) => y.expenseIT)}
            expanded={isExpanded("it")}
            onToggle={() => toggle("it")}
          >
            {fixedCostFormulaRows("it", yd.map((y) => y.expenseIT))}
          </ExpandableLineItem>

          <ExpandableLineItem
            label="Insurance"
            tooltip={`Property insurance: ${pct(costRates.insurance)} of property value, escalating ${pct(fixedEscRate)}/yr. Based on Purchase Price + Building Improvements.`}
            values={yd.map((y) => y.expenseInsurance)}
            expanded={isExpanded("insurance")}
            onToggle={() => toggle("insurance")}
          >
            {fixedCostFormulaRows("insurance", yd.map((y) => y.expenseInsurance))}
          </ExpandableLineItem>

          <ExpandableLineItem
            label="Utilities"
            tooltip={`Split into variable (${pct(global.utilitiesVariableSplit ?? 0.60)} of rate, scales with revenue) and fixed (${pct(1 - (global.utilitiesVariableSplit ?? 0.60))} of rate, anchored to Year 1 base revenue). Total rate: ${pct(costRates.utilities)}.`}
            values={yd.map((y) => y.expenseUtilities)}
            expanded={isExpanded("utilities")}
            onToggle={() => toggle("utilities")}
          >
            <FormulaDetailStringRow
              label="Variable portion (scales with revenue)"
              values={yd.map((y) => fmt(y.expenseUtilitiesVar))}
            />
            <FormulaDetailStringRow
              label="Fixed portion (anchored to Year 1 base)"
              values={yd.map((y) => fmt(y.expenseUtilitiesFixed))}
            />
            {fixedCostFormulaRows("utilities", yd.map((y) => y.expenseUtilitiesFixed), true)}
          </ExpandableLineItem>

          <ExpandableLineItem
            label="Other Costs"
            tooltip={`USALI fixed cost: ${pct(costRates.other)} of Year 1 base revenue (${fmt(baseMonthlyTotalRev)}/mo), escalating ${pct(fixedEscRate)}/yr.`}
            values={yd.map((y) => y.expenseOtherCosts)}
            expanded={isExpanded("otherCosts")}
            onToggle={() => toggle("otherCosts")}
          >
            {fixedCostFormulaRows("other", yd.map((y) => y.expenseOtherCosts))}
          </ExpandableLineItem>
        </>
      ) : (
        <>
          <LineItem label="Property Operations"       values={yd.map((y) => y.expensePropertyOps)} tooltip="Fixed cost per USALI: Year 1 base revenue × rate, escalating annually. Not a percentage of current-year revenue." />
          <LineItem label="Administrative & General"  values={yd.map((y) => y.expenseAdmin)} tooltip="Fixed cost per USALI: anchored to Year 1 base revenue." />
          <LineItem label="IT & Technology"           values={yd.map((y) => y.expenseIT)} tooltip="Fixed cost per USALI: anchored to Year 1 base revenue." />
          <LineItem label="Insurance"                 values={yd.map((y) => y.expenseInsurance)} tooltip="Property insurance: based on property value, escalating annually." />
          <LineItem label="Utilities"                 values={yd.map((y) => y.expenseUtilities)} tooltip="Split into variable (scales with revenue) and fixed (anchored to Year 1 base revenue)." />
          <LineItem label="Other Costs"               values={yd.map((y) => y.expenseOtherCosts)} tooltip="Fixed cost per USALI: anchored to Year 1 base revenue." />
        </>
      )}

      <SubtotalRow label="Total Undistributed Expenses" values={yd.map((y) => {
        const deptExp = y.expenseRooms + y.expenseFB + y.expenseEvents + y.expenseOther;
        return y.revenueTotal - y.gop - deptExp;
      })} tooltip="Overhead expenses not directly tied to a specific revenue department: Marketing, Property Operations, Admin, IT, Insurance, Utilities, and Other." />
      <MarginRow label="% of Total Revenue" values={yd.map((y) => {
        const deptExp = y.expenseRooms + y.expenseFB + y.expenseEvents + y.expenseOther;
        return y.revenueTotal - y.gop - deptExp;
      })} baseValues={yd.map((y) => y.revenueTotal)} />

      <SpacerRow colSpan={colSpan} />

      {/* ── Profitability ── */}
      <SubtotalRow label="Gross Operating Profit (GOP)" values={yd.map((y) => y.gop)} positive tooltip="The property's core operating profitability — revenue after all departmental and overhead costs. This is the key metric for comparing operational efficiency across properties, regardless of ownership structure or financing." formula="Total Revenue − Dept Expenses − Undistributed Expenses" />
      {isExpanded("gopFormula") ? (
        <>
          <FormulaDetailStringRow
            label="= Total Revenue − Total Operating Expenses"
            values={yd.map((y) => `${fmt(y.revenueTotal)} − ${fmt(y.revenueTotal - y.gop)}`)}
          />
          <FormulaDetailStringRow
            label="= GOP"
            values={yd.map((y) => fmt(y.gop))}
          />
        </>
      ) : (
        <TableRow className="bg-primary/5 cursor-pointer hover:bg-primary/10" onClick={() => toggle("gopFormula")} data-expandable-row="true">
          <TableCell className="pl-12 sticky left-0 bg-primary/5 py-0.5 text-xs text-muted-foreground italic">Formula</TableCell>
          {yd.map((_, i) => <TableCell key={i} className="py-0.5" />)}
        </TableRow>
      )}
      <MarginRow label="GOP Margin" values={yd.map((y) => y.gop)} baseValues={yd.map((y) => y.revenueTotal)} />

      <SpacerRow colSpan={colSpan} />

      {/* ── Management Fees ── */}
      <SectionHeader label="Management Fees" colSpan={colSpan} />

      <LineItem label="Base Management Fee"       values={yd.map((y) => y.feeBase)} tooltip="Fixed percentage of total revenue paid to the management company for day-to-day hotel operations. This is the guaranteed fee — paid regardless of profitability." formula="Total Revenue × Base Fee Rate" />
      {(() => {
        const catSet = new Set<string>();
        for (const y of yd) for (const k of Object.keys(y.serviceFeesByCategory ?? {})) catSet.add(k);
        const cats = Array.from(catSet);
        return cats.length > 0 ? cats.map(cat => (
          <LineItem key={cat} label={`  ${cat}`} values={yd.map((y) => y.serviceFeesByCategory[cat] ?? 0)} indent />
        )) : null;
      })()}
      <LineItem label="Incentive Management Fee"  values={yd.map((y) => y.feeIncentive)} tooltip="Performance bonus paid to the management company when the property is profitable. Only kicks in when Gross Operating Profit is positive — aligns the operator's incentives with owner returns." formula="max(0, GOP × Incentive Rate)" />

      <SpacerRow colSpan={colSpan} />

      {/* ── AGOP ── */}
      <SubtotalRow label="Adjusted GOP (AGOP)" values={yd.map((y) => y.agop)} positive tooltip="Gross Operating Profit after deducting management fees. AGOP represents the property's operating income available to cover fixed charges, reserves, and debt service." formula="GOP − Base Fee − Incentive Fee" />
      {isExpanded("agopFormula") ? (
        <>
          <FormulaDetailStringRow
            label="= GOP − Base Fee − Incentive Fee"
            values={yd.map((y) => `${fmt(y.gop)} − ${fmt(y.feeBase)} − ${fmt(y.feeIncentive)}`)}
          />
          <FormulaDetailStringRow
            label="= AGOP"
            values={yd.map((y) => fmt(y.agop))}
          />
        </>
      ) : (
        <TableRow className="bg-primary/5 cursor-pointer hover:bg-primary/10" onClick={() => toggle("agopFormula")} data-expandable-row="true">
          <TableCell className="pl-12 sticky left-0 bg-primary/5 py-0.5 text-xs text-muted-foreground italic">Formula</TableCell>
          {yd.map((_, i) => <TableCell key={i} className="py-0.5" />)}
        </TableRow>
      )}
      <MarginRow label="AGOP Margin" values={yd.map((y) => y.agop)} baseValues={yd.map((y) => y.revenueTotal)} />

      <SpacerRow colSpan={colSpan} />

      {/* ── Fixed Charges ── */}
      <SectionHeader label="Fixed Charges" colSpan={colSpan} />

      {hasContext ? (
        <>
          <ExpandableLineItem
            label="Property Taxes"
            tooltip={`Based on property value: ${pct(costRates.taxes)} of ${fmt(totalPropertyValue)} (${fmt(totalPropertyValue / MONTHS_PER_YEAR)}/mo), escalating ${pct(fixedEscRate)}/yr.`}
            values={yd.map((y) => y.expenseTaxes)}
            expanded={isExpanded("taxes")}
            onToggle={() => toggle("taxes")}
          >
            {hasContext && (
              <>
                <FormulaDetailStringRow
                  label={`Property Value (Purchase + Improvements)`}
                  values={yd.map(() => fmt(totalPropertyValue))}
                />
                <FormulaDetailStringRow
                  label={`Monthly base: ${fmt(totalPropertyValue)} ÷ 12 × ${pct(costRates.taxes)}`}
                  values={yd.map(() => `${fmt(totalPropertyValue / MONTHS_PER_YEAR * costRates.taxes)}/mo base`)}
                />
                <FormulaDetailStringRow
                  label="Monthly base × escalation factor, summed over 12 months"
                  values={yd.map((y) => {
                    const factors = getMonthlyFactors(y.year);
                    const operatingMonths = factors.filter(f => f > 0).length;
                    const uniqueFactors = Array.from(new Set(factors.filter(f => f > 0)));
                    if (uniqueFactors.length === 1) {
                      return `×${uniqueFactors[0].toFixed(4)} × ${operatingMonths} mo`;
                    }
                    return uniqueFactors.map(f => `×${f.toFixed(4)}`).join(", ") + ` (${operatingMonths} mo)`;
                  })}
                />
                <FormulaDetailStringRow
                  label="= Annual total (sum of monthly amounts)"
                  values={yd.map((_, i) => fmt(yd[i].expenseTaxes))}
                />
              </>
            )}
          </ExpandableLineItem>
        </>
      ) : (
        <>
          <LineItem label="Property Taxes"   values={yd.map((y) => y.expenseTaxes)} tooltip="Based on property value (Purchase Price + Building Improvements), adjusted annually by inflation." />
        </>
      )}

      <SpacerRow colSpan={colSpan} />

      <SubtotalRow label="Net Operating Income (NOI)" values={yd.map((y) => y.noi)} positive tooltip="AGOP minus fixed charges (property taxes). NOI measures the property's income from operations before reserves and debt service. Used directly in cap rate valuation (Property Value = NOI / Cap Rate)." formula="AGOP − Property Taxes" />
      {isExpanded("noiFormula") ? (
        <>
          <FormulaDetailStringRow
            label="= AGOP − Property Taxes"
            values={yd.map((y) => `${fmt(y.agop)} − ${fmt(y.expenseTaxes)}`)}
          />
          <FormulaDetailStringRow
            label="= NOI"
            values={yd.map((y) => fmt(y.noi))}
          />
        </>
      ) : (
        <TableRow className="bg-primary/5 cursor-pointer hover:bg-primary/10" onClick={() => toggle("noiFormula")} data-expandable-row="true">
          <TableCell className="pl-12 sticky left-0 bg-primary/5 py-0.5 text-xs text-muted-foreground italic">Formula</TableCell>
          {yd.map((_, i) => <TableCell key={i} className="py-0.5" />)}
        </TableRow>
      )}
      <MarginRow label="NOI Margin" values={yd.map((y) => y.noi)} baseValues={yd.map((y) => y.revenueTotal)} />

      <SpacerRow colSpan={colSpan} />

      {/* ── FF&E Reserve ── */}
      <SectionHeader label="FF&E Reserve" colSpan={colSpan} />

      <LineItem label="FF&E Reserve"              values={yd.map((y) => y.expenseFFE)} tooltip="Annual set-aside for replacing Furniture, Fixtures & Equipment (carpets, HVAC, case goods, soft goods). Required by most hotel lenders (typically 3-5% of revenue). This is a reserve, not an actual expense — actual replacements are capitalized and depreciated." formula="Total Revenue × FF&E Rate" />

      <SpacerRow colSpan={colSpan} />

      <SubtotalRow label="Adjusted NOI (ANOI)" values={yd.map((y) => y.anoi)} positive tooltip="NOI after deducting the FF&E reserve. This is what's available to service debt, pay income taxes, and generate investor returns. ANOI is the starting point for cash-on-cash return calculations." formula="NOI − FF&E Reserve" />
      {isExpanded("anoiFormula") ? (
        <>
          <FormulaDetailStringRow
            label="= NOI − FF&E Reserve"
            values={yd.map((y) => `${fmt(y.noi)} − ${fmt(y.expenseFFE)}`)}
          />
          <FormulaDetailStringRow
            label="= ANOI"
            values={yd.map((y) => fmt(y.anoi))}
          />
        </>
      ) : (
        <TableRow className="bg-primary/5 cursor-pointer hover:bg-primary/10" onClick={() => toggle("anoiFormula")} data-expandable-row="true">
          <TableCell className="pl-12 sticky left-0 bg-primary/5 py-0.5 text-xs text-muted-foreground italic">Formula</TableCell>
          {yd.map((_, i) => <TableCell key={i} className="py-0.5" />)}
        </TableRow>
      )}
      <MarginRow label="ANOI Margin" values={yd.map((y) => y.anoi)} baseValues={yd.map((y) => y.revenueTotal)} />

      <SpacerRow colSpan={colSpan} />

      {/* ── Debt Service ── */}
      <SectionHeader label="Debt Service" colSpan={colSpan} />

      <LineItem label="Interest Expense"  values={yd.map((y) => y.interestExpense)} tooltip="The interest portion of monthly mortgage payments. Only appears for financed properties — cash purchases show $0. Interest expense is tax-deductible, reducing taxable income." formula="Loan Balance × Monthly Rate" />
      <LineItem label="Principal Payment"  values={yd.map((y) => y.principalPayment ?? 0)} tooltip="The principal repayment portion of monthly mortgage payments. Reduces outstanding loan balance but is not an expense on the income statement." formula="Monthly Payment − Interest Expense" />
      <MetricRow
        label="DSCR"
        tooltip="Debt Service Coverage Ratio — measures the property's ability to cover its debt obligations from NOI. A DSCR above 1.25 is typically required by lenders."
        values={yd.map((y) => {
          const totalDebtService = y.interestExpense + (y.principalPayment ?? 0);
          if (totalDebtService <= 0) return "N/A";
          return `${(y.anoi / totalDebtService).toFixed(2)}x`;
        })}
      />

      <SpacerRow colSpan={colSpan} />

      {/* ── Net Income ── */}
      <SectionHeader label="Net Income" colSpan={colSpan} />

      <LineItem label="Depreciation"      values={yd.map((y) => y.depreciationExpense)} tooltip="Non-cash accounting expense that spreads the building's cost over its useful life. Reduces taxable income without reducing actual cash — a major tax advantage of real estate investing. Land is not depreciable." formula="(Building Value + Improvements) / 39 years / 12 months" />
      <LineItem label="Income Tax"        values={yd.map((y) => y.incomeTax)} tooltip="Federal/state income tax on the property's taxable income. Only applies when taxable income is positive — operating losses produce $0 tax. Negative taxable income (from depreciation) can shelter other income." formula="max(0, (ANOI − Interest − Depreciation) × Tax Rate)" />
      <LineItem label="Cash Flow"         values={yd.map((y) => y.anoi - y.interestExpense - (y.principalPayment ?? 0) - y.incomeTax)} tooltip="Actual cash remaining after all obligations: ANOI minus debt service minus income tax. This is the investor's true take-home." formula="ANOI − Debt Service − Income Tax" />

      <SpacerRow colSpan={colSpan} />

      {/* ── Bottom Line ── */}
      <SubtotalRow label="GAAP Net Income" values={yd.map((y) => y.netIncome)} positive tooltip="The accounting bottom line after all expenses, including non-cash depreciation. Note: Net Income differs from Cash Flow because depreciation reduces income on paper without using cash. Negative net income in early years is common and often intentional (depreciation shelters taxable income)." formula="ANOI − Interest − Depreciation − Income Tax" />
      <MarginRow label="% of Total Revenue" values={yd.map((y) => y.netIncome)} baseValues={yd.map((y) => y.revenueTotal)} />
    </TableShell>
  );
}
