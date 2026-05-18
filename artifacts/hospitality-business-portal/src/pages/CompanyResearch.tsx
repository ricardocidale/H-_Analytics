import { useState } from "react";
import { useExportSave } from "@/hooks/useExportSave";
import { AnimatedPage } from "@/components/graphics/AnimatedPage";
import Layout from "@/components/Layout";
import { PageLoadingState } from "@/components/ui/page-loading-state";
import { PageErrorState } from "@/components/ui/page-error-state";
import { Button } from "@/components/ui/button";
import { useMarketResearch, useGlobalAssumptions } from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { ExportToolbar } from "@/components/ui/export-toolbar";
import { Loader2 } from "@/components/icons/themed-icons";
import {
  IconRefreshCw, IconAlertTriangle, IconFileDown,
  IconDollarSign, IconPackage, IconBookOpen, IconTarget, IconUsers,
  IconTrendingUp, IconGlobe, IconBriefcase, IconMapPin,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  IconZap, IconLayers, IconPieChart, IconBed,
  IconHotel, IconBarChart2,
} from "@/components/icons";
import { useCompanyResearchStream } from "@/components/company-research";
import { ResearchFreshnessBadge } from "@/components/research/ResearchFreshnessBadge";
import { ResearchLoadingOverlay } from "@/components/research/ResearchLoadingOverlay";
import { ResearchCriteriaTab } from "@/components/research/ResearchCriteriaTab";
import { motion, AnimatePresence } from "framer-motion";
import MethodologyTransparencyPanel from "@/components/research/MethodologyTransparencyPanel";
import { downloadResearchPDF } from "@/lib/exports/researchPdfExport";
import { useToast } from "@/hooks/use-toast";
import { RevenueFees, CostStructure, VendorIntelligence, CompetitivePosition } from "@/components/company-research/sections/OperationsSections";
import { GuestPersonas, CapitalInvestor, MarketSizing, RegionalOpportunities } from "@/components/company-research/sections/MarketingSections";
import { HospitalityOverview, SupplyDemand, EconomicClimate, TrendsInnovation } from "@/components/company-research/sections/IndustrySections";
import { CollapsibleSection } from "@/components/ui/collapsible-section";

type GroupKey = "operations" | "marketing" | "industry";

const GROUPS: { key: GroupKey; label: string; icon: typeof IconDollarSign }[] = [
  { key: "operations", label: "Operations", icon: IconBriefcase },
  { key: "marketing", label: "Marketing", icon: IconTarget },
  { key: "industry", label: "Industry", icon: IconGlobe },
];

const SUB_TABS: Record<GroupKey, { value: string; label: string; icon: typeof IconDollarSign }[]> = {
  operations: [
    { value: "revenue-fees", label: "Revenue & Fees", icon: IconDollarSign },
    { value: "cost-structure", label: "Cost Structure", icon: IconLayers },
    { value: "vendor-intel", label: "Vendor Intelligence", icon: IconPackage },
    { value: "competitive", label: "Competitive Position", icon: IconTarget },
    { value: "criteria-ops", label: "Criteria & Sources", icon: IconBookOpen },
  ],
  marketing: [
    { value: "personas", label: "Guest Personas", icon: IconUsers },
    { value: "capital", label: "Capital & Investor", icon: IconBriefcase },
    { value: "market-sizing", label: "Market Sizing", icon: IconPieChart },
    { value: "regional", label: "Regional Opportunities", icon: IconMapPin },
    { value: "criteria-mkt", label: "Criteria & Sources", icon: IconBookOpen },
  ],
  industry: [
    { value: "hospitality", label: "Hospitality Overview", icon: IconHotel },
    { value: "supply-demand", label: "Supply & Demand", icon: IconBarChart2 },
    { value: "economic", label: "Economic Climate", icon: IconTrendingUp },
    { value: "trends", label: "Trends & Innovation", icon: IconZap },
    { value: "criteria-ind", label: "Criteria & Sources", icon: IconBookOpen },
  ],
};

export default function CompanyResearch() {
  const { data: companyRes, isLoading: loadingCompany, isError: errorCompany } = useMarketResearch("company");
  const { data: globalRes, isLoading: loadingGlobal } = useMarketResearch("global");
  const { data: globalAssumptions } = useGlobalAssumptions();
  const [activeGroup, setActiveGroup] = useState<GroupKey>("operations");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { toast } = useToast();
  const { requestSave, SaveDialog } = useExportSave();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { isGenerating, streamedContent, generateResearch } = useCompanyResearchStream();

  type ResearchContentBag = {
    modelId?: string;
    sources?: { url?: string; label?: string; name?: string }[];
    starRating?: number;
    relaxationTrail?: string[];
    tierUsed?: number;
    rawResponse?: unknown;
    [key: string]: unknown;
  };
  const companyContent = (companyRes?.content ?? {}) as ResearchContentBag;
  const globalContent = (globalRes?.content ?? {}) as ResearchContentBag;
  const hasCompany = companyContent && !companyContent.rawResponse;
  const hasGlobal = globalContent && !globalContent.rawResponse;
  const companyName = globalAssumptions?.companyName || "Management Company";

  const isLoading = loadingCompany || loadingGlobal;

  if (isLoading) {
    return <PageLoadingState />;
  }
  if (errorCompany) {
    return <PageErrorState message="Failed to load company research" />;
  }

  function getSectionContent(value: string): React.ReactNode {
    switch (value) {
      case "revenue-fees":
        return <RevenueFees content={companyContent} hasData={hasCompany} onGenerate={generateResearch} />;
      case "cost-structure":
        return <CostStructure content={companyContent} hasData={hasCompany} onGenerate={generateResearch} />;
      case "vendor-intel":
        return <VendorIntelligence content={companyContent} hasData={hasCompany} onGenerate={generateResearch} />;
      case "competitive":
        return <CompetitivePosition content={companyContent} hasData={hasCompany} onGenerate={generateResearch} />;
      case "criteria-ops":
        return <ResearchCriteriaTab type="operations" />;
      case "personas":
        return <GuestPersonas hasData={hasGlobal} onGenerate={generateResearch} />;
      case "capital":
        return <CapitalInvestor hasData={hasGlobal} onGenerate={generateResearch} />;
      case "market-sizing":
        return <MarketSizing content={globalContent} hasData={hasGlobal} onGenerate={generateResearch} />;
      case "regional":
        return <RegionalOpportunities hasData={hasGlobal} onGenerate={generateResearch} />;
      case "criteria-mkt":
        return <ResearchCriteriaTab type="marketing" />;
      case "hospitality":
        return <HospitalityOverview content={globalContent} hasData={hasGlobal} onGenerate={generateResearch} />;
      case "supply-demand":
        return <SupplyDemand content={globalContent} hasData={hasGlobal} onGenerate={generateResearch} />;
      case "economic":
        return <EconomicClimate hasData={hasGlobal} onGenerate={generateResearch} />;
      case "trends":
        return <TrendsInnovation hasData={hasGlobal} onGenerate={generateResearch} />;
      case "criteria-ind":
        return <ResearchCriteriaTab type="industry" />;
      default:
        return null;
    }
  }

  return (
    <Layout>
      {SaveDialog}
      <AnimatedPage>
        <div className="space-y-6">
          <PageHeader
            title={`${companyName} Research`}
            subtitle="Operations, marketing intelligence, and industry analysis"
            variant="light"
            backLink="/company/assumptions"
            actions={
              <div className="flex items-center gap-3 flex-wrap">
                {companyRes?.updatedAt && (
                  <ResearchFreshnessBadge updatedAt={companyRes.updatedAt} />
                )}
                <Button
                  variant="default"
                  size="sm"
                  className="gap-2 h-9 text-xs font-medium shadow-lg shadow-primary/20 hover:scale-[1.03] active:scale-[0.97] transition-transform"
                  onClick={generateResearch}
                  disabled={isGenerating}
                  data-testid="button-regenerate-all"
                >
                  {isGenerating ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <IconRefreshCw className="w-4 h-4" />}
                  {isGenerating ? "Generating..." : "Regenerate All"}
                </Button>
                {hasCompany && !isGenerating && (
                  <ExportToolbar
                    variant="light"
                    actions={[
                      {
                        label: "Download PDF",
                        icon: <IconFileDown className="w-3.5 h-3.5" />,
                        onClick: () => requestSave(`${companyName} Research`, ".pdf", (f) => downloadResearchPDF({
                          type: "company", title: `${companyName} Research`,
                          subtitle: "Operations, marketing, and industry analysis",
                          content: companyContent, updatedAt: companyRes?.updatedAt,
                          llmModel: companyRes?.llmModel || undefined,
                        }, f)),
                        testId: "button-export-pdf",
                      },
                    ]}
                  />
                )}
              </div>
            }
          />

          {isGenerating && (
            <ResearchLoadingOverlay
              isVisible={isGenerating}
              variant="inline"
            />
          )}

          {!isGenerating && (
            <>
              <MethodologyTransparencyPanel
                entityType="company"
                entityName={companyName}
                research={{
                  updatedAt: companyRes?.updatedAt,
                  modelId: companyContent?.modelId,
                  sources: companyContent?.sources,
                  starRating: companyContent?.starRating,
                  relaxationTrail: companyContent?.relaxationTrail,
                  tierUsed: companyContent?.tierUsed,
                }}
              />
              <div className="flex items-center gap-1 bg-card/80 backdrop-blur-xl border border-border rounded-xl p-1.5 w-fit">
                {GROUPS.map(g => {
                  const active = activeGroup === g.key;
                  return (
                    <Button
                      key={g.key}
                      variant="ghost"
                      onClick={() => setActiveGroup(g.key)}
                      className={`relative flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200 h-auto ${active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
                      data-testid={`group-pill-${g.key}`}
                    >
                      {active && (
                        <motion.div
                          layoutId="active-group-pill"
                          className="absolute inset-0 bg-primary rounded-lg shadow-lg shadow-primary/25"
                          transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        />
                      )}
                      <span className="relative z-10 flex items-center gap-2">
                        <g.icon className="w-4 h-4" />
                        {g.label}
                      </span>
                    </Button>
                  );
                })}
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={activeGroup}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.25 }}
                >
                  <CollapsibleSection
                    defaultOpenId={SUB_TABS[activeGroup][0].value}
                    items={SUB_TABS[activeGroup].map((t) => ({
                      id: t.value,
                      summary: (
                        <span className="flex items-center gap-2">
                          <t.icon className="w-4 h-4 shrink-0" />
                          {t.label}
                        </span>
                      ),
                      expandedContent: getSectionContent(t.value),
                    }))}
                  />
                </motion.div>
              </AnimatePresence>
            </>
          )}
        </div>
      </AnimatedPage>
    </Layout>
  );
}
