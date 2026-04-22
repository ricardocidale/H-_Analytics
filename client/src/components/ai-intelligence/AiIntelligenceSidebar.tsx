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
  IconDashboard,
} from "@/components/icons";
import { Link } from "wouter";
import { SPECIALIST_SECTION_TO_ID } from "@/components/admin/AdminSidebar";
import type { SpecialistSection } from "@/components/admin/AdminSidebar";
import { SPECIALIST_CATALOG } from "@engine/analyst/registry/specialist-catalog";

export type AiIntelligenceSection =
  | SpecialistSection
  | "ai-agents"
  | "knowledge-base"
  | "conversations"
  | "sources-apis"
  | "engine-health"
  | "scheduled-research"
  | "benchmarks"
  | "analyst-tables"
  | "vector-bench";

interface SectionItem {
  value: AiIntelligenceSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  sections: SectionItem[];
}

function specialistLabel(specialistId: string, fallback: string): string {
  const def = SPECIALIST_CATALOG.find((d) => d.id === specialistId);
  return def?.displayName ?? def?.realName ?? fallback;
}

function buildNavGroups(): NavGroup[] {
  return [
    {
      id: "management-company",
      label: "Management Company",
      icon: IconBriefcase,
      sections: [
        { value: "specialist-mgmt-co-funding",          label: specialistLabel("mgmt-co.funding", "Funding"),                 icon: IconBriefcase },
        { value: "specialist-mgmt-co-revenue",          label: specialistLabel("mgmt-co.revenue", "Revenue"),                 icon: IconBriefcase },
        { value: "specialist-mgmt-co-icp-intelligence", label: specialistLabel("mgmt-co.icp-intelligence", "ICP Intelligence"), icon: IconBriefcase },
      ],
    },
    {
      id: "property",
      label: "Property",
      icon: IconProperties,
      sections: [
        { value: "specialist-property-risk-intelligence", label: specialistLabel("property.risk-intelligence", "Risk Intelligence"),  icon: IconProperties },
        { value: "specialist-property-executive-summary", label: specialistLabel("property.executive-summary", "Executive Summary"), icon: IconProperties },
      ],
    },
    {
      id: "photos",
      label: "Photos",
      icon: IconImage,
      sections: [
        { value: "specialist-photos-photo-enhancer", label: specialistLabel("photos.photo-enhancer", "Photo Enhancer"), icon: IconImage },
      ],
    },
    {
      id: "portfolio-ops",
      label: "Portfolio Ops",
      icon: IconLayers,
      sections: [
        { value: "specialist-portfolio-ops-watchdog", label: specialistLabel("portfolio-ops.watchdog", "Portfolio Watchdog"), icon: IconLayers },
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
      id: "system",
      label: "System",
      icon: IconSettingsGear,
      sections: [
        { value: "sources-apis",       label: "Sources & APIs",        icon: IconGlobe },
        { value: "engine-health",      label: "System Health",         icon: IconGauge },
        { value: "scheduled-research", label: "Scheduled Research",    icon: IconTimer },
        { value: "benchmarks",         label: "Hospitality Benchmarks", icon: IconDatabase },
        { value: "analyst-tables",     label: "Analyst Tables",        icon: IconResearch },
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
                <SidebarMenuButton asChild tooltip="Home">
                  <Link href="/" data-testid="ai-intelligence-nav-home">
                    <IconDashboard className="size-4 shrink-0" />
                    <span className="truncate">Home</span>
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
