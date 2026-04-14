import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { X } from "@/components/icons/themed-icons";
import {
  IconMenu, IconHelpCircle, IconPeople, IconUserCog, IconActivity, IconImage, IconSwatchBook,
  IconPanelLeft, IconProperties,
  IconBot, IconBrain, IconFileCheck, IconDatabase, IconShield, IconSettingsGear, IconSliders,
  IconBriefcase, IconResearch, IconBookOpen, IconPhone, IconExport, IconScenarios, IconPalette,
  IconLayers, IconShieldCheck, IconGlobe, IconTimer, IconDashboard, IconGauge, IconMessageSquare,
  IconCalculator,
} from "@/components/icons";
import { Link } from "wouter";

interface FreshnessCounts {
  total: number;
  current: number;
  stale: number;
  missing: number;
  running: number;
}

export type AdminSection =
  // Canonical sections (have real components)
  | "model-defaults"
  | "users" | "activity"
  | "companies" | "groups" | "scenarios" // companies kept as alias → redirects to users
  | "brand" | "exports"
  | "ai-agents" | "knowledge-base" | "conversations"
  | "engine-dashboard" | "data-sources" | "pipeline-config" | "qa-sandbox" | "scheduled-research" | "financial-lines" | "benchmarks"
  | "navigation" | "notifications" | "verification" | "database"
  // Legacy aliases (redirect to canonical)
  | "icp" | "logos" | "themes" | "icons"
  | "llms" | "sources" | "model-routing"
  | "cache-services" | "integrations" | "api-dashboard"
  | "coverage-analytics" | "pipeline-policies" | "source-registry"
  | "system-intelligence" | "research"
  // New 10-block navigation aliases
  | "financial-defaults" | "services-fees" | "company-profile"
  | "hotel-defaults" | "rental-defaults" | "required-fields"
  | "sources-apis" | "llm-config" | "engine-health"
  | "user-management"
  | "default-assignments"
  | "rebecca-config" | "themes-appearance"
  | "app-settings"
  | "testing-verification"
  | "reports-exports";

const SECTION_REDIRECTS: Partial<Record<AdminSection, AdminSection>> = {
  // Legacy aliases
  "icp": "engine-dashboard",
  "logos": "brand",
  "themes": "brand",
  "icons": "brand",
  "llms": "data-sources",
  "model-routing": "pipeline-config",
  "cache-services": "engine-dashboard",
  "integrations": "data-sources",
  "api-dashboard": "data-sources",
  "coverage-analytics": "engine-dashboard",
  "pipeline-policies": "pipeline-config",
  "source-registry": "data-sources",
  "system-intelligence": "engine-dashboard",
  "research": "engine-dashboard",
  "sources": "data-sources",
  "conversations": "ai-agents",
  // Groups and companies removed — redirect to users
  "groups": "users",
  "companies": "users",
  // New 10-block aliases → canonical sections
  "financial-defaults": "model-defaults",
  "services-fees": "users",
  "company-profile": "users",
  "hotel-defaults": "model-defaults",
  "rental-defaults": "model-defaults",
  "required-fields": "model-defaults",
  "sources-apis": "data-sources",
  "llm-config": "pipeline-config",
  "engine-health": "engine-dashboard",
  "user-management": "users",
  "default-assignments": "scenarios",
  "rebecca-config": "ai-agents",
  "themes-appearance": "brand",
  "app-settings": "notifications",
  "testing-verification": "verification",
  "reports-exports": "exports",
};

export function resolveSection(section: AdminSection): AdminSection {
  return SECTION_REDIRECTS[section] ?? section;
}

interface SectionItem {
  value: AdminSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  sections: SectionItem[];
}

function buildNavGroups(): NavGroup[] {
  return [
    {
      id: "management-company",
      label: "Management Company",
      icon: IconBriefcase,
      description: "Services, fees, statement lines & defaults",
      sections: [
        { value: "services-fees",      label: "Services & Fees",           icon: IconBriefcase },
        { value: "financial-lines",    label: "Financial Statement Lines", icon: IconCalculator },
        { value: "financial-defaults", label: "Defaults",                  icon: IconSliders },
      ],
    },
    {
      id: "properties",
      label: "Properties",
      icon: IconProperties,
      description: "Property model defaults and configuration",
      sections: [
        { value: "hotel-defaults",  label: "Hotel Model Defaults",         icon: IconDashboard },
        { value: "rental-defaults", label: "Luxury Rental Defaults",       icon: IconGlobe },
        { value: "required-fields", label: "Required Fields Config",       icon: IconFileCheck },
      ],
    },
    {
      id: "ai-research",
      label: "AI Research Engines",
      icon: IconBrain,
      description: "Sources, LLMs & engine health",
      sections: [
        { value: "sources-apis",       label: "Sources & APIs",       icon: IconGlobe },
        { value: "llm-config",         label: "LLM Configuration",    icon: IconLayers },
        { value: "engine-health",      label: "Engine Health",        icon: IconGauge },
        { value: "scheduled-research", label: "Scheduled Research",   icon: IconTimer },
        { value: "benchmarks",         label: "Hospitality Benchmarks", icon: IconResearch },
      ],
    },
    {
      id: "users",
      label: "Users",
      icon: IconPeople,
      description: "User accounts and assignments",
      sections: [
        { value: "users", label: "User Management", icon: IconPeople },
      ],
    },
    {
      id: "scenarios",
      label: "Scenarios",
      icon: IconScenarios,
      description: "Scenario management and assignments",
      sections: [
        { value: "scenarios",           label: "All Scenarios",      icon: IconScenarios },
        { value: "default-assignments", label: "Default Assignments", icon: IconUserCog },
      ],
    },
    {
      id: "rebecca",
      label: "Rebecca AI Assistant",
      icon: IconBot,
      description: "Configuration, knowledge base & conversations",
      sections: [
        { value: "ai-agents",     label: "Configuration",  icon: IconBot },
        { value: "knowledge-base", label: "Knowledge Base", icon: IconBookOpen },
        { value: "conversations", label: "Conversations",   icon: IconMessageSquare },
      ],
    },
    {
      id: "themes",
      label: "Themes & Appearance",
      icon: IconSwatchBook,
      description: "Logos, themes, and icon customization",
      sections: [
        { value: "brand", label: "Brand & Appearance", icon: IconPalette },
      ],
    },
    {
      id: "app-settings",
      label: "App Settings",
      icon: IconSettingsGear,
      description: "Notifications, navigation & system",
      sections: [
        { value: "notifications", label: "Notifications", icon: IconPhone },
        { value: "navigation",    label: "Navigation",    icon: IconPanelLeft },
        { value: "database",      label: "Database",      icon: IconDatabase },
      ],
    },
    {
      id: "testing",
      label: "Testing & Verification",
      icon: IconShieldCheck,
      description: "GAAP audit, compliance & QA",
      sections: [
        { value: "verification", label: "Verification", icon: IconFileCheck },
        { value: "qa-sandbox",   label: "QA Sandbox",   icon: IconShieldCheck },
      ],
    },
    {
      id: "reports",
      label: "Reports & Exports",
      icon: IconExport,
      description: "PDF, PPTX, Excel & CSV exports",
      sections: [
        { value: "exports", label: "Reports & Exports", icon: IconExport },
      ],
    },
  ];
}

function getGroupForSection(section: AdminSection, groups: NavGroup[]): string {
  const resolved = resolveSection(section);
  for (const group of groups) {
    if (group.sections.some((s) => resolveSection(s.value) === resolved || s.value === resolved)) return group.id;
  }
  return "management-company";
}

interface AdminSidebarProps {
  activeSection: AdminSection;
  onSectionChange: (section: AdminSection) => void;
}

export default function AdminSidebar({ activeSection, onSectionChange }: AdminSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navGroups = buildNavGroups();

  const { data: freshnessCounts } = useQuery<FreshnessCounts>({
    queryKey: ["/api/admin/intelligence/freshness-counts"],
    refetchInterval: 60_000,
  });
  const resolved = resolveSection(activeSection);
  const activeGroup = getGroupForSection(resolved, navGroups);

  const sidebarContent = (
    <nav className="flex flex-col gap-0.5 py-3 px-3">
      {navGroups.map((group) => {
        const isGroupActive = group.id === activeGroup;

        return (
          <div key={group.id} className="mb-0.5">
            <div className="px-3 pt-4 pb-1 flex items-center gap-2">
              <span
                className={cn(
                  "text-[11px] font-medium",
                  isGroupActive ? "text-primary" : "text-primary/60"
                )}
              >
                {group.label}
              </span>
              {group.id === "ai-research" && freshnessCounts && (freshnessCounts.stale > 0 || freshnessCounts.missing > 0) && (
                <span
                  data-testid="intelligence-freshness-badge"
                  className={cn(
                    "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold leading-none",
                    freshnessCounts.missing > 0
                      ? "bg-red-500/15 text-red-600 dark:text-red-400"
                      : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  )}
                >
                  {freshnessCounts.stale + freshnessCounts.missing}
                </span>
              )}
            </div>

            <div className="space-y-0.5">
              {group.sections.map((section) => {
                const sectionResolved = resolveSection(section.value);
                const isAlias = section.value !== sectionResolved;
                const isActive = isAlias
                  ? activeSection === section.value
                  : resolved === sectionResolved;
                const Icon = section.icon;
                return (
                  <Button
                    key={section.value}
                    variant="ghost"
                    onClick={() => {
                      onSectionChange(section.value);
                      setMobileOpen(false);
                    }}
                    data-testid={`admin-nav-${section.value}`}
                    className={cn(
                      "relative w-full flex items-center gap-2.5 px-3 py-[7px] h-auto rounded-lg text-left justify-start transition-all duration-150 group/item cursor-pointer",
                      isActive
                        ? "bg-muted text-foreground font-medium"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <Icon
                      className={cn(
                        "w-4 h-4 shrink-0 transition-colors",
                        isActive
                          ? "text-foreground"
                          : "text-muted-foreground group-hover/item:text-muted-foreground"
                      )}
                    />
                    <span
                      className={cn(
                        "text-[13px] transition-colors truncate",
                        isActive ? "font-medium" : "font-normal"
                      )}
                    >
                      {section.label}
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="mt-1 pt-2 border-t border-border/60">
        <div className="px-3 pt-2 pb-1">
          <span className="text-[11px] font-medium text-primary/60">
            Logs
          </span>
        </div>
        <Button
          variant="ghost"
          onClick={() => {
            onSectionChange("activity");
            setMobileOpen(false);
          }}
          data-testid="admin-nav-activity"
          className={cn(
            "relative w-full flex items-center gap-2.5 px-3 py-[7px] h-auto rounded-lg text-left justify-start transition-all duration-150 group/item cursor-pointer",
            resolved === "activity"
              ? "bg-muted text-foreground font-medium"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          )}
        >
          <IconActivity
            className={cn(
              "w-4 h-4 shrink-0 transition-colors",
              resolved === "activity"
                ? "text-foreground"
                : "text-muted-foreground group-hover/item:text-muted-foreground"
            )}
          />
          <span
            className={cn(
              "text-[13px] transition-colors truncate",
              resolved === "activity" ? "font-medium" : "font-normal"
            )}
          >
            Activity
          </span>
        </Button>
      </div>

      <div className="mt-1 pt-2 border-t border-border/60">
        <Link
          href="/help"
          data-testid="admin-nav-help"
          className="relative w-full flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-left transition-all duration-150 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          <IconHelpCircle className="w-4 h-4 shrink-0" />
          <span className="text-[13px] font-normal">Help</span>
        </Link>
      </div>
    </nav>
  );

  return (
    <>
      <Button
        variant="default"
        size="icon"
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed bottom-4 right-4 z-50 w-12 h-12 rounded-xl shadow-lg"
        data-testid="admin-mobile-menu-toggle"
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <IconMenu className="w-5 h-5" />}
      </Button>

      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          "lg:sticky lg:top-4 lg:self-start",
          "fixed inset-y-0 left-0 z-40 w-[240px]",
          "lg:relative lg:z-0",
          "transition-transform duration-300 ease-out",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="h-full lg:h-auto bg-card border border-border/80 rounded-none lg:rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-border/80">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <IconSettingsGear className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Admin</h3>
                <p className="text-[11px] text-muted-foreground">Settings & Configuration</p>
              </div>
            </div>
          </div>

          <div className="overflow-y-auto max-h-[calc(100vh-120px)] lg:max-h-[calc(100vh-200px)] scrollbar-thin">
            {sidebarContent}
          </div>
        </div>
      </aside>
    </>
  );
}

export { buildNavGroups, getGroupForSection };
export type { NavGroup, SectionItem };
