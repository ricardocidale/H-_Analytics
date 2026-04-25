import { useMemo } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { setAiIntelligenceTabHint } from "@/lib/ai-intelligence-nav";
import {
  IconHelpCircle,
  IconBriefcase,
  IconProperties,
  IconImage,
  IconLayers,
  IconBot,
  IconBrain,
  IconBookOpen,
  IconMessageSquare,
  IconGlobe,
  IconDatabase,
  IconResearch,
  IconSettingsGear,
  IconGauge,
  IconTimer,
  IconShield,
} from "@/components/icons";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { SPECIALIST_SECTION_TO_ID } from "@/components/admin/AdminSidebar";
import type { SpecialistSection } from "@/components/admin/AdminSidebar";
import { SPECIALIST_CATALOG } from "@engine/analyst/registry/specialist-catalog";
import { ORCHESTRATOR_SPECIALIST_ID } from "@engine/analyst/identity";

interface SpecialistListItem {
  id: string;
  humanName?: string | null;
  /**
   * Task #502 — true iff this Specialist's `specialist_configs` row has
   * any non-null override of the global N+1 model defaults, the multi-
   * model toggle, or the global pipeline-policy workflow knobs. Drives
   * the "Overrides" badge on the sidebar row.
   */
  hasLlmOverrides?: boolean;
}

export type AiIntelligenceSection =
  | SpecialistSection
  | "analyst-orchestrator"
  | "ai-agents"
  | "knowledge-base"
  | "conversations"
  | "engine-health"
  | "scheduled-research"
  | "vector-bench"
  | "resources-apis"
  | "resources-sources"
  | "resources-tables"
  | "resources-benchmarks"
  | "resources-models";

interface SectionItem {
  value: AiIntelligenceSection;
  label: string;
  /**
   * Quieter secondary line shown beneath the primary label. Used by
   * Specialist rows to keep the role label (e.g. "Funding Intelligence")
   * visible while leading with the human name (e.g. "Ana"). Optional
   * because non-Specialist rows (Rebecca, Resources, System) are
   * already keyed by role and have no persona name to surface.
   */
  secondary?: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  sections: SectionItem[];
}

/**
 * Sidebar copy for a Specialist row: lead with the human name, fall back
 * to displayName / realName when the catalog hasn't been migrated yet.
 * The role label rides along as the secondary line so admins can still
 * trace the slug at a glance.
 */
function specialistRow(
  specialistId: string,
  fallbackPrimary: string,
): { primary: string; secondary?: string } {
  const def = SPECIALIST_CATALOG.find((d) => d.id === specialistId);
  if (!def) return { primary: fallbackPrimary };
  const role = def.displayName ?? def.realName;
  if (def.humanName && def.humanName !== role) {
    return { primary: def.humanName, secondary: role };
  }
  return { primary: role };
}

function specialistSection(
  value: AiIntelligenceSection,
  specialistId: string,
  fallbackPrimary: string,
  icon: React.ComponentType<{ className?: string }>,
): SectionItem {
  const { primary, secondary } = specialistRow(specialistId, fallbackPrimary);
  return { value, label: primary, secondary, icon };
}

function buildNavGroups(gasparHumanName: string): NavGroup[] {
  return [
    {
      // Task #496 — Gaspar (the Analyst orchestrator) gets a top-level
      // sidebar entry so admins can reach the Sources tab on the Analyst
      // page directly. Routes through the same SpecialistPage as the 12
      // catalog Specialists; the orchestrator id ("gaspar") is resolved
      // server-side to the `analyst` connection target.
      //
      // Task #465 — the primary label is sourced from the `/api/admin/
      // specialists` list endpoint (which already prepends a synthetic
      // Gaspar row with the override-resolved humanName) so that renaming
      // Gaspar in the Identity tab updates the sidebar immediately. The
      // role label "Orchestrator" rides along as the secondary line so the
      // entry mirrors the persona-first / role-second layout used by the
      // 12 catalog Specialists.
      id: "analyst",
      label: "The Analyst",
      icon: IconBrain,
      sections: [
        {
          value: "analyst-orchestrator",
          label: gasparHumanName,
          secondary: "Orchestrator",
          icon: IconBrain,
        },
      ],
    },
    {
      id: "management-company",
      label: "Management Company",
      icon: IconBriefcase,
      sections: [
        specialistSection("specialist-mgmt-co-funding",          "mgmt-co.funding",          "Funding",          IconBriefcase),
        specialistSection("specialist-mgmt-co-revenue",          "mgmt-co.revenue",          "Revenue",          IconBriefcase),
        specialistSection("specialist-mgmt-co-icp-intelligence", "mgmt-co.icp-intelligence", "ICP Intelligence", IconBriefcase),
      ],
    },
    {
      id: "property",
      label: "Property",
      icon: IconProperties,
      sections: [
        specialistSection("specialist-property-risk-intelligence", "property.risk-intelligence", "Risk Intelligence",  IconProperties),
        specialistSection("specialist-property-executive-summary", "property.executive-summary", "Executive Summary", IconProperties),
      ],
    },
    {
      id: "photos",
      label: "Photos",
      icon: IconImage,
      sections: [
        // Fernanda owns both photo enhancement and the render pipeline
        // as two jobs of one Specialist. Manual render controls live
        // inside her SpecialistPage (Runtime tab) — no separate entry.
        specialistSection("specialist-photos-photo-enhancer", "photos.photo-enhancer", "Photo Enhancer & Renders", IconImage),
      ],
    },
    {
      id: "portfolio-ops",
      label: "Portfolio Ops",
      icon: IconLayers,
      sections: [
        specialistSection("specialist-portfolio-ops-watchdog", "portfolio-ops.watchdog", "Portfolio Watchdog", IconLayers),
      ],
    },
    {
      // Constants & Authority Sources — Helena, Isadora, Júlia, Kamila each
      // own a slice of the Model Constants registry. Surfacing them in the
      // sidebar by human name makes the authority-sourced layer reachable
      // the same way the mgmt-co / property specialists are.
      id: "constants",
      label: "Constants & Authority Sources",
      icon: IconDatabase,
      sections: [
        specialistSection("specialist-constants-tax-research",          "constants.tax-research",          "Tax Authority Research",         IconDatabase),
        specialistSection("specialist-constants-macro-research",        "constants.macro-research",        "Macro Indicators Research",      IconDatabase),
        specialistSection("specialist-constants-depreciation-research", "constants.depreciation-research", "Depreciation Schedule Research", IconDatabase),
        specialistSection("specialist-constants-reporting-research",    "constants.reporting-research",    "Reporting Conventions Research", IconDatabase),
      ],
    },
    {
      // Letícia (Resource Builder, letter L) is a catalog stub — her admin
      // surface ships later — but she is now reachable from the sidebar by
      // human name like the other Specialists. Clicking through lands on
      // the SpecialistPage stub, which still shows the new summary panel.
      id: "resources-builder",
      label: "Resources Builder",
      icon: IconLayers,
      sections: [
        specialistSection("specialist-resources-builder", "resources.builder", "Resource Builder", IconLayers),
      ],
    },
    {
      id: "rebecca",
      label: "Rebecca AI Assistant",
      icon: IconBot,
      sections: [
        { value: "ai-agents",      label: "Configuration",   icon: IconBot },
        { value: "knowledge-base", label: "Knowledge Base",  icon: IconBookOpen },
        { value: "conversations",  label: "Conversations",   icon: IconMessageSquare },
      ],
    },
    {
      id: "resources",
      label: "Resources",
      icon: IconLayers,
      sections: [
        { value: "resources-apis",       label: "APIs",       icon: IconGlobe },
        { value: "resources-sources",    label: "Sources",    icon: IconDatabase },
        { value: "resources-tables",     label: "Tables",     icon: IconResearch },
        { value: "resources-benchmarks", label: "Benchmarks", icon: IconResearch },
        { value: "resources-models",     label: "Models",     icon: IconBrain },
      ],
    },
    {
      id: "system",
      label: "System",
      icon: IconSettingsGear,
      sections: [
        { value: "engine-health",      label: "System Health",         icon: IconGauge },
        { value: "scheduled-research", label: "Scheduled Research",    icon: IconTimer },
        { value: "vector-bench",       label: "Vector Search Latency", icon: IconBrain },
      ],
    },
  ];
}

function getGroupForSection(section: AiIntelligenceSection, groups: NavGroup[]): string {
  for (const group of groups) {
    if (group.sections.some((s) => s.value === section)) return group.id;
  }
  return "management-company";
}

interface AiIntelligenceSidebarProps {
  activeSection: AiIntelligenceSection;
  onSectionChange: (section: AiIntelligenceSection) => void;
}

export function AiIntelligenceSidebarNav({ activeSection, onSectionChange }: AiIntelligenceSidebarProps) {
  // Pull the current Specialist list so the Gaspar entry reflects any
  // Identity-tab rename without a page reload. The IdentityTab already
  // invalidates the ["/api/admin/specialists"] query on save, so the
  // sidebar updates the moment the override is persisted. Falls back to
  // the canonical "Gaspar" persona name while the query is in flight or
  // if the request fails.
  const { data: specialists } = useQuery<SpecialistListItem[]>({
    queryKey: ["/api/admin/specialists"],
  });
  const gasparHumanName = useMemo(() => {
    const row = specialists?.find((s) => s.id === ORCHESTRATOR_SPECIALIST_ID);
    return row?.humanName?.trim() || "Gaspar";
  }, [specialists]);
  const navGroups = useMemo(() => buildNavGroups(gasparHumanName), [gasparHumanName]);
  const activeGroup = getGroupForSection(activeSection, navGroups);

  // Task #502 — quick lookup of `hasLlmOverrides` keyed by Specialist id so
  // the per-row "Overrides" badge can render in O(1) inside the map below.
  // Specialists not present in the list (e.g. while the query is loading
  // or because the row is the synthetic Gaspar one) default to "no badge".
  const overrideById = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const s of specialists ?? []) {
      if (s.hasLlmOverrides) map.set(s.id, true);
    }
    return map;
  }, [specialists]);

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
          <SidebarGroup className="p-0">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Admin">
                  <Link href="/admin" data-testid="ai-intelligence-nav-admin">
                    <IconShield className="size-4 shrink-0" />
                    <span className="truncate">Admin</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>

          {navGroups.map((group) => {
            const isGroupActive = group.id === activeGroup;
            const GroupIcon = group.icon;
            return (
              <SidebarGroup key={group.id} className="p-0">
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={isGroupActive}
                      data-testid={`ai-intelligence-nav-group-${group.id}`}
                      className="font-medium pointer-events-none"
                      tabIndex={-1}
                      aria-disabled
                    >
                      <GroupIcon className="size-4 shrink-0" />
                      <span className="truncate">{group.label}</span>
                    </SidebarMenuButton>
                    <SidebarMenuSub>
                      {group.sections.map((section) => {
                        const isActive = activeSection === section.value;
                        const Icon = section.icon;
                        // Task #502 — when this row corresponds to one of
                        // the 12 catalog Specialists, look up its override
                        // status and render a small clickable "Overrides"
                        // badge that jumps the user to the LLM Config tab.
                        const specialistId = section.value in SPECIALIST_SECTION_TO_ID
                          ? SPECIALIST_SECTION_TO_ID[section.value as keyof typeof SPECIALIST_SECTION_TO_ID]
                          : null;
                        const hasOverride = specialistId
                          ? overrideById.get(specialistId) === true
                          : false;
                        return (
                          <SidebarMenuSubItem key={section.value} className="relative">
                            <SidebarMenuSubButton
                              isActive={isActive}
                              onClick={() => onSectionChange(section.value)}
                              data-testid={`ai-intelligence-nav-${section.value}`}
                              className={`cursor-pointer ${section.secondary ? "h-auto py-1.5" : ""} ${hasOverride ? "pr-16" : ""}`}
                            >
                              <Icon className="size-4 shrink-0" />
                              {section.secondary ? (
                                <span className="flex flex-col min-w-0 leading-tight flex-1">
                                  <span
                                    className="truncate"
                                    data-testid={`ai-intelligence-nav-${section.value}-primary`}
                                  >
                                    {section.label}
                                  </span>
                                  <span
                                    className="truncate text-[11px] font-normal text-muted-foreground"
                                    data-testid={`ai-intelligence-nav-${section.value}-secondary`}
                                  >
                                    {section.secondary}
                                  </span>
                                </span>
                              ) : (
                                <span className="truncate flex-1">{section.label}</span>
                              )}
                            </SidebarMenuSubButton>
                            {/*
                              The "Overrides" badge is a clickable
                              control of its own (deep-links to the LLM
                              Config tab) so it must NOT nest inside the
                              SidebarMenuSubButton, which Radix renders
                              as an <a>. Nested interactive elements are
                              invalid HTML and produce inconsistent click
                              behavior across browsers. We render the
                              badge as an absolutely-positioned sibling
                              inside the <li> instead — visually inline,
                              structurally a peer of the row anchor.
                            */}
                            {hasOverride && specialistId && (
                              <TooltipProvider>
                                <Tooltip delayDuration={200}>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setAiIntelligenceTabHint(specialistId, "llm-config");
                                        onSectionChange(section.value);
                                      }}
                                      className="absolute right-1.5 top-1/2 -translate-y-1/2 z-10 inline-flex items-center rounded-sm border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-300 hover:bg-amber-400/20 hover:text-amber-200"
                                      data-testid={`ai-intelligence-nav-${section.value}-overrides-badge`}
                                      aria-label="Has LLM overrides — open LLM Config tab"
                                    >
                                      Overrides
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="right">
                                    <p className="text-xs">
                                      This Specialist diverges from the global LLM defaults.
                                      Click to jump to its LLM Config tab.
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </SidebarMenuSubItem>
                        );
                      })}
                    </SidebarMenuSub>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroup>
            );
          })}

          <SidebarGroup className="p-0 mt-1 pt-2 border-t border-border/60">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Help">
                  <Link href="/help" data-testid="ai-intelligence-nav-help">
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

export { SPECIALIST_SECTION_TO_ID };
