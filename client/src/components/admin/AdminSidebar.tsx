import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
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
  IconMenu, IconHelpCircle, IconPeople, IconUserCog, IconActivity, IconSwatchBook,
  IconPanelLeft, IconProperties,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  IconBot, IconBrain, IconFileCheck, IconDatabase, IconShield, IconSettingsGear, IconSliders,
  IconBriefcase, IconBookOpen, IconPhone, IconExport, IconScenarios, IconPalette,
  IconShieldCheck, IconGlobe, IconTimer, IconGauge, IconMessageSquare,
  IconCalculator, IconDashboard,
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
  | "engine-dashboard" | "data-sources" | "pipeline-config" | "qa-sandbox" | "scheduled-research" | "benchmarks" | "analyst-tables" | "vector-bench"
  | "navigation" | "notifications" | "verification" | "database"
  // Legacy aliases (redirect to canonical)
  | "logos" | "themes" | "icons"
  | "llms" | "sources" | "model-routing"
  | "cache-services" | "integrations" | "api-dashboard"
  | "coverage-analytics" | "pipeline-policies" | "source-registry"
  | "system-intelligence" | "research"
  // Sidebar item that lands on the Scenarios page with default-assignment intent.
  | "default-assignments"
  // Steady State (Defaults & Constants)
  | "defaults-management-company" | "defaults-property" | "defaults-market-macro"
  | "constants"
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
  "specialist-photos-photos-and-renders": "photos.photos-and-renders",
  "specialist-portfolio-ops-watchdog": "portfolio-ops.watchdog",
  "specialist-constants-tax-research": "constants.tax-research",
  "specialist-constants-macro-research": "constants.macro-research",
  "specialist-constants-depreciation-research": "constants.depreciation-research",
  "specialist-constants-reporting-research": "constants.reporting-research",
} as const satisfies Record<string, string>;

export type SpecialistSection = keyof typeof SPECIALIST_SECTION_TO_ID;

export const SECTION_REDIRECTS: Partial<Record<AdminSection, AdminSection>> = {
  // Legacy aliases
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
  // `required-fields` is the canonical roll-up section now (Admin → Properties
  // → Required Fields). It renders a read-only aggregate across every
  // Specialist's `candidateFields` + `fieldRequirements`. No redirect.
  "default-assignments": "scenarios",
  // Steady State → all live inside the model-defaults page; sub-tab is selected
  // by Admin.tsx's MODEL_DEFAULTS_SUB_TAB map keyed off the alias.
  "defaults-management-company": "model-defaults",
  "defaults-property": "model-defaults",
  "defaults-market-macro": "model-defaults",
  "constants": "model-defaults",
};

/**
 * Legacy in-memory deep-link aliases that are no longer part of the
 * `AdminSection` union. The Resources surface (APIs/Sources/Tables/
 * Benchmarks/Models) used to render under /admin via these section ids;
 * it now lives only under /ai-intelligence. We still accept the strings
 * here so any code that calls `setAdminSection("resources-…")` lands on
 * a sensible Admin page instead of a blank one.
 */
const LEGACY_ADMIN_SECTION_REDIRECTS: Record<string, AdminSection> = {
  "resources-apis": "defaults-management-company",
  "resources-sources": "defaults-management-company",
  "resources-tables": "defaults-management-company",
  "resources-benchmarks": "defaults-management-company",
  "resources-models": "defaults-management-company",
  // Admin Required Fields tab was removed — global required-field metadata now
  // lives per-Specialist (see SpecialistPage's RequiredFieldsTab). The
  // Properties sidebar group was also removed, so old deep links land on the
  // App Defaults page (a visible, still-existing Admin section).
  "required-fields": "model-defaults",
};

export function normalizeAdminSection(section: AdminSection | string): AdminSection {
  if (typeof section === "string" && section in LEGACY_ADMIN_SECTION_REDIRECTS) {
    return LEGACY_ADMIN_SECTION_REDIRECTS[section];
  }
  return section as AdminSection;
}

export function resolveSection(section: AdminSection): AdminSection {
  let current: AdminSection = section;
  const seen = new Set<AdminSection>();
  while (SECTION_REDIRECTS[current] && !seen.has(current)) {
    seen.add(current);
    current = SECTION_REDIRECTS[current]!;
  }
  return current;
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
      id: "financial-defaults",
      label: "Financial Defaults",
      icon: IconSliders,
      description: "Defaults applied to new entities and immutable model constants",
      sections: [
        { value: "defaults-management-company", label: "Management Company", icon: IconBriefcase },
        { value: "defaults-property",           label: "Property",           icon: IconProperties },
        { value: "defaults-market-macro",       label: "Market & Macro",     icon: IconGlobe },
        { value: "constants",                   label: "Constants",          icon: IconCalculator },
      ],
    },
    {
      id: "users",
      label: "Users",
      icon: IconPeople,
      description: "Manage user accounts and assignments",
      sections: [
        { value: "users", label: "All Users", icon: IconPeople },
      ],
    },
    {
      id: "scenarios",
      label: "Scenarios",
      icon: IconScenarios,
      description: "Scenario management and assignments",
      sections: [
        { value: "scenarios",           label: "All Scenarios",       icon: IconScenarios },
        { value: "default-assignments", label: "Default Assignments", icon: IconUserCog },
      ],
    },
    {
      id: "brand",
      label: "Brand & Appearance",
      icon: IconPalette,
      description: "Logos, themes, and icon customization",
      sections: [
        { value: "brand", label: "Brand Settings", icon: IconPalette },
      ],
    },
    {
      id: "reports",
      label: "Reports & Exports",
      icon: IconExport,
      description: "PDF, PPTX, Excel & CSV exports",
      sections: [
        { value: "exports", label: "All Exports", icon: IconExport },
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
      id: "app-settings",
      label: "App Settings",
      icon: IconSettingsGear,
      description: "Notifications, navigation, system & activity logs",
      sections: [
        { value: "notifications", label: "Notifications", icon: IconPhone },
        { value: "navigation",    label: "Navigation",    icon: IconPanelLeft },
        { value: "database",      label: "Database",      icon: IconDatabase },
        { value: "activity",      label: "Activity",      icon: IconActivity },
      ],
    },
  ];
}

function getGroupForSection(section: AdminSection, groups: NavGroup[]): string {
  const resolved = resolveSection(section);
  for (const group of groups) {
    if (group.sections.some((s) => resolveSection(s.value) === resolved || s.value === resolved)) return group.id;
  }
  return "financial-defaults";
}

interface AdminSidebarProps {
  activeSection: AdminSection;
  onSectionChange: (section: AdminSection) => void;
}

/**
 * Embeddable admin nav body — renders the proper shadcn sidebar block
 * (SidebarMenu + SidebarMenuSub) with collapsible submenus, freshness
 * badges, and tooltips. Use this when you want to drop the admin nav
 * inside an existing shell (e.g. Layout.tsx). For the standalone admin
 * sidebar with its own aside / mobile drawer, use AdminSidebar (default).
 */
export function AdminSidebarNav({ activeSection, onSectionChange }: AdminSidebarProps) {
  const navGroups = useMemo(() => buildNavGroups(), []);
  const [location] = useLocation();
  const isAiIntelligenceActive = location.startsWith("/ai-intelligence");

  // Keep the freshness query alive so the API is exercised on admin loads.
  // The badge UI was removed when the AI Research group was retired.
  useQuery<FreshnessCounts>({
    queryKey: ["/api/admin/intelligence/freshness-counts"],
    refetchInterval: 60_000,
  });
  const resolved = resolveSection(activeSection);
  const activeGroup = getGroupForSection(resolved, navGroups);

  return (
    <SidebarProvider
      defaultOpen
      className="min-h-0 w-full bg-transparent"
      style={{ "--sidebar-width": "100%" } as React.CSSProperties}
    >
      <Sidebar
        collapsible="none"
        className="w-full bg-transparent text-sidebar-foreground"
      >
        <SidebarContent className="bg-transparent gap-1 px-2 py-2">
          {/* Home — always first; returns to the main dashboard sidebar */}
          <SidebarGroup className="p-0">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Home">
                  <Link href="/" data-testid="admin-nav-home">
                    <IconDashboard className="size-4 shrink-0" />
                    <span className="truncate">Home</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>

          {/* AI Intelligence — top-level link to the dedicated AI Intelligence area */}
          <SidebarGroup className="p-0">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isAiIntelligenceActive} tooltip="AI Intelligence">
                  <Link href="/ai-intelligence" data-testid="admin-nav-ai-intelligence">
                    <IconBrain className="size-4 shrink-0" />
                    <span className="truncate">AI Intelligence</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>

          {navGroups.map((group) => {
            const isGroupActive = group.id === activeGroup;

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
                        onClick={() => onSectionChange(only.value)}
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

            // Multi-section groups follow shadcn `sidebar-03`: a non-clickable
            // group label with the submenu items rendered directly below
            // (always visible — no collapsible chevron).
            const GroupIcon = group.icon;
            return (
              <SidebarGroup key={group.id} className="p-0">
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={isGroupActive}
                      data-testid={`admin-nav-group-${group.id}`}
                      className="font-medium pointer-events-none"
                      tabIndex={-1}
                      aria-disabled
                    >
                      <GroupIcon className="size-4 shrink-0" />
                      <span className="truncate">{group.label}</span>
                    </SidebarMenuButton>
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
                              onClick={() => onSectionChange(section.value)}
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
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroup>
            );
          })}

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
}

/**
 * Standalone admin sidebar with its own aside / mobile drawer chrome.
 * Used when an admin page wants to render its own sidebar instead of
 * embedding the nav body in a shared shell.
 */
export default function AdminSidebar({ activeSection, onSectionChange }: AdminSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const handleSelect = (section: AdminSection) => {
    onSectionChange(section);
    setMobileOpen(false);
  };
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
            <AdminSidebarNav activeSection={activeSection} onSectionChange={handleSelect} />
          </div>
        </div>
      </aside>
    </>
  );
}

export { buildNavGroups, getGroupForSection };
export type { NavGroup, SectionItem };
