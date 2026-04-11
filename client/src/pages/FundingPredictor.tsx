import { useState, useMemo } from "react";
import Layout from "@/components/Layout";
import { PageHeader } from "@/components/ui/page-header";
import { CurrentThemeTab } from "@/components/ui/tabs";
import { AnimatedPage } from "@/components/graphics";
import { IconTarget, IconAlertTriangle } from "@/components/icons";
import { useProperties, useGlobalAssumptions } from "@/lib/api";
import { useServiceTemplates } from "@/lib/api/services";
import { useMarketRates } from "@/lib/api/market-rates";
import { generateCompanyProForma } from "@/lib/financialEngine";
import { useServerCompanyFinancials } from "@/hooks/useServerFinancials";
import { USE_SERVER_COMPUTE } from "@shared/constants";
import { analyzeFundingNeeds } from "@/lib/financial/funding-predictor";
import { PROJECTION_YEARS } from "@/lib/constants";
import { Loader2 } from "@/components/icons/themed-icons";
import { useLocation } from "wouter";
import { RecommendedTab, CurrentPlanTab, ResearchTab } from "@/components/funding";

const FUNDING_TABS = [
  { value: "recommended", label: "Capital Strategy", icon: IconTarget },
];

export default function FundingPredictor({ embedded }: { embedded?: boolean }) {
  const [activeTab, setActiveTab] = useState("recommended");
  const [, navigate] = useLocation();
  const { data: properties, isLoading: propsLoading } = useProperties();
  const { data: global, isLoading: globalLoading } = useGlobalAssumptions();
  const { data: serviceTemplates } = useServiceTemplates();
  const { data: marketRates } = useMarketRates();

  const projectionYears = global?.projectionYears ?? PROJECTION_YEARS;
  const projectionMonths = projectionYears * 12;

  const serverCompany = useServerCompanyFinancials(
    USE_SERVER_COMPUTE ? properties : undefined,
    USE_SERVER_COMPUTE ? global : undefined,
  );

  const clientFinancials = useMemo(() => {
    if (USE_SERVER_COMPUTE) return [];
    if (!properties?.length || !global) return [];
    const templates = serviceTemplates?.map(t => ({
      ...t,
      serviceModel: t.serviceModel as 'centralized' | 'direct',
    }));
    const activeProps = properties.filter(p => p.isActive !== false);
    return generateCompanyProForma(activeProps, global, projectionMonths, templates);
  }, [properties, global, projectionMonths, serviceTemplates]);

  const financials = USE_SERVER_COMPUTE ? serverCompany.companyMonthly : clientFinancials;

  const analysis = useMemo(() => {
    if (!financials.length || !global) return null;
    return analyzeFundingNeeds(financials, global, marketRates ?? undefined);
  }, [financials, global, marketRates]);

  if (propsLoading || globalLoading || serverCompany.isLoading) {
    return (
      <div className="flex items-center justify-center h-[40vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!analysis || !global) {
    return (
      <div className="flex flex-col items-center justify-center h-[40vh] gap-3">
        <IconAlertTriangle className="w-8 h-8 text-destructive" />
        <p className="text-muted-foreground">Unable to generate funding analysis. Ensure properties and assumptions are configured.</p>
      </div>
    );
  }

  const fundingLabel = global.fundingSourceLabel ?? "Funding Vehicle";

  const chartData = analysis.cashRunway
    .filter((_, i) => i % 3 === 0 || i === analysis.cashRunway.length - 1)
    .map(p => ({
      month: p.month,
      withFunding: Math.round(p.cashWithFunding),
      withoutFunding: Math.round(p.cashWithoutFunding),
    }));

  const gapType = analysis.fundingGap > 0 ? "negative" : analysis.fundingGap < 0 ? "positive" : "neutral";

  const Wrapper = embedded
    ? ({ children }: { children: React.ReactNode }) => <>{children}</>
    : Layout;

  return (
    <Wrapper>
      <AnimatedPage>
        <div className="space-y-6 p-4 md:p-6">
          {!embedded && (
            <PageHeader
              title="Capital Raise — Management Company"
              subtitle={`${fundingLabel} strategy and projections for the hospitality management company${global.companyName ? ` (${global.companyName})` : ''}`}
            />
          )}

          <CurrentThemeTab
            tabs={FUNDING_TABS.map(t => ({ ...t }))}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />

          {activeTab === "recommended" && (
            <RecommendedTab
              analysis={analysis}
              fundingLabel={fundingLabel}
              chartData={chartData}
              gapType={gapType}
              projectionYears={projectionYears}
              global={global}
              marketRates={marketRates}
            />
          )}

          {activeTab === "current" && (
            <CurrentPlanTab
              analysis={analysis}
              fundingLabel={fundingLabel}
              global={global}
              chartData={chartData}
              navigate={navigate}
            />
          )}

          {activeTab === "research" && (
            <ResearchTab
              analysis={analysis}
              fundingLabel={fundingLabel}
              marketRates={marketRates}
              global={global}
              navigate={navigate}
            />
          )}
        </div>
      </AnimatedPage>
    </Wrapper>
  );
}
