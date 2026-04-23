import { useEffect, useRef, lazy, Suspense } from "react";
import Layout from "@/components/Layout";
import { PageHeader } from "@/components/ui/page-header";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AnimatedPage } from "@/components/graphics/AnimatedPage";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { IconAlertTriangle } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Loader2 } from "@/components/icons/themed-icons";
import { useAiIntelligenceSection } from "@/lib/ai-intelligence-nav";
import {
  type AiIntelligenceSection,
  SPECIALIST_SECTION_TO_ID,
} from "@/components/ai-intelligence/AiIntelligenceSidebar";
import { useRefreshLlmRegistry } from "@/lib/api/admin";
import { SPECIALIST_CATALOG } from "@engine/analyst/registry/specialist-catalog";

const AIAgentsTab = lazy(() => import("@/components/admin/AIAgentsTab"));
const EngineDashboard = lazy(() => import("@/components/admin/intelligence/EngineDashboard"));
const ScheduledResearchPanel = lazy(() => import("@/components/admin/intelligence/ScheduledResearchPanel"));
const VectorBenchTrendsTab = lazy(() => import("@/components/admin/intelligence/VectorBenchTrendsTab"));
const ResourcesTab = lazy(() => import("@/components/admin/resources/ResourcesTab"));
const SpecialistPage = lazy(() => import("@/pages/admin/specialist/SpecialistPage"));

const REBECCA_SUB_TAB: Partial<Record<AiIntelligenceSection, string>> = {
  "ai-agents":      "configuration",
  "knowledge-base": "knowledge-base",
  "conversations":  "conversations",
};

function isSpecialistSection(s: AiIntelligenceSection): s is keyof typeof SPECIALIST_SECTION_TO_ID {
  return s in SPECIALIST_SECTION_TO_ID;
}

const sectionMeta: Record<AiIntelligenceSection, { title: string; subtitle: string }> = {
  "ai-agents":           { title: "Rebecca Configuration", subtitle: "System prompt, personality, and configuration for your AI assistant" },
  "knowledge-base":      { title: "Knowledge Base",        subtitle: "Documents, training data, and research sources for Rebecca" },
  "conversations":       { title: "Conversations",         subtitle: "Chat history, feedback, and conversation analytics" },
  "engine-health":       { title: "System Health",         subtitle: "Coverage, freshness, costs, and system health" },
  "scheduled-research":  { title: "Scheduled Research",    subtitle: "Automated research workflows that keep intelligence fresh" },
  "vector-bench":        { title: "Vector Search Latency", subtitle: "pgvector / HNSW p50 and p95 query latency over time" },
  "resources-apis":        { title: "Resources · APIs",        subtitle: "Live external HTTP services. Canonical wiring for every Specialist." },
  "resources-sources":     { title: "Resources · Sources",     subtitle: "Bulk data sources and scrapers feeding the warehouse." },
  "resources-tables":      { title: "Resources · Tables",      subtitle: "Internal warehouse tables Specialists query." },
  "resources-benchmarks":  { title: "Resources · Benchmarks",  subtitle: "Hospitality benchmark slugs (ADR, RevPAR, occupancy, etc.)." },
  "resources-models":      { title: "Resources · Models",      subtitle: "LLM model rows (provider + secret + config)." },
  "specialist-mgmt-co-funding":            { title: "Funding Intelligence",         subtitle: "" },
  "specialist-mgmt-co-revenue":            { title: "Revenue Intelligence",         subtitle: "" },
  "specialist-mgmt-co-icp-intelligence":   { title: "ICP Intelligence",             subtitle: "" },
  "specialist-property-risk-intelligence": { title: "Property Risk Intelligence",   subtitle: "" },
  "specialist-property-executive-summary": { title: "Executive Summary",            subtitle: "" },
  "specialist-photos-photo-enhancer":      { title: "Photo Enhancer & Renders",     subtitle: "" },
  "specialist-portfolio-ops-watchdog":     { title: "Portfolio Watchdog",           subtitle: "" },
  "specialist-resources-builder":          { title: "Resource Builder",             subtitle: "" },
  "specialist-constants-tax-research":         { title: "Tax Authority Research",          subtitle: "" },
  "specialist-constants-macro-research":       { title: "Macro Indicators Research",       subtitle: "" },
  "specialist-constants-depreciation-research":{ title: "Depreciation Schedule Research",  subtitle: "" },
  "specialist-constants-reporting-research":   { title: "Reporting Conventions Research",  subtitle: "" },
};

function specialistMeta(section: keyof typeof SPECIALIST_SECTION_TO_ID): { title: string; subtitle: string } {
  const id = SPECIALIST_SECTION_TO_ID[section];
  const def = SPECIALIST_CATALOG.find((d) => d.id === id);
  return {
    title: def?.displayName ?? def?.realName ?? sectionMeta[section].title,
    subtitle: def?.description ?? "",
  };
}

function SectionContent({ section }: { section: AiIntelligenceSection }) {
  switch (section) {
    case "ai-agents":
    case "knowledge-base":
    case "conversations":
      return (
        <ErrorBoundary fallback={
          <div className="mt-6 p-8 flex flex-col items-center gap-4 text-center rounded-xl border border-accent-pop/20 bg-accent-pop/10">
            <IconAlertTriangle className="w-10 h-10 text-accent-pop" />
            <div>
              <p className="font-semibold text-foreground">AI configuration failed to load</p>
              <p className="text-sm text-muted-foreground mt-1">A component error occurred. Reload the page to try again.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
              Reload page
            </Button>
          </div>
        }>
          <AIAgentsTab initialTab={REBECCA_SUB_TAB[section]} />
        </ErrorBoundary>
      );
    case "engine-health":      return <EngineDashboard />;
    case "scheduled-research": return <ScheduledResearchPanel />;
    case "vector-bench":       return <VectorBenchTrendsTab />;
    case "resources-apis":       return <ResourcesTab kind="api" />;
    case "resources-sources":    return <ResourcesTab kind="source" />;
    case "resources-tables":     return <ResourcesTab kind="table" />;
    case "resources-benchmarks": return <ResourcesTab kind="benchmark" />;
    case "resources-models":     return <ResourcesTab kind="model" />;
    default: {
      if (isSpecialistSection(section)) {
        return <SpecialistPage specialistId={SPECIALIST_SECTION_TO_ID[section]} />;
      }
      return null;
    }
  }
}

export default function AiIntelligence() {
  const [activeSection] = useAiIntelligenceSection();
  const refreshLlmRegistry = useRefreshLlmRegistry();
  const didRefreshRef = useRef(false);

  useEffect(() => {
    if (didRefreshRef.current) return;
    didRefreshRef.current = true;
    refreshLlmRegistry.mutate();
  }, [refreshLlmRegistry]);

  const meta = isSpecialistSection(activeSection)
    ? specialistMeta(activeSection)
    : sectionMeta[activeSection];

  return (
    <AnimatedPage>
      <TooltipProvider>
        <Layout>
          <div className="space-y-5">
            <PageHeader
              title={meta.title}
              subtitle={meta.subtitle}
              variant="dark"
            />

            <div className="space-y-6" data-testid={`ai-intelligence-content-${activeSection}`}>
              <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
                <SectionContent section={activeSection} />
              </Suspense>
            </div>
          </div>
        </Layout>
      </TooltipProvider>
    </AnimatedPage>
  );
}
