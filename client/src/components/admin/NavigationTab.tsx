/**
 * NavigationTab.tsx — Sidebar navigation visibility controls.
 *
 * One toggle per sidebar menu item. Always-visible items are shown
 * as locked (non-toggleable) so admins see the full picture of what
 * the sidebar looks like. Hidden pages are still accessible via direct
 * URL — this is a UX simplification, not a security control.
 *
 * Settings are persisted via GET/PUT /api/global-assumptions.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Lock } from "@/components/icons/themed-icons";
import {
  IconDashboard, IconProperties, IconBriefcase,
  IconAnalysis, IconPropertyFinder, IconMapPin,
  IconProfile, IconScenarios,
  IconHelp, IconShield, IconSliders, IconCompass,
} from "@/components/icons";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

// Matches exactly what Layout.tsx renders in homeNavGroups
const SIDEBAR_STRUCTURE = [
  {
    group: "Home",
    items: [
      { key: null, label: "Dashboard", icon: IconDashboard, description: "Portfolio overview and key metrics" },
      { key: null, label: "Properties", icon: IconProperties, description: "Individual property cards and details" },
      { key: null, label: "Management Company", icon: IconBriefcase, description: "Visible to users with management access" },
    ],
  },
  {
    group: "Tools",
    items: [
      { key: "sidebarSensitivity", label: "Simulation", icon: IconAnalysis, description: "Sensitivity, financing, compare, and timeline analysis" },
      { key: "sidebarPropertyFinder", label: "Property Finder", icon: IconPropertyFinder, description: "Search and discover new property opportunities" },
      { key: "sidebarMapView", label: "Map View", icon: IconMapPin, description: "Geographic overview of portfolio properties" },
    ],
  },
  {
    group: "Settings",
    items: [
      { key: null, label: "My Profile", icon: IconProfile, description: "User profile and preferences" },
      { key: "sidebarScenarios", label: "My Scenarios", icon: IconScenarios, description: "Saved scenario snapshots" },
    ],
  },
  {
    group: "Other",
    items: [
      { key: "sidebarUserManual", label: "Help", icon: IconHelp, description: "Methodology documentation and user guide" },
      { key: null, label: "Admin", icon: IconShield, description: "Visible to admin users only" },
    ],
  },
] as const;

const AI_ASSISTANT = {
  key: "showAiAssistant",
  label: "AI Assistant",
  description: "Floating AI chat widget available on every page",
};

export default function NavigationTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, refetch: refetchAuth } = useAuth();

  const { data: globalAssumptions } = useQuery({
    queryKey: ["globalAssumptions"],
    queryFn: async () => {
      const res = await fetch("/api/global-assumptions", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch global assumptions");
      return res.json();
    },
  });

  const updateSidebarMutation = useMutation({
    mutationFn: async (updates: Record<string, boolean>) => {
      const res = await fetch("/api/global-assumptions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...globalAssumptions, ...updates }),
      });
      if (!res.ok) throw new Error("Failed to update sidebar settings");
      return res.json();
    },
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: ["globalAssumptions"] });
      const prev = queryClient.getQueryData(["globalAssumptions"]);
      queryClient.setQueryData(["globalAssumptions"], (old: any) => ({ ...old, ...updates }));
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(["globalAssumptions"], context.prev);
      toast({ title: "Error", description: "Failed to save navigation settings.", variant: "destructive" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["globalAssumptions"] });
      toast({ title: "Navigation updated", description: "Visibility saved for all users." });
    },
  });

  const isOn = (key: string) => (globalAssumptions as unknown as Record<string, unknown>)?.[key] !== false;

  return (
    <div className="space-y-4" data-testid="card-sidebar-settings">
      <Card className="bg-card border border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-foreground">Sidebar Menu</CardTitle>
          <CardDescription className="label-text">
            Controls which items appear in the sidebar for non-admin users. Locked items are always visible or role-based — they cannot be hidden here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {SIDEBAR_STRUCTURE.map((section) => (
            <div key={section.group}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 px-1">
                {section.group}
              </p>
              <div className="rounded-xl border border-border/60 overflow-hidden divide-y divide-border/40">
                {section.items.map((item) => {
                  const toggleable = item.key !== null;
                  const on = toggleable ? isOn(item.key as string) : true;
                  return (
                    <div
                      key={item.label}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 transition-colors",
                        toggleable ? "hover:bg-muted/50" : "bg-muted/20",
                      )}
                      data-testid={toggleable ? `sidebar-toggle-${item.key}` : undefined}
                    >
                      <item.icon className={cn("w-4 h-4 shrink-0", on ? "text-foreground" : "text-muted-foreground/50")} />
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm font-medium", on ? "text-foreground" : "text-muted-foreground/60")}>
                          {item.label}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                      </div>
                      {toggleable ? (
                        <Switch
                          checked={on}
                          onCheckedChange={(checked) =>
                            updateSidebarMutation.mutate({ [item.key as string]: checked })
                          }
                          className="data-[state=checked]:bg-primary"
                          data-testid={`switch-${item.key}`}
                        />
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground border-border/50 flex items-center gap-1">
                          <Lock className="w-2.5 h-2.5" />
                          Always on
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="bg-card border border-border/80 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-foreground">AI Widget</CardTitle>
          <CardDescription className="label-text">
            Floating assistant available on every page — not a sidebar item.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="flex items-center justify-between px-4 py-3 rounded-xl border border-border/60 hover:bg-muted/50 transition-colors"
            data-testid={`sidebar-toggle-${AI_ASSISTANT.key}`}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{AI_ASSISTANT.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{AI_ASSISTANT.description}</p>
            </div>
            <Switch
              checked={isOn(AI_ASSISTANT.key)}
              onCheckedChange={(checked) =>
                updateSidebarMutation.mutate({ [AI_ASSISTANT.key]: checked })
              }
              className="data-[state=checked]:bg-primary"
              data-testid={`switch-${AI_ASSISTANT.key}`}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
            <IconSliders className="w-4 h-4 text-primary" />
            Calculation Transparency
            <InfoTooltip text="Show or hide step-by-step formula breakdowns in financial reports. Turn off for clean, investor-ready presentations." manualSection="financial-statements" />
          </CardTitle>
          <CardDescription className="label-text">Show or hide the formula verification details and help icons in financial statements.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-border/60 hover:bg-muted/50 transition-colors">
            <div>
              <Label className="label-text font-medium flex items-center gap-1">Management Company Reports <InfoTooltip text="Toggles formula breakdowns and help icons in company-level financial reports." /></Label>
              <p className="text-xs text-muted-foreground mt-0.5">Income statement, cash flow, and balance sheet on the Company page</p>
            </div>
            <Switch
              checked={globalAssumptions?.showCompanyCalculationDetails ?? true}
              onCheckedChange={(checked) =>
                updateSidebarMutation.mutate({ showCompanyCalculationDetails: checked })
              }
              data-testid="switch-company-calc-details"
            />
          </div>
          <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-border/60 hover:bg-muted/50 transition-colors">
            <div>
              <Label className="label-text font-medium flex items-center gap-1">Property Reports <InfoTooltip text="Toggles formula breakdowns and help icons in property-level financial reports." /></Label>
              <p className="text-xs text-muted-foreground mt-0.5">All property-level income statements, cash flows, and balance sheets</p>
            </div>
            <Switch
              checked={globalAssumptions?.showPropertyCalculationDetails ?? true}
              onCheckedChange={(checked) =>
                updateSidebarMutation.mutate({ showPropertyCalculationDetails: checked })
              }
              data-testid="switch-property-calc-details"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
            <IconCompass className="w-4 h-4 text-primary" />
            Guided Tour
            <InfoTooltip text="Control whether the guided tour prompt appears when you log in." />
          </CardTitle>
          <CardDescription className="label-text">Manage the welcome tour prompt shown on login.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-border/60 hover:bg-muted/50 transition-colors">
            <div>
              <Label className="label-text font-medium flex items-center gap-1">Show tour prompt on login <InfoTooltip text="This is a per-user preference, not an org-wide setting. Turning it off here only affects your own login experience." /></Label>
              <p className="text-xs text-muted-foreground mt-0.5">Display the guided walkthrough offer after signing in</p>
            </div>
            <Switch
              checked={!(user?.hideTourPrompt ?? false)}
              onCheckedChange={async (showOnLogin) => {
                await fetch("/api/profile/tour-prompt", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ hide: !showOnLogin }),
                  credentials: "include",
                });
                queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
                refetchAuth();
              }}
              data-testid="switch-tour-prompt"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
