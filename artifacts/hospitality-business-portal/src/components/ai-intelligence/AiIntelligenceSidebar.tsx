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
} from "@/components/icons";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { SPECIALIST_SECTION_TO_ID } from "@/components/admin/AdminSidebar";
import type { SpecialistSection } from "@/components/admin/AdminSidebar";
import { ORCHESTRATOR_SPECIALIST_ID } from "@engine/analyst/identity";

interface SpecialistListItem {
  id: string;
  humanName?: string | null;
  hasLlmOverrides?: boolean;
}

/**
 * Canonical section union for the AI Intelligence sidebar.
 *
 * New sections added for the restructured nav (hplus-admin-nav-ia):
 *   "gustavo"            — Gustavo's read-only orchestrator info page (AI Agents group)
 *   "specialists"        — All 16 research Specialists in one accordion directory
 *   "llm-workflows"      — LLM workflow cards (the only place to manage LLM config)
 *   "assumption-guidance"— Analyst-generated calibration insights
 *
 * Legacy SpecialistSection values (specialist-mgmt-co-funding, etc.) are kept in
 * the union for URL deep-link backward compat — they are no longer exposed in the
 * sidebar nav but the routing in AiIntelligence.tsx still handles them.
 */
export type AiIntelligenceSection =
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
  | "knowledge-registry-country-data";

interface SectionItem {
  value: AiIntelligenceSection;
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
 * Canonical AI Intelligence nav tree (hplus-admin-nav-ia):
 *
 *   AI Agents
 *     Configuration  (Rebecca)
 *     Knowledge Base (Rebecca)
 *     Conversations  (Rebecca)
 *     Gustavo        (orchestrator info — read-only)
 *   Specialists       (all 16 in one accordion)
 *   LLMs              (workflow cards)
 *   Assumption Guidance
 *   System
 *     System Health
 *     Scheduled Research
 *     Vector Search Latency
 *
 * Removed: per-domain specialist groups (Management Company, Property, Photos,
 * Portfolio Ops, Constants & Authority Sources, Resources Builder, Resources).
 * Removed: standalone "The Analyst" entry.
 */
function buildNavGroups(gustavoHumanName: string): NavGroup[] {
  return [
    {
      id: "ai-agents",
      label: "AI Agents",
      icon: IconBot,
      sections: [
        { value: "ai-agents",      label: "Configuration",   icon: IconBot          },
        { value: "knowledge-base", label: "Knowledge Base",  icon: IconBookOpen     },
        { value: "conversations",  label: "Conversations",   icon: IconMessageSquare },
        {
          value: "gustavo",
          label: gustavoHumanName,
          secondary: "Analyst Orchestrator",
          icon: IconBrain,
        },
        {
          value: "iris",
          label: "Iris",
          secondary: "Resource Maintainer",
          icon: IconWand2,
        },
      ],
    },
    {
      id: "specialists",
      label: "Specialists",
      icon: IconPeople,
      sections: [
        {
          value: "specialists",
          label: "Specialists",
          icon: IconPeople,
          tooltip: "All 16 research Specialists — verify deployment, review configuration, run health checks",
        },
      ],
    },
    {
      id: "llms",
      label: "LLMs",
      icon: IconCpu,
      sections: [
        {
          value: "llm-workflows",
          label: "LLMs",
          icon: IconCpu,
          tooltip: "Language model configuration for each research workflow — the only place to manage LLM settings",
        },
      ],
    },
    {
      id: "assumption-guidance",
      label: "Assumption Guidance",
      icon: IconActivity,
      sections: [
        {
          value: "assumption-guidance",
          label: "Assumption Guidance",
          icon: IconActivity,
          tooltip: "Analyst-generated calibration insights — suggested ranges with sources for financial assumptions",
        },
      ],
    },
    {
      id: "knowledge-registry",
      label: "Knowledge Registry",
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
      ],
    },
    {
      id: "system",
      label: "System",
      icon: IconSettingsGear,
      sections: [
        { value: "engine-health",      label: "System Health",         icon: IconGauge  },
        { value: "scheduled-research", label: "Scheduled Research",    icon: IconTimer  },
        { value: "vector-bench",       label: "Vector Search Latency", icon: IconBrain  },
      ],
    },
  ];
}

function getGroupForSection(section: AiIntelligenceSection, groups: NavGroup[]): string {
  for (const group of groups) {
    if (group.sections.some((s) => s.value === section)) return group.id;
  }
  // Legacy specialist deep links → highlight Specialists group so the sidebar
  // still responds visually even though individual specialist rows are gone.
  if (section in SPECIALIST_SECTION_TO_ID || section === "analyst-orchestrator") {
    return "specialists";
  }
  return "ai-agents";
}

interface AiIntelligenceSidebarProps {
  activeSection: AiIntelligenceSection;
  onSectionChange: (section: AiIntelligenceSection) => void;
}

export function AiIntelligenceSidebarNav({ activeSection, onSectionChange }: AiIntelligenceSidebarProps) {
  // Pull the live Specialist list so Gustavo's sidebar label reflects any
  // Identity-tab rename without a page reload. Falls back to "Gustavo"
  // (the canonical human name — NOT "Gaspar" which is the internal system
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
                        return (
                          <SidebarMenuSubItem key={section.value}>
                            <SidebarMenuSubButton
                              isActive={isActive}
                              onClick={() => onSectionChange(section.value)}
                              data-testid={`ai-intelligence-nav-${section.value}`}
                              title={section.tooltip}
                              className={`cursor-pointer ${section.secondary ? "h-auto py-1.5" : ""}`}
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
