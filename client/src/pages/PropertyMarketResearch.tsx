import { useState } from "react";
import { useExportSave } from "@/hooks/useExportSave";
import { AnimatedPage } from "@/components/graphics/AnimatedPage";
import Layout from "@/components/Layout";
import { useProperty, useMarketResearch, useGlobalAssumptions } from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { ExportToolbar } from "@/components/ui/export-toolbar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2 } from "@/components/icons/themed-icons";
import {
  IconRefreshCw, IconMapPin, IconBookOpen,
  IconFileDown, IconTrendingUp, IconDollarSign,
  IconBarChart3, IconPieChart,
} from "@/components/icons";
import { useRoute } from "wouter";
import { downloadResearchPDF } from "@/lib/exports/researchPdfExport";
import { useToast } from "@/hooks/use-toast";
import { useResearchStream } from "@/components/property-research/useResearchStream";
import { ResearchFreshnessBadge } from "@/components/research/ResearchFreshnessBadge";
import { ResearchLoadingOverlay } from "@/components/research/ResearchLoadingOverlay";
import { ResearchCriteriaTab } from "@/components/research/ResearchCriteriaTab";
import { MarketRateBenchmark } from "@/components/property-research/MarketRateBenchmark";
import MethodologyTransparencyPanel from "@/components/research/MethodologyTransparencyPanel";
import { motion } from "framer-motion";
import { MarketTab, RevenueTab, FinancialTab, OperatingTab, SourcesTab } from "@/components/research/MarketResearchTabs";
import { card } from "@/components/research/research-chart-shared";

export default function PropertyMarketResearch() {
  const [, params] = useRoute("/property/:id/research");
  const propertyId = parseInt(params?.id || "0");
  const { data: property, isLoading: propertyLoading } = useProperty(propertyId);
  const { data: global } = useGlobalAssumptions();
  const { data: research, isLoading: researchLoading } = useMarketResearch("property", propertyId);
  const [activeTab, setActiveTab] = useState("market");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { toast } = useToast();

  const { requestSave, SaveDialog } = useExportSave();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { isGenerating, streamedContent, phases, generateResearch } = useResearchStream({
    property,
    propertyId,
    global,
  });

  if (propertyLoading || researchLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!property) {
    return (
      <Layout>
        <div className="text-center py-12 text-white/60">Property not found</div>
      </Layout>
    );
  }

  const content = research?.content as any;
  const hasResearch = content && !content.rawResponse;
  const adrValue = property.startAdr ? Math.round(property.startAdr) : null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const propertyLabel = global?.propertyLabel || "boutique hotel";

  return (
    <Layout>
      {SaveDialog}
      <AnimatedPage>
        <div className="space-y-6">
          <PageHeader
            title={`Market Research: ${property.name}`}
            subtitle={`${property.location} · ${property.market} · ${property.roomCount} rooms${adrValue ? ` · $${adrValue} ADR` : ""}`}
            variant="dark"
            backLink={`/property/${property.id}/edit`}
            actions={
              <div className="flex items-center gap-3">
                {research?.updatedAt && (
                  <ResearchFreshnessBadge updatedAt={research.updatedAt} className="hidden sm:flex" />
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 h-9 text-xs font-medium hover:scale-[1.03] active:scale-[0.97] transition-transform"
                  onClick={generateResearch}
                  disabled={isGenerating}
                  data-testid="button-update-research"
                >
                  {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <IconRefreshCw className="w-4 h-4" />}
                  {isGenerating ? "Analyzing..." : "Regenerate"}
                </Button>
                {hasResearch && !isGenerating && (
                  <ExportToolbar
                    variant="glass"
                    actions={[
                      {
                        label: "Download PDF",
                        icon: <IconFileDown className="w-3.5 h-3.5" />,
                        onClick: () => requestSave(`Market Research - ${property.name}`, ".pdf", (f) => downloadResearchPDF({
                          type: "property",
                          title: `Market Research: ${property.name}`,
                          subtitle: `${property.location} · ${property.market} · ${property.roomCount} rooms`,
                          content,
                          updatedAt: research?.updatedAt,
                          llmModel: research?.llmModel || undefined,
                          promptConditions: (research as any)?.promptConditions || undefined,
                        }, f)),
                        testId: "button-export-research-pdf",
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
              phases={phases}
              variant="inline"
            />
          )}

          {!hasResearch && !isGenerating && (
            <div className={`${card} p-12 text-center`}>
              <div className="w-20 h-20 mx-auto mb-6 rounded-lg bg-primary/10 flex items-center justify-center">
                <IconBookOpen className="w-10 h-10 text-primary" />
              </div>
              <h3 className="text-xl font-display text-foreground mb-3">No Market Research Yet</h3>
              <p className="text-sm text-muted-foreground mb-6 max-w-lg mx-auto leading-relaxed">
                Generate AI-powered market analysis for <strong>{property.name}</strong>. The research covers ADR benchmarks,
                occupancy patterns, competitive set, cap rates, operating costs, event demand, and more — all tailored to <strong>{property.location}</strong>.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-xl mx-auto mb-8 text-left">
                <div className="bg-primary/10 dark:bg-primary/8 rounded-xl p-3 border border-primary/20 dark:border-primary/30">
                  <p className="text-xs font-semibold text-primary dark:text-primary mb-1">Market Data</p>
                  <p className="text-xs text-primary dark:text-primary">ADR, occupancy, RevPAR, and comp set analysis</p>
                </div>
                <div className="bg-chart-1/10 dark:bg-chart-1/8 rounded-xl p-3 border border-chart-1/20 dark:border-chart-1/30">
                  <p className="text-xs font-semibold text-chart-1 dark:text-chart-1 mb-1">Cost Benchmarks</p>
                  <p className="text-xs text-chart-1 dark:text-chart-1">Operating costs, taxes, and USALI rates</p>
                </div>
                <div className="bg-accent-pop/10 dark:bg-accent-pop/20 rounded-xl p-3 border border-accent-pop/20 dark:border-accent-pop/30">
                  <p className="text-xs font-semibold text-accent-pop dark:text-accent-pop mb-1">Assumption Guidance</p>
                  <p className="text-xs text-accent-pop dark:text-accent-pop">Research values appear as clickable badges on the edit page</p>
                </div>
              </div>
              <Button
                onClick={generateResearch}
                variant="default"
                className="gap-2 shadow-lg shadow-primary/20 hover:scale-[1.03] active:scale-[0.97] transition-transform"
              >
                <IconRefreshCw className="w-4 h-4" />
                Consult
              </Button>
            </div>
          )}

          {hasResearch && !isGenerating && (
            <>
            <MethodologyTransparencyPanel
              entityType="property"
              entityName={property.name}
              research={{
                updatedAt: research?.updatedAt,
                modelId: content?.modelId,
                sources: content?.sources,
                comparableCount: content?.comparableProperties?.length ?? content?.compSetSize,
                starRating: content?.starRating,
                relaxationTrail: content?.relaxationTrail,
                tierUsed: content?.tierUsed,
              }}
            />
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              <TabsList className="bg-white/60 dark:bg-white/5 backdrop-blur-xl border border-primary/10 p-1 rounded-xl">
                <TabsTrigger value="market" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg text-xs">
                  <IconMapPin className="w-3.5 h-3.5" /> Market
                </TabsTrigger>
                <TabsTrigger value="revenue" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg text-xs">
                  <IconTrendingUp className="w-3.5 h-3.5" /> Revenue
                </TabsTrigger>
                <TabsTrigger value="financial" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg text-xs">
                  <IconDollarSign className="w-3.5 h-3.5" /> Financial
                </TabsTrigger>
                <TabsTrigger value="operating" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg text-xs">
                  <IconBarChart3 className="w-3.5 h-3.5" /> Operating
                </TabsTrigger>
                <TabsTrigger value="rates" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg text-xs">
                  <IconDollarSign className="w-3.5 h-3.5" /> Rates
                </TabsTrigger>
                <TabsTrigger value="sources" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg text-xs">
                  <IconBookOpen className="w-3.5 h-3.5" /> Sources
                </TabsTrigger>
                <TabsTrigger value="criteria" className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg text-xs">
                  <IconPieChart className="w-3.5 h-3.5" /> Criteria
                </TabsTrigger>
              </TabsList>

              <TabsContent value="market"><MarketTab content={content} propertyLocation={property.location} /></TabsContent>
              <TabsContent value="revenue"><RevenueTab content={content} /></TabsContent>
              <TabsContent value="financial"><FinancialTab content={content} /></TabsContent>
              <TabsContent value="operating"><OperatingTab content={content} /></TabsContent>
              <TabsContent value="rates">
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                  <div className={`${card} p-6 space-y-6`}>
                    <MarketRateBenchmark
                      applicableRates={["sofr", "treasury10y", "primeRate"]}
                    />
                  </div>
                </motion.div>
              </TabsContent>
              <TabsContent value="sources">
                <SourcesTab content={content} />
              </TabsContent>
              <TabsContent value="criteria">
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                  <ResearchCriteriaTab type="property" />
                </motion.div>
              </TabsContent>
            </Tabs>
            </>
          )}
        </div>
      </AnimatedPage>
    </Layout>
  );
}
