import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import {
  IconHelpCircle,
  IconBot,
  IconBrain,
  IconBookOpen,
  IconMessageSquare,
  IconSettingsGear,
  IconGauge,
  IconTimer,
  IconShield,
  IconPeople,
  IconCpu,
  IconActivity,
  IconWand2,
  IconList,
} from "@/components/icons";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { SPECIALIST_SECTION_TO_ID } from "@/components/admin/AdminSidebar";
import type { SpecialistSection } from "@/components/admin/AdminSidebar";
import { ORCHESTRATOR_SPECIALIST_ID } from "@engine/analyst/identity";
import {
  ANALYST_BRAND,
  NAV_GROUP_LABELS,
  AGENTS,
} from "@/lib/agent-taxonomy";

interface SpecialistListItem {
  id: string;
  humanName?: string | null;
  hasLlmOverrides?: boolean;
}

/**
 * Canonical section union for the Intelligence sidebar.
 *
 * Restructured per agent-taxonomy task (Task #1129):
 *   Analyst       — Gustavo [Orchestrator] card + Specialists directory
 *   Agents        — Rebecca (config/KB/conversations) + Iris
 *   Runs          — Unified cross-type run log (Analyst / Slide / Iris)
 *   Knowledge & Resources — Knowledge Registry + Market Data
 *   System        — System Health, Scheduled Research, Vector Search Latency
 *
 * Legacy SpecialistSection values (specialist-mgmt-co-funding, etc.) are kept in
 * the union for URL deep-link backward compat — they are no longer exposed in the
 * sidebar nav but the routing in Intelligence.tsx still handles them.
 */
export type IntelligenceSection =
  | SpecialistSection
  | "analyst-orchestrator"
  | "ai-agents"
  | "knowledge-base"
  | "conversations"
  | "gustavo"
  | "iris"
  | "specialists"
  | "llm-workflows"
  | "assumption-guidance"
  | "engine-health"
  | "scheduled-research"
  | "vector-bench"
  | "resources"
  | "resources-tables"
  | "knowledge-registry"
  | "knowledge-registry-country-data"
  | "runs"
  // Agent Roster (Task #1389) — three new top-level browsing sections
  // for every Agent, Specialist, and Minion in the system. The legacy
  // "gustavo", "specialists", "iris" values stay in the union (and are
  // still routed by Intelligence.tsx) so any existing deep links keep
  // resolving while the roster pages take over the sidebar entry points.
  | "roster-agents"
  | "roster-specialists"
  | "roster-minions";

interface SectionItem {
  value: IntelligenceSection;
  label: string;
  /**
   * Quieter secondary line beneath the primary label. Used by persona-named
   * items (Gustavo) to keep the role label visible while leading with the
   * human name. See specialist-persona-naming skill.
   */
  secondary?: string;
  icon: React.ComponentType<{ className?: string }>;
  tooltip?: string;
}

interface NavGroup {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  sections: SectionItem[];
}

/**
 * Canonical Intelligence nav tree (agent-taxonomy Task #1129):
 *
 *   Analyst
 *     Gustavo        (Orchestrator info — read-only)
 *     Specialists    (all 16 in one accordion directory)
 *     Assumption Guidance
 *   Agents
 *     Rebecca        (Configuration / Knowledge Base / Conversations)
 *     Iris           (Resource Maintainer)
 *   Runs             (unified cross-type log)
 *   Knowledge & Resources
 *     Knowledge Registry
 *     Country Economic Data
 *     Market Data
 *   System
 *     System Health
 *     Scheduled Research
 *     Vector Search Latency
 *     LLMs
 */
function buildNavGroups(_gustavoHumanName: string): NavGroup[] {
  return [
    {
      id: "agent-roster",
      label: "Agent Roster",
      icon: IconBrain,
      sections: [
        {
          value: "roster-agents",
          label: "Agents",
          icon: IconBot,
          tooltip: "Every Agent in the system — Rebecca, Iris, Gustavo, and any other agent-class entities. See status at a glance and run a live responsiveness probe.",
        },
        {
          value: "roster-specialists",
          label: "Specialists",
          icon: IconPeople,
          tooltip: "Every research Specialist — review status and run a live responsiveness probe.",
        },
        {
          value: "roster-minions",
          label: "Minions",
          icon: IconActivity,
          tooltip: "Deterministic helper minions used across pipelines. No LLM probe applies; shown for visibility.",
        },
      ],
    },
    {
      id: "agents",
      label: "Conversational",
      icon: IconBot,
      sections: [
        { value: "ai-agents",      label: "Rebecca",        secondary: AGENTS.rebecca.role, icon: IconBot          },
        { value: "knowledge-base", label: "Knowledge Base",  icon: IconBookOpen     },
        { value: "conversations",  label: "Conversations",   icon: IconMessageSquare },
        {
          value: "iris",
          label: AGENTS.iris.humanName,
          secondary: AGENTS.iris.role,
          icon: IconWand2,
          tooltip: "Iris — Resource Maintainer. Keeps resource registries and reference data current.",
        },
      ],
    },
    {
      id: "runs",
      label: NAV_GROUP_LABELS.runs,
      icon: IconList,
      sections: [
        {
          value: "runs",
          label: "All Runs",
          icon: IconList,
          tooltip: "Unified log of all agent runs — Analyst research, Slide Factory, and Iris. Filter by type, agent, status, or date.",
        },
      ],
    },
    {
      id: "knowledge-resources",
      label: NAV_GROUP_LABELS.knowledgeResources,
      icon: IconBookOpen,
      sections: [
        {
          value: "knowledge-registry",
          label: "Knowledge Registry",
          icon: IconBookOpen,
        },
        {
          value: "knowledge-registry-country-data",
          label: "Country Economic Data",
          icon: IconActivity,
        },
        {
          value: "resources",
          label: "Resources Catalog",
          icon: IconSettingsGear,
        },
        {
          value: "resources-tables",
          label: "Market Data",
          icon: IconActivity,
        },
      ],
    },
    {
      id: "system",
      label: NAV_GROUP_LABELS.system,
      icon: IconSettingsGear,
      sections: [
        {
          value: "assumption-guidance",
          label: "Assumption Guidance",
          icon: IconActivity,
          tooltip: "Analyst-generated calibration insights — suggested ranges with sources for financial assumptions",
        },
        { value: "engine-health",      label: "System Health",         icon: IconGauge  },
        { value: "scheduled-research", label: "Scheduled Research",    icon: IconTimer  },
        { value: "vector-bench",       label: "Vector Search Latency", icon: IconBrain  },
        {
          value: "llm-workflows",
          label: "LLMs",
          icon: IconCpu,
          tooltip: "Language model configuration for each research workflow — the only place to manage LLM settings",
        },
      ],
    },
  ];
}

function getGroupForSection(section: IntelligenceSection, groups: NavGroup[]): string {
  for (const group of groups) {
    if (group.sections.some((s) => s.value === section)) return group.id;
  }
  // Legacy/deep-link sections that no longer have a row in the sidebar:
  //   - per-Specialist deep links + the Analyst Orchestrator detail page
  //     are conceptually part of the Specialists roster
  //   - the legacy `gustavo` / `specialists` / `iris` detail sections live
  //     inside the Agent Roster group as well (they're the same entities,
  //     just routed via the older URLs)
  if (
    section in SPECIALIST_SECTION_TO_ID ||
    section === "analyst-orchestrator" ||
    section === "gustavo" ||
    section === "specialists" ||
    section === "iris"
  ) {
    return "agent-roster";
  }
  // Rebecca sub-sections that aren't in the nav map to the conversational group
  return "agents";
}

interface IntelligenceSidebarProps {
  activeSection: IntelligenceSection;
  onSectionChange: (section: IntelligenceSection) => void;
}

export function IntelligenceSidebarNav({ activeSection, onSectionChange }: IntelligenceSidebarProps) {
  // Pull the live Specialist list so Gustavo's sidebar label reflects any
  // Identity-tab rename without a page reload. Falls back to "Gustavo"
  // (the canonical human name — NOT "gaspar" which is the internal system
  // ID only). See hplus-admin-nav-ia Rule 7.
  const { data: specialists } = useQuery<SpecialistListItem[]>({
    queryKey: ["/api/admin/specialists"],
  });

  const gustavoHumanName = useMemo(() => {
    const row = specialists?.find((s) => s.id === ORCHESTRATOR_SPECIALIST_ID);
    return row?.humanName?.trim() || "Gustavo";
  }, [specialists]);

  const navGroups = useMemo(
    () => buildNavGroups(gustavoHumanName),
    [gustavoHumanName],
  );
  const activeGroup = getGroupForSection(activeSection, navGroups);

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
                  <Link href="/admin" data-testid="intelligence-nav-admin">
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
                    <SidebarGroupLabel
                      data-testid={`intelligence-nav-group-${group.id}`}
                      className={cn("mb-0.5 gap-1.5", isGroupActive && "text-sidebar-foreground")}
                    >
                      <GroupIcon className="size-3.5 shrink-0" />
                      <span className="truncate tracking-wide">{group.label}</span>
                    </SidebarGroupLabel>
                    <SidebarMenuSub>
                      {group.sections.map((section) => {
                        const isActive = activeSection === section.value;
                        const Icon = section.icon;
                        return (
                          <SidebarMenuSubItem key={section.value}>
                            <SidebarMenuSubButton
                              isActive={isActive}
                              onClick={() => onSectionChange(section.value)}
                              data-testid={`intelligence-nav-${section.value}`}
                              title={section.tooltip}
                              className={`cursor-pointer ${section.secondary ? "h-auto py-1.5" : ""}`}
                            >
                              <Icon className="size-4 shrink-0" />
                              {section.secondary ? (
                                <span className="flex flex-col min-w-0 leading-tight flex-1">
                                  <span
                                    className="truncate"
                                    data-testid={`intelligence-nav-${section.value}-primary`}
                                  >
                                    {section.label}
                                  </span>
                                  <span
                                    className="truncate text-[11px] font-normal text-muted-foreground"
                                    data-testid={`intelligence-nav-${section.value}-secondary`}
                                  >
                                    {section.secondary}
                                  </span>
                                </span>
                              ) : (
                                <span className="truncate flex-1">{section.label}</span>
                              )}
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

          <SidebarGroup className="p-0 mt-1 pt-2 border-t border-border/60">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Help">
                  <Link href="/help" data-testid="intelligence-nav-help">
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
