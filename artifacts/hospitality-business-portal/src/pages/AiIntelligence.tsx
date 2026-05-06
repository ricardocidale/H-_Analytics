import { useEffect, useMemo, useRef, lazy, Suspense } from "react";
import { useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { PageHeader } from "@/components/ui/page-header";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AnimatedPage } from "@/components/graphics/AnimatedPage";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { IconAlertTriangle } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Loader2 } from "@/components/icons/themed-icons";
import { setAiIntelligenceSection, useAiIntelligenceSection } from "@/lib/ai-intelligence-nav";
import {
  type AiIntelligenceSection,
  SPECIALIST_SECTION_TO_ID,
} from "@/components/ai-intelligence/AiIntelligenceSidebar";
import { SpecialistQuickSearch } from "@/components/ai-intelligence/SpecialistQuickSearch";
import { useRefreshLlmRegistry } from "@/lib/api/admin";
import { ORCHESTRATOR_SPECIALIST_ID } from "@engine/analyst/identity";
import { SPECIALIST_CATALOG } from "@engine/analyst/registry/specialist-catalog";
import { buildSpecialistTitle, resolveSpecialistDisplay } from "@/components/specialists";

interface SpecialistListItem {
  id: string;
  humanName?: string | null;
}

const AIAgentsTab = lazy(() => import("@/components/admin/AIAgentsTab"));
const EngineDashboard = lazy(() => import("@/components/admin/intelligence/EngineDashboard"));
const ScheduledResearchPanel = lazy(() => import("@/components/admin/intelligence/ScheduledResearchPanel"));
const VectorBenchTrendsTab = lazy(() => import("@/components/admin/intelligence/VectorBenchTrendsTab"));
const ResourcesAdminPage = lazy(() => import("@/components/admin/resources/ResourcesAdminPage"));
const SpecialistPage = lazy(() => import("@/pages/admin/specialist/SpecialistPage"));
// Photos & Renders has a richer page than other specialists — it overlays
// a server-backed history gallery (Task #432) on top of the standard
// SpecialistPage console so admins can see, share, and re-use every past
// render across sessions and devices.
const FernandaRenderConsolePage = lazy(
  () => import("@/pages/ai-intelligence/FernandaRenderConsolePage"),
);
const MarketDataTablesPage = lazy(
  () => import("@/pages/ai-intelligence/MarketDataTablesPage"),
);
const GustavoInfoPage = lazy(() => import("@/pages/ai-intelligence/GustavoInfoPage"));
const IrisPanel = lazy(() => import("@/components/iris/IrisPanel"));
const SpecialistsDirectoryPage = lazy(() => import("@/pages/ai-intelligence/SpecialistsDirectoryPage"));
const LlmWorkflowsPage = lazy(() => import("@/pages/ai-intelligence/LlmWorkflowsPage"));
const AssumptionGuidancePage = lazy(() => import("@/pages/ai-intelligence/AssumptionGuidancePage"));
const KnowledgeRegistryPage = lazy(() => import("@/pages/ai-intelligence/KnowledgeRegistryPage"));
const CountryEconomicDataPage = lazy(() => import("@/pages/ai-intelligence/CountryEconomicDataPage"));

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
  "resources":             { title: "Resources · Catalog",            subtitle: "Admin-managed registries of which APIs, sources, benchmark slugs, and models exist. Benchmark *values* live in Market Data." },
  "resources-tables":      { title: "Market Data · Reference Tables", subtitle: "Actual benchmark and market data values (ADR index, labor rates, F&B, seasonal calendars) refreshed by The Analyst. The slug registry lives in Catalog → Benchmark Slugs." },
  "analyst-orchestrator":  { title: "Gustavo · The Analyst",   subtitle: "Orchestrator persona that routes work across the Specialist team." },
  "gustavo":               { title: "Gustavo · Analyst Orchestrator", subtitle: "Routes research tasks to the Specialist team and coordinates all intelligence gathering" },
  "iris":                  { title: "Iris · Resource Maintainer",    subtitle: "Keeps resource registries and reference data current across the platform" },
  "specialists":           { title: "Specialists",              subtitle: "Research Specialists powering H+ Analytics — verify deployment and run health checks" },
  "llm-workflows":         { title: "LLMs",                     subtitle: "Language model configuration for each research workflow — vendor, model, and Analyst recommendations" },
  "assumption-guidance":   { title: "Assumption Guidance",      subtitle: "Analyst-generated calibration insights — suggested ranges and sources for financial assumptions" },
  "knowledge-registry":        { title: "Knowledge Registry",        subtitle: "Registry of knowledge sources and documents powering AI Intelligence" },
  "knowledge-registry-country-data": { title: "Country Economic Data", subtitle: "Inflation, FX rates, GDP growth, and interest rate data per country" },
  "specialist-mgmt-co-funding":            { title: "Funding Intelligence",         subtitle: "" },
  "specialist-mgmt-co-revenue":            { title: "Revenue Intelligence",         subtitle: "" },
  "specialist-mgmt-co-compensation":       { title: "Compensation Intelligence",    subtitle: "" },
  "specialist-mgmt-co-overhead":           { title: "Overhead Intelligence",        subtitle: "" },
  "specialist-mgmt-co-company":            { title: "Company Intelligence",         subtitle: "" },
  "specialist-mgmt-co-property-defaults": { title: "Property Defaults Intelligence", subtitle: "" },
  "specialist-mgmt-co-icp-intelligence":   { title: "ICP Intelligence",             subtitle: "" },
  "specialist-property-risk-intelligence": { title: "Property Risk Intelligence",   subtitle: "" },
  "specialist-property-executive-summary": { title: "Executive Summary",            subtitle: "" },
  "specialist-photos-photo-enhancer":      { title: "Photo Enhancer & Renders",     subtitle: "" },
  "specialist-portfolio-ops-watchdog":     { title: "Portfolio Watchdog",           subtitle: "" },
  "specialist-portfolio-capital-raise":    { title: "Portfolio Capital Raise",      subtitle: "" },
  "specialist-resources-builder":          { title: "Resource Builder",             subtitle: "" },
  "specialist-constants-tax-research":         { title: "Tax Authority Research",          subtitle: "" },
  "specialist-constants-macro-research":       { title: "Macro Indicators Research",       subtitle: "" },
  "specialist-constants-depreciation-research":{ title: "Depreciation Schedule Research",  subtitle: "" },
  "specialist-constants-reporting-research":   { title: "Reporting Conventions Research",  subtitle: "" },
};

/**
 * Page-header copy for a Specialist section. Persona-first header: lead
 * with the override-resolved human name from `/api/admin/specialists`
 * (so an Identity-tab rename reflects immediately without a reload),
 * fall back to the catalog `humanName` while the query is in flight,
 * then to just the role label if neither is set.
 *
 * The resolution chain itself lives in `resolveSpecialistDisplay`
 * (`@/components/specialists`) so this page header, the AI sidebar's
 * `specialistRow`, and the `<SpecialistName />` component all agree on
 * what name to lead with. See
 * `.agents/skills/specialist-persona-naming/SKILL.md` for the rule.
 */
function specialistMeta(
  section: keyof typeof SPECIALIST_SECTION_TO_ID,
  humanNameById: Map<string, string>,
): { title: string; subtitle: string } {
  const id = SPECIALIST_SECTION_TO_ID[section];
  // Title goes through the shared `buildSpecialistTitle` helper so this
  // page header, the Admin shell's specialist sections, and the AI
  // sidebar's `specialistRow` can never drift on what name to lead with.
  // The fallback role for an unknown id is the section's marketing-copy
  // title — when the resolver can't find the id in the catalog we'd
  // rather show "Funding Intelligence" than the raw slug.
  const title = buildSpecialistTitle(id, humanNameById, sectionMeta[section].title);
  // Subtitle stays a local concern — the catalog `description` is the
  // one-line tagline shown under the page header, distinct from the
  // persona-naming chain in `resolveSpecialistDisplay`. Looking it up
  // here keeps the resolver focused on names while preserving the
  // descriptive subtitle on every Specialist page.
  const def = SPECIALIST_CATALOG.find((d) => d.id === id);
  return {
    title,
    subtitle: def?.description ?? "",
  };
}

// Page header for the orchestrator section. The role label ("The Analyst")
// is the marketing copy used throughout the AI Intelligence surface and
// stays fixed; only the persona name in front of it tracks the Identity-
// tab override so a rename shows up here without a page reload.
function orchestratorMeta(humanNameById: Map<string, string>): { title: string; subtitle: string } {
  const display = resolveSpecialistDisplay(ORCHESTRATOR_SPECIALIST_ID, humanNameById);
  return {
    title: `${display.humanName} · The Analyst`,
    subtitle: sectionMeta["analyst-orchestrator"].subtitle,
  };
}

// Page header for Gustavo's read-only info page. Uses the same persona-first
// resolution chain as orchestratorMeta but pairs with the "Analyst Orchestrator"
// role label (not "The Analyst") to distinguish the info view from the
// legacy analyst-orchestrator SpecialistPage which it supersedes in the nav.
function gustavoMeta(humanNameById: Map<string, string>): { title: string; subtitle: string } {
  const display = resolveSpecialistDisplay(ORCHESTRATOR_SPECIALIST_ID, humanNameById);
  return {
    title: `${display.humanName} · Analyst Orchestrator`,
    subtitle: sectionMeta["gustavo"].subtitle,
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
    case "resources":            return <ResourcesAdminPage />;
    case "resources-tables":     return <MarketDataTablesPage />;
    case "analyst-orchestrator": return <SpecialistPage specialistId={ORCHESTRATOR_SPECIALIST_ID} />;
    case "specialist-photos-photo-enhancer": return <FernandaRenderConsolePage />;
    case "gustavo":           return <GustavoInfoPage />;
    case "iris":              return <IrisPanel />;
    case "specialists":       return <SpecialistsDirectoryPage />;
    case "llm-workflows":     return <LlmWorkflowsPage />;
    case "assumption-guidance": return <AssumptionGuidancePage />;
    case "knowledge-registry":             return <KnowledgeRegistryPage />;
    case "knowledge-registry-country-data": return <CountryEconomicDataPage />;
    default: {
      if (isSpecialistSection(section)) {
        return <SpecialistPage specialistId={SPECIALIST_SECTION_TO_ID[section]} />;
      }
      return null;
    }
  }
}

// All section keys that the sidebar can route to. URL-driven deep links
// validate against this set so a stray `?section=…` cannot push an
// unknown value into the section store. Specialist sections are derived
// from the canonical SPECIALIST_SECTION_TO_ID map; the literal section
// keys mirror the sidebar groups in AiIntelligenceSidebar.tsx.
const VALID_SECTIONS = new Set<AiIntelligenceSection>([
  ...(Object.keys(SPECIALIST_SECTION_TO_ID) as AiIntelligenceSection[]),
  "analyst-orchestrator",
  "ai-agents",
  "knowledge-base",
  "conversations",
  "gustavo",
  "iris",
  "specialists",
  "llm-workflows",
  "assumption-guidance",
  "engine-health",
  "scheduled-research",
  "vector-bench",
  "resources",
  "resources-tables",
  "knowledge-registry",
  "knowledge-registry-country-data",
]);

export default function AiIntelligence() {
  const [activeSection] = useAiIntelligenceSection();
  const refreshLlmRegistry = useRefreshLlmRegistry();
  const didRefreshRef = useRef(false);

  // Pull the live Specialist list so the page header tracks any Identity-
  // tab rename (including Gaspar) without a reload. The IdentityTab
  // already invalidates this query on save, so the header refreshes the
  // moment the override is persisted. Falls back to the static catalog
  // name while the query is in flight or if the request fails.
  const { data: specialists } = useQuery<SpecialistListItem[]>({
    queryKey: ["/api/admin/specialists"],
  });
  const humanNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of specialists ?? []) {
      const trimmed = s.humanName?.trim();
      if (trimmed) m.set(s.id, trimmed);
    }
    return m;
  }, [specialists]);

  // Honor `?section=…` deep links (e.g. from the band-drop notification
  // emails for Specialists). Applied once per mount so the sidebar
  // selection from in-app navigation isn't clobbered on every render.
  const urlSearch = useSearch();
  const didApplyDeepLinkRef = useRef(false);
  useEffect(() => {
    if (didApplyDeepLinkRef.current) return;
    didApplyDeepLinkRef.current = true;
    const params = new URLSearchParams(urlSearch);
    const requested = params.get("section");
    if (requested && VALID_SECTIONS.has(requested as AiIntelligenceSection)) {
      setAiIntelligenceSection(requested as AiIntelligenceSection);
    }
  }, [urlSearch]);

  useEffect(() => {
    if (didRefreshRef.current) return;
    didRefreshRef.current = true;
    refreshLlmRegistry.mutate();
  }, [refreshLlmRegistry]);

  const meta = isSpecialistSection(activeSection)
    ? specialistMeta(activeSection, humanNameById)
    : activeSection === "analyst-orchestrator"
      ? orchestratorMeta(humanNameById)
      : activeSection === "gustavo"
        ? gustavoMeta(humanNameById)
        : sectionMeta[activeSection];

  // Persona-first browser tab title: matches the in-app PageHeader so
  // admins glancing at the tab strip see the human name first ("Ana ·
  // Funding Intelligence | …") instead of just the role label.
  useEffect(() => {
    const previous = document.title;
    document.title = `${meta.title} | H+ Analytics`;
    return () => {
      document.title = previous;
    };
  }, [meta.title]);

  return (
    <AnimatedPage>
      <TooltipProvider>
        <Layout>
          <div className="space-y-5">
            <PageHeader
              title={meta.title}
              subtitle={meta.subtitle}
              variant="dark"
              actions={
                <SpecialistQuickSearch
                  onSelect={(section) => setAiIntelligenceSection(section)}
                />
              }
            />

            <div className="space-y-6" data-testid={`ai-intelligence-content-${activeSection}`}>
              <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-accent-pop" /></div>}>
                <SectionContent section={activeSection} />
              </Suspense>
            </div>
          </div>
        </Layout>
      </TooltipProvider>
    </AnimatedPage>
  );
}
