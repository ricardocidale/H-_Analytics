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
  IconArrowLeft,
  IconPeople,
  IconCpu,
  IconActivity,
  IconList,
  IconSparkles,
} from "@/components/icons";
import { Link } from "wouter";
import { SPECIALIST_SECTION_TO_ID } from "@/components/admin/AdminSidebar";
import type { SpecialistSection } from "@/components/admin/AdminSidebar";
import {
  ANALYST_BRAND,
  NAV_GROUP_LABELS,
  AGENTS,
} from "@/lib/agent-taxonomy";

/**
 * Canonical section union for the Intelligence sidebar.
 *
 * Restructured per agent-taxonomy task (Task #1129):
 *   Analyst       — Gustavo [Orchestrator] card + Specialists directory
 *   Agents        — Rebecca (config/KB/conversations) + Iris
 *   Logs          — Unified cross-type run log (Analyst / Slide / Iris) + Self-tests
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
  // LLMs top-level group (Task #1390) — four scoped sub-items replace the
  // single "llm-workflows" row that lived under System. The legacy
  // "llm-workflows" value stays in the union so existing deep links resolve
  // (Intelligence.tsx maps it to the Agents sub-item).
  | "llm-workflows"
  | "llms-agents"
  | "llms-research"
  | "llms-graphics"
  | "llms-other"
  | "assumption-guidance"
  | "engine-health"
  | "scheduled-research"
  | "vector-bench"
  | "resources"
  | "resources-tables"
  | "knowledge-registry"
  | "knowledge-registry-country-data"
  | "benchmark-bands"
  | "analyst-tables"
  | "logs"
  // "runs" is kept in the union as a backward-compat alias for deep links;
  // Intelligence.tsx redirects it to "logs" on load.
  | "runs"
  // Agent Roster (Task #1389) — three new top-level browsing sections
  // for every Agent, Specialist, and Minion in the system. The legacy
  // "gustavo", "specialists", "iris" values stay in the union (and are
  // still routed by Intelligence.tsx) so any existing deep links keep
  // resolving while the roster pages take over the sidebar entry points.
  | "roster-agents"
  | "roster-specialists"
  | "roster-minions"
  | "animations";

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
 * Canonical Intelligence nav tree (agent-taxonomy Task #1129,
 * LLMs promotion Task #1390):
 *
 *   Agent Roster
 *     Agents
 *     Specialists
 *     Minions
 *   Conversational
 *     Rebecca        (Configuration / Knowledge Base / Conversations)
 *     Iris           (Resource Maintainer)
 *   Logs             (unified cross-type log + self-tests)
 *   Knowledge & Resources
 *     Knowledge Registry
 *     Country Economic Data
 *     Market Data
 *   LLMs             (top-level group — CPU icon)
 *     Agents         → llms-agents   (assistants tab; Specialists section)
 *     Research       → llms-research (research tab; N+1 pipeline; research slots)
 *     Graphics       → llms-graphics (image-gen slot group)
 *     Other          → llms-other    (operations/exports tabs; data-extraction/system slots)
 *   System
 *     Assumption Guidance
 *     System Health
 *     Scheduled Research
 *     Vector Search Latency
 *
 * Legacy "llm-workflows" deep link resolves to llms-agents (the default).
 */
function buildNavGroups(): NavGroup[] {
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
        {
          value: "animations",
          label: "Animations",
          icon: IconSparkles,
          tooltip: "Agent persona animations and motion assets for Rebecca and The Analyst.",
        },
      ],
    },
    {
      id: "rebecca",
      label: "Rebecca",
      icon: IconBot,
      sections: [
        { value: "ai-agents",      label: "Rebecca",        secondary: AGENTS.rebecca.role, icon: IconBot          },
        { value: "knowledge-base", label: "Knowledge Base",  icon: IconBookOpen     },
        { value: "conversations",  label: "Conversations",   icon: IconMessageSquare },
      ],
    },
    {
      id: "logs",
      label: NAV_GROUP_LABELS.logs,
      icon: IconList,
      sections: [
        {
          value: "logs",
          label: "All Logs",
          icon: IconList,
          tooltip: "Unified log of all agent runs and self-tests — Analyst research, Slide Factory, Iris, and entity self-test history. Filter by type, agent, status, or date.",
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
        {
          value: "benchmark-bands",
          label: "Benchmark Bands",
          icon: IconActivity,
          tooltip: "Admin-editable low / mid / high bands for the 24 market calibration groups. Edits update model_constants without a code deploy.",
        },
        {
          value: "analyst-tables",
          label: "Analyst Tables",
          icon: IconBrain,
          tooltip: "LLM-refreshed benchmark tables (capital raise, reference brands, etc.) — trigger Analyst refresh and review output.",
        },
        {
          value: "animations",
          label: "Animations",
          icon: IconSparkles,
          tooltip: "Agent persona animations and motion assets for Rebecca and The Analyst.",
        },
      ],
    },
    {
      id: "llms",
      label: "LLMs",
      icon: IconCpu,
      sections: [
        {
          value: "llms-agents",
          label: "Agents",
          icon: IconBot,
          tooltip: "LLM configuration for agent and assistant workflows (Rebecca, Iris).",
        },
        {
          value: "llms-research",
          label: "Research",
          icon: IconBrain,
          tooltip: "LLM configuration for the research pipeline — Analyst A/B, synthesis, and deep research.",
        },
        {
          value: "llms-graphics",
          label: "Graphics",
          icon: IconActivity,
          tooltip: "LLM / image-model configuration for AI image generation (primary and fallback).",
        },
        {
          value: "llms-other",
          label: "Other",
          icon: IconSettingsGear,
          tooltip: "LLM configuration for operations, exports, data extraction, and system ops.",
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
  // Legacy llm-workflows deep link maps to the LLMs group (defaults to Agents).
  if (section === "llm-workflows") {
    return "llms";
  }
  // "runs" is the legacy alias for "logs" — map it to the logs group for
  // sidebar highlighting while Intelligence.tsx redirects the section value.
  if (section === "runs") return "logs";
  // Rebecca sub-sections that aren't in the nav map to the Rebecca group
  return "rebecca";
}

interface IntelligenceSidebarProps {
  activeSection: IntelligenceSection;
  onSectionChange: (section: IntelligenceSection) => void;
}

export function IntelligenceSidebarNav({ activeSection, onSectionChange }: IntelligenceSidebarProps) {
  // The Intelligence sidebar nav labels are static; no per-Specialist
  // override (e.g. for Gustavo's human-name) is rendered here anymore — the
  // roster detail pages own that. See git history for the previous
  // gustavoHumanName plumbing if a label override is ever re-introduced.
  const navGroups = useMemo(() => buildNavGroups(), []);
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
                    <IconArrowLeft className="size-4 shrink-0" />
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
