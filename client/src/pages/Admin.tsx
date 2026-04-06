import { useState, useCallback, useEffect } from "react";
import Layout from "@/components/Layout";
import { PageHeader } from "@/components/ui/page-header";
import { TooltipProvider } from "@/components/ui/tooltip";
import { type AdminSection } from "@/components/admin/AdminSidebar";
import {
  CompaniesTab, ActivityTab, VerificationTab,
  DatabaseTab,
} from "@/components/admin";
import PeopleTab from "@/components/admin/PeopleTab";
import { IcpContent } from "@/pages/Icp";
import GroupsTab from "@/components/admin/GroupsTab";
import LogosTab from "@/components/admin/LogosTab";
import ThemesTab from "@/components/admin/ThemesTab";
import IconCustomizationTab from "@/components/admin/IconCustomizationTab";
import ResearchCenterTab from "@/components/admin/ResearchCenterTab";
import NavigationTab from "@/components/admin/NavigationTab";
import AIAgentsTab from "@/components/admin/AIAgentsTab";
import LLMsTab from "@/components/admin/LLMsTab";
import SourcesTab from "@/components/admin/SourcesTab";
import IntegrationHealthTab from "@/components/admin/IntegrationHealthTab";
import IntegrationsTab from "@/components/admin/IntegrationsTab";
import NotificationsTab from "@/components/admin/NotificationsTab";
import ModelDefaultsTab from "@/components/admin/ModelDefaultsTab";
import ExportsTab from "@/components/admin/ExportsTab";
import ScenariosTab from "@/components/admin/ScenariosTab";
import { AnimatedPage } from "@/components/graphics/AnimatedPage";
import { ErrorBoundary, SelfHealingBoundary } from "@/components/ErrorBoundary";
import { IconAlertTriangle } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { SaveButton } from "@/components/ui/save-button";
import { useAdminSection } from "@/lib/admin-nav";
import type { AdminSaveState } from "@/components/admin/save-state";

export type { AdminSaveState };

const sectionMeta: Record<AdminSection, { title: string; subtitle: string }> = {
  "model-defaults": { title: "Model Defaults",      subtitle: "Financial defaults and seed values for new entities" },
  users:            { title: "Users",                subtitle: "Manage user accounts and assignments" },
  activity:         { title: "Activity",             subtitle: "Login logs, audit trail, and session monitoring" },
  icp:              { title: "Ideal Customer Profile", subtitle: "Define the target property type for AI research" },
  companies:        { title: "Companies",            subtitle: "Manage companies of interest" },
  groups:           { title: "Groups",               subtitle: "User groups for branded experiences" },
  scenarios:        { title: "Scenarios",             subtitle: "Manage all scenarios, ownership, and access grants" },
  logos:            { title: "Logos",                 subtitle: "Upload and manage platform logos" },
  themes:           { title: "Themes",                subtitle: "Color themes and visual identity" },
  icons:            { title: "Icons",                  subtitle: "Browse, compare, and customize icon libraries across the platform" },
  exports:          { title: "Exports",               subtitle: "Configure content, orientation, and layout for all report exports" },
  "ai-agents":     { title: "AI Agents",             subtitle: "Configure and manage your AI text assistant" },
  llms:             { title: "LLMs",                  subtitle: "Configure AI model vendors and selections for research, reports, and chatbots" },
  sources:          { title: "Sources",               subtitle: "Manage research sources — URLs and uploaded files organized by domain" },
  research:         { title: "Research Center",      subtitle: "Strategic intelligence hub — ICP company research, property benchmarks, market analysis, and AI engine" },
  notifications:    { title: "Notifications",         subtitle: "Email channels, alert rules, and delivery tracking" },
  navigation:       { title: "Navigation",           subtitle: "Control which sidebar pages are visible to users" },
  verification:     { title: "Verification",         subtitle: "Independent GAAP financial audit and compliance" },
  database:         { title: "Database",             subtitle: "Entity monitoring, seed data, and canonical sync" },
  "cache-services": { title: "Cache & Services",     subtitle: "Service health, circuit breakers, and cache management" },
  integrations:     { title: "Integrations",          subtitle: "External APIs and scrapers — toggle, configure, and monitor data sources" },
};

function SectionContent({ section, onNavigate, onSaveStateChange }: { section: AdminSection; onNavigate: (s: AdminSection) => void; onSaveStateChange: (state: AdminSaveState | null) => void }) {
  switch (section) {
    case "model-defaults":   return <ModelDefaultsTab onSaveStateChange={onSaveStateChange} />;
    case "users":            return <PeopleTab />;
    case "activity":         return <ActivityTab />;
    case "icp":              return (
      <SelfHealingBoundary>
        <IcpContent onSaveStateChange={onSaveStateChange} />
      </SelfHealingBoundary>
    );
    case "companies":        return <CompaniesTab />;
    case "groups":           return <GroupsTab />;
    case "scenarios":        return <ScenariosTab />;
    case "logos":            return <LogosTab />;
    case "themes":           return <ThemesTab />;
    case "icons":            return <IconCustomizationTab />;
    case "exports":          return <ExportsTab />;
    case "notifications":    return <NotificationsTab />;
    case "navigation":       return <NavigationTab />;
    case "research":         return <ResearchCenterTab onSaveStateChange={onSaveStateChange} />;
    case "ai-agents":       return (
      <ErrorBoundary fallback={
        <div className="mt-6 p-8 flex flex-col items-center gap-4 text-center rounded-xl border border-accent-pop/20 bg-accent-pop/10">
          <IconAlertTriangle className="w-10 h-10 text-accent-pop" />
          <div>
            <p className="font-semibold text-foreground">AI Agents configuration failed to load</p>
            <p className="text-sm text-muted-foreground mt-1">A component error occurred. Reload the page to try again.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </div>
      }><AIAgentsTab onSaveStateChange={onSaveStateChange} /></ErrorBoundary>
    );
    case "llms":             return <LLMsTab onSaveStateChange={onSaveStateChange} />;
    case "sources":          return <SourcesTab onSaveStateChange={onSaveStateChange} />;
    case "verification":     return <VerificationTab />;
    case "database":         return <DatabaseTab />;
    case "cache-services":   return <IntegrationHealthTab />;
    case "integrations":     return <IntegrationsTab />;
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

  const meta = sectionMeta[activeSection];

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

          <div className="space-y-6" data-testid={`admin-content-${activeSection}`}>
            <SectionContent section={activeSection} onNavigate={setActiveSection} onSaveStateChange={handleSaveStateChange} />
          </div>
        </div>
      </Layout>
    </TooltipProvider>
    </AnimatedPage>
  );
}
