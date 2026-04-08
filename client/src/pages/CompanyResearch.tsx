import { useState } from "react";
import { useExportSave } from "@/hooks/useExportSave";
import { AnimatedPage } from "@/components/graphics/AnimatedPage";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useMarketResearch, useGlobalAssumptions } from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { ExportToolbar } from "@/components/ui/export-toolbar";
import { Loader2 } from "@/components/icons/themed-icons";
import {
  IconRefreshCw, IconAlertTriangle, IconFileDown,
  IconDollarSign, IconPackage, IconBookOpen, IconTarget, IconUsers,
  IconTrendingUp, IconGlobe, IconBriefcase, IconMapPin,
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
  const { toast } = useToast();
  const { requestSave, SaveDialog } = useExportSave();
  const { isGenerating, streamedContent, generateResearch } = useCompanyResearchStream();

  const companyContent = (companyRes?.content ?? {}) as any;
  const globalContent = (globalRes?.content ?? {}) as any;
  const hasCompany = companyContent && !companyContent.rawResponse;
  const hasGlobal = globalContent && !globalContent.rawResponse;
  const companyName = globalAssumptions?.companyName || "Management Company";

  const isLoading = loadingCompany || loadingGlobal;

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }
  if (errorCompany) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
          <IconAlertTriangle className="w-8 h-8 text-destructive" />
          <p className="text-muted-foreground">Failed to load company research.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {SaveDialog}
      <AnimatedPage>
        <div className="space-y-5">
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
                  {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <IconRefreshCw className="w-4 h-4" />}
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
                  <Tabs defaultValue={SUB_TABS[activeGroup][0].value} className="w-full">
                    <TabsList className="flex flex-wrap h-auto gap-1 bg-card/60 backdrop-blur border border-border rounded-lg p-1">
                      {SUB_TABS[activeGroup].map(tab => (
                        <TabsTrigger
                          key={tab.value}
                          value={tab.value}
                          className="flex items-center gap-1.5 text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary rounded-lg px-3 py-1.5 transition-colors"
                        >
                          <tab.icon className="w-3.5 h-3.5" />
                          {tab.label}
                        </TabsTrigger>
                      ))}
                    </TabsList>

                    <TabsContent value="revenue-fees" className="mt-4">
                      <RevenueFees content={companyContent} hasData={hasCompany} onGenerate={generateResearch} />
                    </TabsContent>
                    <TabsContent value="cost-structure" className="mt-4">
                      <CostStructure content={companyContent} hasData={hasCompany} onGenerate={generateResearch} />
                    </TabsContent>
                    <TabsContent value="vendor-intel" className="mt-4">
                      <VendorIntelligence content={companyContent} hasData={hasCompany} onGenerate={generateResearch} />
                    </TabsContent>
                    <TabsContent value="competitive" className="mt-4">
                      <CompetitivePosition content={companyContent} hasData={hasCompany} onGenerate={generateResearch} />
                    </TabsContent>
                    <TabsContent value="criteria-ops" className="mt-4">
                      <ResearchCriteriaTab type="operations" />
                    </TabsContent>

                    <TabsContent value="personas" className="mt-4">
                      <GuestPersonas hasData={hasGlobal} onGenerate={generateResearch} />
                    </TabsContent>
                    <TabsContent value="capital" className="mt-4">
                      <CapitalInvestor hasData={hasGlobal} onGenerate={generateResearch} />
                    </TabsContent>
                    <TabsContent value="market-sizing" className="mt-4">
                      <MarketSizing content={globalContent} hasData={hasGlobal} onGenerate={generateResearch} />
                    </TabsContent>
                    <TabsContent value="regional" className="mt-4">
                      <RegionalOpportunities hasData={hasGlobal} onGenerate={generateResearch} />
                    </TabsContent>
                    <TabsContent value="criteria-mkt" className="mt-4">
                      <ResearchCriteriaTab type="marketing" />
                    </TabsContent>

                    <TabsContent value="hospitality" className="mt-4">
                      <HospitalityOverview content={globalContent} hasData={hasGlobal} onGenerate={generateResearch} />
                    </TabsContent>
                    <TabsContent value="supply-demand" className="mt-4">
                      <SupplyDemand content={globalContent} hasData={hasGlobal} onGenerate={generateResearch} />
                    </TabsContent>
                    <TabsContent value="economic" className="mt-4">
                      <EconomicClimate hasData={hasGlobal} onGenerate={generateResearch} />
                    </TabsContent>
                    <TabsContent value="trends" className="mt-4">
                      <TrendsInnovation hasData={hasGlobal} onGenerate={generateResearch} />
                    </TabsContent>
                    <TabsContent value="criteria-ind" className="mt-4">
                      <ResearchCriteriaTab type="industry" />
                    </TabsContent>
                  </Tabs>
                </motion.div>
              </AnimatePresence>
            </>
          )}
        </div>
      </AnimatedPage>
    </Layout>
  );
}
