/**
 * CompanyHeader.tsx — Summary banner for the Management Company page.
 *
 * Displays the management company's name, logo, and top-line KPIs:
 *   • Total Revenue (sum of base + incentive management fees across all properties)
 *   • EBITDA (Earnings Before Interest, Taxes, Depreciation & Amortization)
 *   • Cash Balance (current cumulative cash position)
 *   • A small sparkline chart showing Revenue and EBITDA by year
 *
 * Also provides a "Settings" link to the Company Assumptions editor
 * so users can jump directly to adjusting overhead, staffing, or fee rates.
 */
import React from "react";
import { Link } from "wouter";
import { CurrentThemeTab } from "@/components/ui/tabs";
import { IconSettings, IconIncomeStatement, IconCashFlow, IconBalanceSheet, IconInvestment } from "@/components/icons";import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { FinancialChart } from "@/components/ui/financial-chart";
import { KPIGrid, InsightPanel, ScrollReveal, formatCompact } from "@/components/graphics";
import { formatMoney } from "@/lib/financialEngine";
import type { CompanyHeaderProps } from "./types";

export default function CompanyHeader({
  global,
  properties,
  yearlyChartData,
  cashAnalysis,
  projectionYears,
  activeTab,
  setActiveTab,
  chartRef,
  exportMenuNode,
  isAdmin,
}: CompanyHeaderProps) {
  const assumptionsButton = isAdmin ? (
    <Link href="/company/assumptions" className="text-inherit no-underline">
      <Button variant="outline">
        <IconSettings className="w-4 h-4" />
        Assumptions
      </Button>
    </Link>
  ) : (
    <Link href="/company/guidance" className="text-inherit no-underline">
      <Button variant="outline">
        <IconSettings className="w-4 h-4" />
        View AI Guidance
      </Button>
    </Link>
  );

  return (
    <>
      <PageHeader
        title={`${global?.companyName || "Hospitality Management"} Company`}
        subtitle="Corporate Management Entity & Operations"
        actions={assumptionsButton}
      />

      <KPIGrid
        className="mt-4"
        data-testid="kpi-company-hero"
        items={[
          { label: "Total Revenue", value: yearlyChartData[0]?.Revenue ?? 0, format: formatCompact, sublabel: "Year 1" },
          { label: "Net Income", value: yearlyChartData[0]?.NetIncome ?? 0, format: formatCompact, trend: (yearlyChartData[0]?.NetIncome ?? 0) > 0 ? "up" as const : "down" as const },
          { label: "Total Expenses", value: yearlyChartData[0]?.Expenses ?? 0, format: formatCompact },
          { label: "Properties Managed", value: properties?.length ?? 0, sublabel: "Active portfolio" },
        ]}
        columns={4}
        variant="glass"
      />

      <div className="mt-4 mb-6">
        <CurrentThemeTab
          tabs={[
            { value: 'income', label: 'Income Statement', icon: IconIncomeStatement },
            { value: 'cashflow', label: 'Cash Flows', icon: IconCashFlow },
            { value: 'balance', label: 'Balance Sheet', icon: IconBalanceSheet },
            { value: 'investment', label: 'Financial Analysis', icon: IconInvestment }
          ]}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          rightContent={exportMenuNode}
        />
      </div>

      <FinancialChart
        data={yearlyChartData as unknown as Record<string, unknown>[]}
        series={["revenue", "expenses", "operatingIncome", "netIncome"]}
        title={`Management Company Performance (${projectionYears}-Year Projection)`}
        chartRef={chartRef}
        id="company"
      />

      <ScrollReveal>
        <InsightPanel
          data-testid="insight-company"
          title="Company Cash Analysis"
          variant="compact"
          insights={[
            { text: "Cash position", metric: cashAnalysis.isAdequate ? "Adequate" : "Needs attention", type: cashAnalysis.isAdequate ? "positive" as const : "warning" as const },
            ...(cashAnalysis.shortfall > 0 ? [{ text: "Cash shortfall detected", metric: formatMoney(cashAnalysis.shortfall), type: "negative" as const }] : []),
            { text: "Total company funding", metric: formatMoney(cashAnalysis.totalFunding), type: "neutral" as const },
          ]}
        />
      </ScrollReveal>
    </>
  );
}
