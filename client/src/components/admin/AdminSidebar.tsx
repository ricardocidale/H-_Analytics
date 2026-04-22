import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { X } from "@/components/icons/themed-icons";
import {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  IconMenu, IconHelpCircle, IconPeople, IconUserCog, IconActivity, IconImage, IconSwatchBook,
  IconPanelLeft, IconProperties,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  IconBot, IconBrain, IconFileCheck, IconDatabase, IconShield, IconSettingsGear, IconSliders,
  IconBriefcase, IconResearch, IconBookOpen, IconPhone, IconExport, IconScenarios, IconPalette,
  IconLayers, IconShieldCheck, IconGlobe, IconTimer, IconGauge, IconMessageSquare,
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
  | "engine-dashboard" | "data-sources" | "pipeline-config" | "qa-sandbox" | "scheduled-research" | "financial-lines" | "benchmarks" | "analyst-tables" | "vector-bench"
  | "navigation" | "notifications" | "verification" | "database"
  | "photos-renders"
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
  | "reports-exports"
  // Steady State (Defaults & Constants)
  | "defaults-management-company" | "defaults-property" | "defaults-market-macro"
  | "constants"
  // Resources control plane (P4) — canonical SoT for APIs/Sources/Tables/Benchmarks/Models
  | "resources-apis" | "resources-sources" | "resources-tables" | "resources-benchmarks" | "resources-models"
  // AI Research → Specialists (P5). The 7 read-only assignment+health surface
  // sections are derived from `SPECIALIST_SECTION_TO_ID` keys below — single
  // source of truth, compile-enforced. To add a Specialist section, edit ONLY
  // the map; this union widens automatically. See P6d packet for the rationale.
  | SpecialistSection;

/**
 * Map admin sidebar section value → canonical Specialist id used by
 * /api/admin/specialists/:id. The section enum uses dashes throughout
 * (URL-safe) while the catalog uses dotted ids — this table is the only
 * place we cross the boundary.
 *
 * Single source of truth: this map's keys feed `SpecialistSection` (above)
 * via `keyof typeof`. Test `tests/client/admin-sidebar-section-map.test.ts`
 * asserts the map is bijective with `SPECIALIST_CATALOG`.
 */
export const SPECIALIST_SECTION_TO_ID = {
  "specialist-mgmt-co-funding": "mgmt-co.funding",
  "specialist-mgmt-co-revenue": "mgmt-co.revenue",
  "specialist-mgmt-co-icp-intelligence": "mgmt-co.icp-intelligence",
  "specialist-property-risk-intelligence": "property.risk-intelligence",
  "specialist-property-executive-summary": "property.executive-summary",
  "specialist-photos-photo-enhancer": "photos.photo-enhancer",
  "specialist-portfolio-ops-watchdog": "portfolio-ops.watchdog",
} as const satisfies Record<string, string>;

export type SpecialistSection = keyof typeof SPECIALIST_SECTION_TO_ID;

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
  "knowledge-base": "ai-agents",
  // Groups and companies removed — redirect to users
  "groups": "users",
  "companies": "users",
  "services-fees": "model-defaults",
  "company-profile": "model-defaults",
  "financial-defaults": "model-defaults",
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
  // Steady State → all live inside the model-defaults page; sub-tab is selected
  // by Admin.tsx's MODEL_DEFAULTS_SUB_TAB map keyed off the alias.
  "defaults-management-company": "model-defaults",
  "defaults-property": "model-defaults",
  "defaults-market-macro": "model-defaults",
  "constants": "model-defaults",
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
      description: "Services, fees & financial statement lines",
      sections: [
        { value: "services-fees",      label: "Services & Fees",           icon: IconBriefcase },
        { value: "financial-lines",    label: "Financial Statement Lines", icon: IconCalculator },
      ],
    },
    {
      id: "properties",
      label: "Properties",
      icon: IconProperties,
      description: "Property defaults, required fields & photos",
      sections: [
        { value: "hotel-defaults",  label: "Defaults",                     icon: IconSliders },
        { value: "required-fields", label: "Required Fields",              icon: IconFileCheck },
        { value: "photos-renders",  label: "Photos & Renders",             icon: IconImage },
      ],
    },
    {
      id: "ai-research",
      label: "AI Research",
      icon: IconBrain,
      description: "Specialists, sources, LLMs & system health",
      sections: [
        // Specialists (P5). One row per Specialist in the catalog. Letter
        // prefix matches the catalog identity so admins can speak in the
        // same vocabulary as engineering ("Specialist A — Funding").
        { value: "specialist-mgmt-co-funding",            label: "MC · A — Funding",          icon: IconBriefcase },
        { value: "specialist-mgmt-co-revenue",            label: "MC · B — Revenue",          icon: IconBriefcase },
        { value: "specialist-mgmt-co-icp-intelligence",   label: "MC · C — ICP Intelligence", icon: IconBriefcase },
        { value: "specialist-property-risk-intelligence", label: "Property · D — Risk Intelligence", icon: IconProperties },
        { value: "specialist-property-executive-summary", label: "Property · E — Executive Summary", icon: IconProperties },
        { value: "specialist-photos-photo-enhancer",      label: "Photos · F — Photo Enhancer", icon: IconImage },
        { value: "specialist-portfolio-ops-watchdog",     label: "Portfolio Ops · G — Watchdog", icon: IconGauge },
        // Legacy AI Research surfaces. Kept for now; P6 will retire those
        // covered by the Resources/Specialist split.
        { value: "sources-apis",       label: "Sources & APIs",       icon: IconGlobe },
        { value: "llm-config",         label: "LLM Configuration",    icon: IconLayers },
        { value: "engine-health",      label: "System Health",        icon: IconGauge },
        { value: "scheduled-research", label: "Scheduled Research",   icon: IconTimer },
        { value: "benchmarks",         label: "Hospitality Benchmarks", icon: IconResearch },
        { value: "analyst-tables",     label: "Analyst Tables",       icon: IconResearch },
        { value: "vector-bench",       label: "Vector Search Latency", icon: IconGauge },
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
    {
      id: "resources",
      label: "Resources",
      icon: IconLayers,
      description: "Canonical control plane: APIs, Sources, Tables, Benchmarks & Models",
      sections: [
        { value: "resources-apis",       label: "APIs",       icon: IconGlobe },
        { value: "resources-sources",    label: "Sources",    icon: IconDatabase },
        { value: "resources-tables",     label: "Tables",     icon: IconResearch },
        { value: "resources-benchmarks", label: "Benchmarks", icon: IconResearch },
        { value: "resources-models",     label: "Models",     icon: IconBrain },
      ],
    },
    {
      id: "defaults",
      label: "Defaults",
      icon: IconSliders,
      description: "Defaults applied to new entities and immutable model constants",
      sections: [
        { value: "defaults-management-company", label: "Management Company", icon: IconBriefcase },
        { value: "defaults-property",           label: "Property",           icon: IconProperties },
        { value: "defaults-market-macro",       label: "Market & Macro",     icon: IconGlobe },
        { value: "constants",                   label: "Constants",          icon: IconCalculator },
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
  const navGroups = useMemo(() => buildNavGroups(), []);

  const { data: freshnessCounts } = useQuery<FreshnessCounts>({
    queryKey: ["/api/admin/intelligence/freshness-counts"],
    refetchInterval: 60_000,
  });
  const resolved = resolveSection(activeSection);
  const activeGroup = getGroupForSection(resolved, navGroups);

  const handleSelect = (section: AdminSection) => {
    onSectionChange(section);
    setMobileOpen(false);
  };

  const sidebarContent = (
    <SidebarProvider
      defaultOpen
      className="min-h-0 w-full bg-transparent"
      style={{ "--sidebar-width": "100%" } as React.CSSProperties}
    >
      <Sidebar
        collapsible="none"
        className="w-full bg-transparent text-foreground"
      >
        <SidebarContent className="bg-transparent gap-1 px-2 py-2">
          {navGroups.map((group) => {
            const isGroupActive = group.id === activeGroup;
            const showFreshnessBadge =
              group.id === "ai-research" &&
              !!freshnessCounts &&
              (freshnessCounts.stale > 0 || freshnessCounts.missing > 0);
            const freshnessTotal = freshnessCounts
              ? freshnessCounts.stale + freshnessCounts.missing
              : 0;
            const freshnessSeverity =
              (freshnessCounts?.missing ?? 0) > 0 ? "missing" : "stale";

            // Single-section groups render as a flat top-level item (no submenu).
            if (group.sections.length === 1) {
              const only = group.sections[0];
              const sectionResolved = resolveSection(only.value);
              const isAlias = only.value !== sectionResolved;
              const isActive = isAlias
                ? activeSection === only.value
                : resolved === sectionResolved;
              const Icon = only.icon;
              return (
                <SidebarGroup key={group.id} className="p-0">
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        isActive={isActive}
                        onClick={() => handleSelect(only.value)}
                        data-testid={`admin-nav-${only.value}`}
                        tooltip={group.label}
                      >
                        <Icon className="size-4 shrink-0" />
                        <span className="truncate">{group.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroup>
              );
            }

            // Multi-section groups render as collapsible submenus.
            const GroupIcon = group.icon;
            return (
              <Collapsible
                key={group.id}
                defaultOpen={isGroupActive}
                className="group/collapsible"
                asChild
              >
                <SidebarGroup className="p-0">
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          isActive={isGroupActive}
                          tooltip={group.label}
                          data-testid={`admin-nav-group-${group.id}`}
                          className="font-medium"
                        >
                          <GroupIcon className="size-4 shrink-0" />
                          <span className="truncate">{group.label}</span>
                          {showFreshnessBadge && (
                            <SidebarMenuBadge
                              data-testid="intelligence-freshness-badge"
                              className={cn(
                                "ml-auto mr-6",
                                freshnessSeverity === "missing"
                                  ? "bg-red-500/15 text-red-600 dark:text-red-400"
                                  : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                              )}
                            >
                              {freshnessTotal}
                            </SidebarMenuBadge>
                          )}
                          <ChevronRight className="ml-auto size-4 shrink-0 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="overflow-hidden data-[state=closed]:hidden">
                        <SidebarMenuSub>
                          {group.sections.map((section) => {
                            const sectionResolved = resolveSection(section.value);
                            const isAlias = section.value !== sectionResolved;
                            const isActive = isAlias
                              ? activeSection === section.value
                              : resolved === sectionResolved;
                            const Icon = section.icon;
                            return (
                              <SidebarMenuSubItem key={section.value}>
                                <SidebarMenuSubButton
                                  isActive={isActive}
                                  onClick={() => handleSelect(section.value)}
                                  data-testid={`admin-nav-${section.value}`}
                                  className="cursor-pointer"
                                >
                                  <Icon className="size-4 shrink-0" />
                                  <span className="truncate">{section.label}</span>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            );
                          })}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroup>
              </Collapsible>
            );
          })}

          {/* Logs */}
          <SidebarGroup className="p-0 mt-1 pt-2 border-t border-border/60">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={resolved === "activity"}
                  onClick={() => handleSelect("activity")}
                  data-testid="admin-nav-activity"
                  tooltip="Activity"
                >
                  <IconActivity className="size-4 shrink-0" />
                  <span className="truncate">Activity</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>

          {/* Help */}
          <SidebarGroup className="p-0 mt-1 pt-2 border-t border-border/60">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Help">
                  <Link href="/help" data-testid="admin-nav-help">
                    <IconHelpCircle className="size-4 shrink-0" />
                    <span className="truncate">Help</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    </SidebarProvider>
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
