import { useState, useCallback, useEffect, lazy, Suspense } from "react";
import Layout from "@/components/Layout";
import { PageHeader } from "@/components/ui/page-header";
import { TooltipProvider } from "@/components/ui/tooltip";
import { type AdminSection, resolveSection, SECTION_REDIRECTS, SPECIALIST_SECTION_TO_ID, type SpecialistSection } from "@/components/admin/AdminSidebar";
import { AnimatedPage } from "@/components/graphics/AnimatedPage";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { IconAlertTriangle } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { SaveButton } from "@/components/ui/save-button";
import { useAdminSection } from "@/lib/admin-nav";
import type { AdminSaveState } from "@/components/admin/save-state";
import { Loader2 } from "@/components/icons/themed-icons";

function isSpecialistSection(s: AdminSection): s is SpecialistSection {
  return s in SPECIALIST_SECTION_TO_ID;
}

const ActivityTab = lazy(() => import("@/components/admin").then(m => ({ default: m.ActivityTab })));
const VerificationTab = lazy(() => import("@/components/admin").then(m => ({ default: m.VerificationTab })));
const DatabaseTab = lazy(() => import("@/components/admin").then(m => ({ default: m.DatabaseTab })));
const PeopleTab = lazy(() => import("@/components/admin/PeopleTab"));
const NavigationTab = lazy(() => import("@/components/admin/NavigationTab"));
const AIAgentsTab = lazy(() => import("@/components/admin/AIAgentsTab"));
const NotificationsTab = lazy(() => import("@/components/admin/NotificationsTab"));
const ModelDefaultsTab = lazy(() => import("@/components/admin/ModelDefaultsTab"));
const ExportsTab = lazy(() => import("@/components/admin/ExportsTab"));
const ScenariosTab = lazy(() => import("@/components/admin/ScenariosTab"));
const QASandbox = lazy(() => import("@/components/admin/intelligence/QASandbox"));
const ScheduledResearchPanel = lazy(() => import("@/components/admin/intelligence/ScheduledResearchPanel"));
const BrandTab = lazy(() => import("@/components/admin/BrandTab"));
const EngineDashboard = lazy(() => import("@/components/admin/intelligence/EngineDashboard"));
const DataSourcesTab = lazy(() => import("@/components/admin/intelligence/DataSourcesTab"));
const PipelineConfigTab = lazy(() => import("@/components/admin/intelligence/PipelineConfigTab"));
// KnowledgeBaseTab is now rendered as a sub-tab inside AIAgentsTab/RebeccaAdminTabs
const HospitalityBenchmarksTab = lazy(() => import("@/components/admin/intelligence/HospitalityBenchmarksTab"));
const AnalystTablesTab = lazy(() => import("@/components/admin/intelligence/AnalystTables"));
const VectorBenchTrendsTab = lazy(() => import("@/components/admin/intelligence/VectorBenchTrendsTab"));
const PhotosRendersTab = lazy(() => import("@/components/admin/PhotosRendersTab"));
const SpecialistPage = lazy(() => import("@/pages/admin/specialist/SpecialistPage"));

export type { AdminSaveState };

const sectionMeta: Partial<Record<AdminSection, { title: string; subtitle: string }>> = {
  "model-defaults":      { title: "App Defaults",           subtitle: "Financial defaults and seed values for new entities" },
  users:                 { title: "Users",                   subtitle: "Manage user accounts and assignments" },
  activity:              { title: "Activity",                subtitle: "Login logs, audit trail, and session monitoring" },
  companies:             { title: "Companies",               subtitle: "Manage companies of interest" },
  groups:                { title: "Groups",                   subtitle: "User groups for branded experiences" },
  scenarios:             { title: "Scenarios",                subtitle: "Manage all scenarios, ownership, and access grants" },
  brand:                 { title: "Brand",                    subtitle: "Logos, themes, and icon customization" },
  exports:               { title: "Exports",                  subtitle: "Configure content, orientation, and layout for all report exports" },
  "ai-agents":           { title: "Rebecca Configuration",   subtitle: "System prompt, personality, and configuration for your AI assistant" },
  "knowledge-base":      { title: "Knowledge Base",           subtitle: "Documents, training data, and research sources for Rebecca" },
  conversations:         { title: "Conversations",            subtitle: "Chat history, feedback, and conversation analytics" },
  "engine-dashboard":    { title: "Research Dashboard",       subtitle: "Coverage, freshness, costs, and system health" },
  "data-sources":        { title: "Data Sources",             subtitle: "APIs, scrapers, sources, and AI models powering intelligence" },
  "pipeline-config":     { title: "Pipeline Config",          subtitle: "Staleness thresholds, token budgets, model routing, and refresh schedules" },
  "qa-sandbox":          { title: "QA Sandbox",               subtitle: "Preview context packs and prompts before running research" },
  "scheduled-research":  { title: "Scheduled Research",       subtitle: "Automated research workflows that keep intelligence fresh" },
  benchmarks:            { title: "Hospitality Benchmarks",    subtitle: "Industry benchmark values powering AI research ranges" },
  "analyst-tables":      { title: "Analyst Tables",             subtitle: "Admin-only LLM refresh of benchmark tables (capital raise, etc.)" },
  "vector-bench":        { title: "Vector Search Latency",      subtitle: "Trend lines for pgvector / HNSW p50 and p95 query latency over time" },
  notifications:         { title: "Notifications",            subtitle: "Email channels, alert rules, and delivery tracking" },
  navigation:            { title: "Navigation",               subtitle: "Control which sidebar pages are visible to users" },
  verification:          { title: "Verification",             subtitle: "Independent GAAP financial audit and compliance" },
  database:              { title: "Database",                  subtitle: "Entity monitoring, seed data, and canonical sync" },

  "photos-renders":      { title: "Photos & Renders",          subtitle: "AI image generation models, prompt templates, and render settings" },

  // AI Research → Specialists (P5). Title/subtitle mirror the catalog
  // letter+name so the page header reads identically to the sidebar row.
  "specialist-mgmt-co-funding":            { title: "Specialist A — Funding",            subtitle: "Read-only assignment + health surface for the mgmt-co Funding Specialist." },
  "specialist-mgmt-co-revenue":            { title: "Specialist B — Revenue",            subtitle: "Read-only assignment + health surface for the mgmt-co Revenue Specialist." },
  "specialist-mgmt-co-icp-intelligence":   { title: "Specialist C — ICP Intelligence",   subtitle: "Read-only assignment + health surface (evaluator pending)." },
  "specialist-property-risk-intelligence": { title: "Specialist D — Risk Intelligence",  subtitle: "Read-only assignment + health surface (evaluator pending)." },
  "specialist-property-executive-summary": { title: "Specialist E — Executive Summary",  subtitle: "Read-only assignment + health surface (evaluator pending)." },
  "specialist-photos-photo-enhancer":      { title: "Specialist F — Photo Enhancer",     subtitle: "Read-only assignment + health surface (evaluator pending)." },
  "specialist-portfolio-ops-watchdog":     { title: "Specialist G — Watchdog",           subtitle: "Read-only assignment + health surface (evaluator pending)." },
  "specialist-constants-tax-research":         { title: "Specialist H — Tax Authority Research",          subtitle: "Owns tax-rate, capital-gains, and property-tax constants. Authority-sourced; refresh per row." },
  "specialist-constants-macro-research":       { title: "Specialist I — Macro Indicators Research",       subtitle: "Owns inflation and country risk premium. Sourced from central banks and IMF." },
  "specialist-constants-depreciation-research":{ title: "Specialist J — Depreciation Schedule Research",  subtitle: "Owns building depreciation useful-life by country (IRS Pub. 946, CRA, CGI, etc.)." },
  "specialist-constants-reporting-research":   { title: "Specialist K — Reporting Conventions Research",  subtitle: "Owns universal conventions (USALI/AHLA) such as days-per-month." },

  icp:                   { title: "Research Dashboard",       subtitle: "Intelligence observatory" },
  logos:                 { title: "Brand",                    subtitle: "Logos, themes, and icon customization" },
  themes:                { title: "Brand",                    subtitle: "Logos, themes, and icon customization" },
  icons:                 { title: "Brand",                    subtitle: "Logos, themes, and icon customization" },
  llms:                  { title: "Data Sources",             subtitle: "APIs, scrapers, sources, and AI models" },
  sources:               { title: "Data Sources",             subtitle: "APIs, scrapers, sources, and AI models" },
  "model-routing":       { title: "Pipeline Config",          subtitle: "Model routing and pipeline policies" },
  "cache-services":      { title: "Research Dashboard",       subtitle: "Service health and cache management" },
  integrations:          { title: "Data Sources",             subtitle: "External APIs and data integrations" },
  "api-dashboard":       { title: "Data Sources",             subtitle: "API health and monitoring" },
  "coverage-analytics":  { title: "Research Dashboard",       subtitle: "Research coverage analytics" },
  "pipeline-policies":   { title: "Pipeline Config",          subtitle: "Pipeline policies and scheduling" },
  "source-registry":     { title: "Data Sources",             subtitle: "Source registry and trust scores" },
  "system-intelligence": { title: "Research Dashboard",       subtitle: "System intelligence status" },
  research:              { title: "Research Dashboard",       subtitle: "Research center" },
  // New 10-block navigation entries
  "financial-defaults":  { title: "Defaults",                 subtitle: "Management company default financial parameters and seed values" },
  "rental-defaults":     { title: "Property Defaults",        subtitle: "Default revenue, cost, and capital assumptions for new properties" },
  "required-fields":     { title: "Required Fields",          subtitle: "Configure which property fields are required before research runs" },
  "sources-apis":        { title: "Sources & APIs",           subtitle: "APIs, scrapers, sources, and AI models powering intelligence" },
  "llm-config":          { title: "LLM Configuration",        subtitle: "Language model routing and pipeline policies" },
  "engine-health":       { title: "System Health",            subtitle: "Coverage, freshness, and system health" },
  "user-management":     { title: "Users",                    subtitle: "Manage user accounts and assignments" },
  "default-assignments": { title: "Default Assignments",      subtitle: "Assign default scenarios per user with property toggles" },
  "rebecca-config":      { title: "Rebecca Configuration",    subtitle: "System prompt, personality, and configuration for your AI assistant" },
  "themes-appearance":   { title: "Themes & Appearance",      subtitle: "Logos, themes, and icon customization" },
  "app-settings":        { title: "App Settings",             subtitle: "Notifications, navigation, and system configuration" },
  "testing-verification":{ title: "Testing & Verification",   subtitle: "Independent GAAP financial audit and compliance" },
  "reports-exports":     { title: "Reports & Exports",        subtitle: "Configure content, orientation, and layout for all report exports" },
  // Defaults section (Steady State navigation)
  "defaults-management-company": { title: "Management Company Defaults", subtitle: "Default financial parameters seeded into new entities at the management-company level" },
  "defaults-property":           { title: "Property Defaults",            subtitle: "Default revenue, cost, and capital assumptions seeded into new properties" },
  "defaults-market-macro":       { title: "Market & Macro Defaults",      subtitle: "Macro and market-condition defaults applied to new entities" },
  "constants":                   { title: "Constants",                    subtitle: "Immutable model constants used across the application" },
};

/** Map sidebar alias → ModelDefaultsTab internal sub-tab value */
const MODEL_DEFAULTS_SUB_TAB: Partial<Record<AdminSection, string>> = {
  "model-defaults":      "company",
  "financial-defaults":  "company",
  "rental-defaults":     "property-underwriting",
  "required-fields":     "required-fields",
  // Defaults section
  "defaults-management-company": "company",
  "defaults-property":           "property-underwriting",
  "defaults-market-macro":       "market-macro",
  "constants":                   "model-constants",
};

/**
 * Map sidebar alias → set of ModelDefaultsTab sub-tabs that should be visible
 * when entering via that alias. When undefined, all tabs are shown (legacy
 * behavior). Each Defaults menu item shows only the tabs relevant to it,
 * so e.g. the Property page never surfaces Management Company defaults.
 */
const MODEL_DEFAULTS_VISIBLE_TABS: Partial<Record<AdminSection, readonly string[]>> = {
  "defaults-management-company": ["company"],
  "defaults-property":           ["property-underwriting"],
  "defaults-market-macro":       ["market-macro"],
  "constants":                   ["model-constants"],
};

const REBECCA_SUB_TAB: Partial<Record<AdminSection, string>> = {
  "ai-agents":       "configuration",
  "rebecca-config":  "configuration",
  "knowledge-base":  "knowledge-base",
  "conversations":   "conversations",
};

/**
 * Walk the SECTION_REDIRECTS chain starting at `section` and return the first
 * value found in `map`. Lets us look up sub-tab / visible-tab config by an
 * alias (e.g. `services-fees`) and have it resolve to the entry registered
 * under the canonical Steady-State section it redirects to.
 */
function lookupAlongChain<T>(section: AdminSection, map: Partial<Record<AdminSection, T>>): T | undefined {
  let current: AdminSection | undefined = section;
  const seen = new Set<AdminSection>();
  while (current && !seen.has(current)) {
    const value = map[current];
    if (value !== undefined) return value;
    seen.add(current);
    current = SECTION_REDIRECTS[current];
  }
  return undefined;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function SectionContent({ section, onNavigate, onSaveStateChange }: { section: AdminSection; onNavigate: (s: AdminSection) => void; onSaveStateChange: (state: AdminSaveState | null) => void }) {
  const resolved = resolveSection(section);

  switch (resolved) {
    case "model-defaults":   return <ModelDefaultsTab onSaveStateChange={onSaveStateChange} initialTab={lookupAlongChain(section, MODEL_DEFAULTS_SUB_TAB)} visibleTabs={lookupAlongChain(section, MODEL_DEFAULTS_VISIBLE_TABS)} />;
    case "users":            return <PeopleTab />;
    case "activity":         return <ActivityTab />;
    case "scenarios":        return <ScenariosTab />;
    case "brand":            return <BrandTab />;
    case "exports":          return <ExportsTab />;
    case "ai-agents":        return (
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
      }><AIAgentsTab onSaveStateChange={onSaveStateChange} initialTab={REBECCA_SUB_TAB[section]} /></ErrorBoundary>
    );
    case "engine-dashboard": return <EngineDashboard />;
    case "data-sources":     return <DataSourcesTab />;
    case "pipeline-config":  return <PipelineConfigTab onSaveStateChange={onSaveStateChange} />;
    case "qa-sandbox":       return <QASandbox />;
    case "scheduled-research": return <ScheduledResearchPanel />;
    case "benchmarks":       return <HospitalityBenchmarksTab />;
    case "analyst-tables":   return <AnalystTablesTab />;
    case "vector-bench":     return <VectorBenchTrendsTab />;
    case "notifications":    return <NotificationsTab />;
    case "navigation":       return <NavigationTab />;
    case "verification":     return <VerificationTab />;
    case "database":         return <DatabaseTab />;
    case "photos-renders":   return <PhotosRendersTab />;
    default: {
      if (isSpecialistSection(section)) {
        return <SpecialistPage specialistId={SPECIALIST_SECTION_TO_ID[section]} />;
      }
      return null;
    }
  }
}

export default function Admin() {
  const [activeSection, setActiveSection] = useAdminSection();
  const [saveState, setSaveState] = useState<AdminSaveState | null>(null);

  useEffect(() => {
    setSaveState(null);
  }, [activeSection]);

  const handleSaveStateChange = useCallback((state: AdminSaveState | null) => {
    setSaveState(state);
  }, []);

  const resolved = resolveSection(activeSection);
  const meta = lookupAlongChain(activeSection, sectionMeta) ?? sectionMeta[resolved] ?? { title: "Admin", subtitle: "" };

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
              saveState ? (
                <SaveButton
                  onClick={saveState.onSave}
                  hasChanges={saveState.isDirty}
                  isPending={saveState.isPending}
                  size="sm"
                  data-testid="button-admin-save"
                />
              ) : undefined
            }
          />

          <div className="space-y-6" data-testid={`admin-content-${resolved}`}>
            <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
              <SectionContent section={activeSection} onNavigate={setActiveSection} onSaveStateChange={handleSaveStateChange} />
            </Suspense>
          </div>
        </div>
      </Layout>
    </TooltipProvider>
    </AnimatedPage>
  );
}
