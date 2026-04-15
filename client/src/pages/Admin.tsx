import { useState, useCallback, useEffect, lazy, Suspense } from "react";
import Layout from "@/components/Layout";
import { PageHeader } from "@/components/ui/page-header";
import { TooltipProvider } from "@/components/ui/tooltip";
import { type AdminSection, resolveSection } from "@/components/admin/AdminSidebar";
import { AnimatedPage } from "@/components/graphics/AnimatedPage";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { IconAlertTriangle } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { SaveButton } from "@/components/ui/save-button";
import { useAdminSection } from "@/lib/admin-nav";
import type { AdminSaveState } from "@/components/admin/save-state";
import { Loader2 } from "@/components/icons/themed-icons";

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
const FinancialLinesTab = lazy(() => import("@/components/admin/intelligence/FinancialLinesTab"));
const HospitalityBenchmarksTab = lazy(() => import("@/components/admin/intelligence/HospitalityBenchmarksTab"));

export type { AdminSaveState };

const sectionMeta: Record<AdminSection, { title: string; subtitle: string }> = {
  "model-defaults":      { title: "App Defaults",           subtitle: "Financial defaults and seed values for new entities" },
  users:                 { title: "Users",                   subtitle: "Manage user accounts and assignments" },
  activity:              { title: "Activity",                subtitle: "Login logs, audit trail, and session monitoring" },
  companies:             { title: "Companies",               subtitle: "Manage companies of interest" },
  groups:                { title: "Groups",                   subtitle: "User groups for branded experiences" },
  scenarios:             { title: "Scenarios",                subtitle: "Manage all scenarios, ownership, and access grants" },
  brand:                 { title: "Brand",                    subtitle: "Logos, themes, and icon customization" },
  exports:               { title: "Exports",                  subtitle: "Configure content, orientation, and layout for all report exports" },
  "ai-agents":           { title: "Rebecca Configuration",   subtitle: "System prompt, personality, and engine settings for your AI assistant" },
  "knowledge-base":      { title: "Knowledge Base",           subtitle: "Documents, training data, and research sources for Rebecca" },
  conversations:         { title: "Conversations",            subtitle: "Chat history, feedback, and conversation analytics" },
  "engine-dashboard":    { title: "Engine Dashboard",         subtitle: "Unified intelligence observatory — coverage, freshness, costs, and engine health" },
  "data-sources":        { title: "Data Sources",             subtitle: "APIs, scrapers, sources, and AI models powering intelligence" },
  "pipeline-config":     { title: "Pipeline Config",          subtitle: "Staleness thresholds, token budgets, model routing, and refresh schedules" },
  "qa-sandbox":          { title: "QA Sandbox",               subtitle: "Preview context packs and prompts before running research" },
  "scheduled-research":  { title: "Scheduled Research",       subtitle: "Automated research workflows that keep intelligence fresh" },
  "financial-lines":     { title: "Financial Lines",           subtitle: "Engine-suggested calculation additions for financial statements" },
  benchmarks:            { title: "Hospitality Benchmarks",    subtitle: "Industry benchmark values powering AI research ranges" },
  notifications:         { title: "Notifications",            subtitle: "Email channels, alert rules, and delivery tracking" },
  navigation:            { title: "Navigation",               subtitle: "Control which sidebar pages are visible to users" },
  verification:          { title: "Verification",             subtitle: "Independent GAAP financial audit and compliance" },
  database:              { title: "Database",                  subtitle: "Entity monitoring, seed data, and canonical sync" },

  icp:                   { title: "Engine Dashboard",         subtitle: "Unified intelligence observatory" },
  logos:                 { title: "Brand",                    subtitle: "Logos, themes, and icon customization" },
  themes:                { title: "Brand",                    subtitle: "Logos, themes, and icon customization" },
  icons:                 { title: "Brand",                    subtitle: "Logos, themes, and icon customization" },
  llms:                  { title: "Data Sources",             subtitle: "APIs, scrapers, sources, and AI models" },
  sources:               { title: "Data Sources",             subtitle: "APIs, scrapers, sources, and AI models" },
  "model-routing":       { title: "Pipeline Config",          subtitle: "Model routing and pipeline policies" },
  "cache-services":      { title: "Engine Dashboard",         subtitle: "Service health and cache management" },
  integrations:          { title: "Data Sources",             subtitle: "External APIs and data integrations" },
  "api-dashboard":       { title: "Data Sources",             subtitle: "API health and monitoring" },
  "coverage-analytics":  { title: "Engine Dashboard",         subtitle: "Research coverage analytics" },
  "pipeline-policies":   { title: "Pipeline Config",          subtitle: "Pipeline policies and scheduling" },
  "source-registry":     { title: "Data Sources",             subtitle: "Source registry and trust scores" },
  "system-intelligence": { title: "Engine Dashboard",         subtitle: "System intelligence status" },
  research:              { title: "Engine Dashboard",         subtitle: "Research center" },
  // New 10-block navigation entries
  "financial-defaults":  { title: "Defaults",                 subtitle: "Management company default financial parameters and seed values" },
  "services-fees":       { title: "Services & Fees",          subtitle: "Management company service categories and fee templates" },
  "company-profile":     { title: "Company Profile",          subtitle: "Management company identity and settings" },
  "hotel-defaults":      { title: "Hotel Model Defaults",     subtitle: "Default parameters for hotel property financial models" },
  "rental-defaults":     { title: "Luxury Rental Defaults",   subtitle: "Default parameters for luxury rental property models" },
  "required-fields":     { title: "Required Fields Config",   subtitle: "Configure which property fields are required before research runs" },
  "sources-apis":        { title: "Sources & APIs",           subtitle: "APIs, scrapers, sources, and AI models powering intelligence" },
  "llm-config":          { title: "LLM Configuration",        subtitle: "Language model routing and pipeline policies" },
  "engine-health":       { title: "Engine Health",            subtitle: "Unified intelligence observatory — coverage, freshness, and health" },
  "user-management":     { title: "Users",                    subtitle: "Manage user accounts and assignments" },
  "default-assignments": { title: "Default Assignments",      subtitle: "Assign default scenarios per user with property toggles" },
  "rebecca-config":      { title: "Rebecca Configuration",    subtitle: "System prompt, personality, and engine settings for your AI assistant" },
  "themes-appearance":   { title: "Themes & Appearance",      subtitle: "Logos, themes, and icon customization" },
  "app-settings":        { title: "App Settings",             subtitle: "Notifications, navigation, and system configuration" },
  "testing-verification":{ title: "Testing & Verification",   subtitle: "Independent GAAP financial audit and compliance" },
  "reports-exports":     { title: "Reports & Exports",        subtitle: "Configure content, orientation, and layout for all report exports" },
};

/** Map sidebar alias → ModelDefaultsTab internal sub-tab value */
const MODEL_DEFAULTS_SUB_TAB: Partial<Record<AdminSection, string>> = {
  "model-defaults":      "company",
  "financial-defaults":  "company",
  "company-profile":     "company",
  "services-fees":       "company",
  "hotel-defaults":      "property-underwriting",
  "rental-defaults":     "property-underwriting",
  "required-fields":     "required-fields",
};

const REBECCA_SUB_TAB: Partial<Record<AdminSection, string>> = {
  "ai-agents":       "configuration",
  "rebecca-config":  "configuration",
  "knowledge-base":  "knowledge-base",
  "conversations":   "conversations",
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function SectionContent({ section, onNavigate, onSaveStateChange }: { section: AdminSection; onNavigate: (s: AdminSection) => void; onSaveStateChange: (state: AdminSaveState | null) => void }) {
  const resolved = resolveSection(section);

  switch (resolved) {
    case "model-defaults":   return <ModelDefaultsTab onSaveStateChange={onSaveStateChange} initialTab={MODEL_DEFAULTS_SUB_TAB[section]} />;
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
    case "financial-lines":  return <FinancialLinesTab />;
    case "benchmarks":       return <HospitalityBenchmarksTab />;
    case "notifications":    return <NotificationsTab />;
    case "navigation":       return <NavigationTab />;
    case "verification":     return <VerificationTab />;
    case "database":         return <DatabaseTab />;
    default:                 return null;
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
  const meta = sectionMeta[activeSection] ?? sectionMeta[resolved];

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
