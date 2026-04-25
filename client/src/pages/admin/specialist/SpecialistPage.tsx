/**
 * SpecialistPage — read-only assignment + health surface for one Specialist
 * (P5). Renders only the capability tabs the catalog declares for this
 * Specialist, so a Specialist that lacks (e.g.) `required-fields` never
 * shows that tab.
 *
 * Doctrine (replit.md, LOCKED 2026-04-21):
 *   • Specialist pages are READ-ONLY for Resource assignments. There is
 *     no UI affordance to relink an assignment from this page; the
 *     "Edit in Resources →" link is the only escape hatch.
 *   • Funding (A) and Revenue (B) are status="built". Specialists C–G
 *     declare capabilities but render a stub banner — their evaluators
 *     don't exist yet.
 *
 * Structure: this file is a thin shell. Each capability tab lives in its
 * own module under `./tabs/` so this page stays readable and the panels
 * can be swapped, lazy-loaded, or unit-tested in isolation.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconAlertTriangle } from "@/components/icons";

import type { Capability, SpecialistDetailResponse } from "./types";
import { consumeAiIntelligenceTabHint, usePendingAiIntelligenceTabHint } from "@/lib/ai-intelligence-nav";
import { IdentityTab } from "./tabs/IdentityTab";
import { SourcesTab } from "./tabs/SourcesTab";
import { RequiredFieldsTab } from "./tabs/RequiredFieldsTab";
import { LlmConfigTab } from "./tabs/LlmConfigTab";
import { ResourceAssignmentsTab } from "./tabs/ResourceAssignmentsTab";
import { RuntimeTab, CadenceCard } from "./tabs/RuntimeTab";
import { AuditTab } from "./tabs/AuditTab";
import { WorkflowTab } from "./tabs/WorkflowTab";
import { SpecialistSummaryPanel } from "./SpecialistSummaryPanel";
import { SpecialistToolsICall } from "./SpecialistToolsICall";
import { SpecialistToolsIBuild } from "./SpecialistToolsIBuild";

export default function SpecialistPage({ specialistId }: { specialistId: string }) {
  const { data, isLoading, error } = useQuery<SpecialistDetailResponse>({
    queryKey: [`/api/admin/specialists/${specialistId}`],
  });

  // "identity" is a synthetic tab — always present, regardless of declared
  // capabilities. Phase 3 (Task #453) makes humanName + gender admin-editable
  // for every Specialist (and for Gaspar through the same surface).
  // "identity" + "sources" are synthetic tabs — always present, even for
  // Specialists (and Gaspar) that declare no editable capability tabs.
  type TabValue = Capability | "workflow" | "identity" | "sources";
  const tabsList = useMemo(() => {
    if (!data) return [] as { value: TabValue; label: string }[];
    const order: Capability[] = ["required-fields", "llm-config", "resource-assignments", "runtime", "audit"];
    const labels: Record<Capability, string> = {
      "required-fields": "Required Fields",
      "llm-config": "LLM Config",
      "resource-assignments": "Resources",
      "runtime": "Runtime",
      "audit": "Audit",
    };
    const capTabs = order
      .filter((c) => data.definition.capabilities.includes(c))
      .map((c) => ({ value: c as TabValue, label: labels[c] }));
    return [
      { value: "workflow" as TabValue, label: "Overview / Workflow" },
      { value: "identity" as TabValue, label: "Identity" },
      { value: "sources" as TabValue, label: "Sources" },
      ...capTabs,
    ];
  }, [data]);

  const [activeTab, setActiveTab] = useState<TabValue | undefined>();

  // Reset the selected tab whenever the user switches Specialists. Without
  // this, a stale capability tab (e.g. "required-fields" picked on Funding)
  // can survive the swap to a Specialist that doesn't declare that
  // capability — Radix Tabs then renders no active trigger and an empty
  // content pane. See the inline mount sites in Admin.tsx and
  // AiIntelligence.tsx — they don't pass key={specialistId}, so the
  // component instance is reused across id changes.
  //
  // Task #502 — deep-link tab hints (from the sidebar's per-Specialist
  // "Overrides" badge or the LLM Defaults chip click-through) are NOT
  // consumed here. We only clear `activeTab` so the default first tab
  // would render if no hint resolves. The `pendingHint` effect below
  // owns hint consumption + capability gating uniformly, which means a
  // hint that arrives before the Specialist's `data` is loaded waits
  // safely until capabilities are known instead of being applied blind.
  useEffect(() => {
    setActiveTab(undefined);
  }, [specialistId]);

  // Task #502 — single source of truth for tab-hint consumption. Fires on
  //   1. fresh-navigation hints (`pendingHint` set by the LLM Defaults chip
  //      before this page mounts; `data` is undefined on first run, then
  //      becomes defined and re-fires this effect),
  //   2. same-Specialist re-clicks of the sidebar's Overrides badge (the
  //      nonce on the hint object guarantees this effect re-runs even when
  //      the same `{specialistId, tab}` pair is set twice in a row).
  // Capability gating prevents a misrouted hint (e.g. "llm-config" for a
  // Specialist that doesn't declare the capability) from wedging Radix
  // Tabs into an empty active state — the hint is dropped silently and
  // the default first tab remains selected.
  const pendingHint = usePendingAiIntelligenceTabHint();
  useEffect(() => {
    if (!data) return;
    if (!pendingHint || pendingHint.specialistId !== specialistId) return;
    const declaresCapability = data.definition.capabilities.includes(pendingHint.tab as Capability);
    if (!declaresCapability) return;
    const tab = consumeAiIntelligenceTabHint(specialistId);
    if (tab) setActiveTab(tab);
  }, [pendingHint, specialistId, data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" data-testid="specialist-loading">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <Alert variant="destructive" data-testid="specialist-error">
        <IconAlertTriangle className="w-4 h-4" />
        <AlertTitle>Could not load Specialist</AlertTitle>
        <AlertDescription>{error instanceof Error ? error.message : "Unknown error"}</AlertDescription>
      </Alert>
    );
  }

  const { definition, config, assignments } = data;
  const current = activeTab ?? tabsList[0]?.value;

  return (
    <div className="space-y-6" data-testid={`specialist-page-${specialistId}`}>
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Badge variant="outline" data-testid="badge-specialist-letter">{definition.letter}</Badge>
          <h2 className="text-xl font-semibold" data-testid="text-specialist-name">
            {/* Persona-first header: humanName ("Helena") leads, with the
                catalog displayName / realName shown beside it as a quiet
                subtitle so admins can still trace the slug. */}
            {definition.humanName ?? definition.displayName ?? definition.realName}
            {definition.humanName && (
              <span className="ml-2 text-sm font-normal text-muted-foreground" data-testid="text-specialist-role">
                · {definition.displayName ?? definition.realName}
              </span>
            )}
          </h2>
          <Badge
            variant={definition.status === "built" ? "default" : "secondary"}
            data-testid="badge-specialist-status"
          >
            {definition.status === "built" ? "Built" : definition.status === "stub" ? "Stub" : "Needs page"}
          </Badge>
          <span className="text-sm text-muted-foreground ml-auto" data-testid="text-specialist-subject">
            Subject: {definition.subject}
          </span>
        </div>
        <p className="text-sm text-muted-foreground" data-testid="text-specialist-description">
          {definition.description ?? ""}
        </p>
      </div>

      <SpecialistSummaryPanel definition={definition} assignments={assignments} />

      <SpecialistToolsIBuild specialistId={specialistId} />
      <SpecialistToolsICall specialistId={specialistId} />

      {definition.status === "needs-page" && (
        <Alert data-testid="banner-needs-page">
          <IconAlertTriangle className="w-4 h-4" />
          <AlertTitle>Specialist not yet wired into the engine</AlertTitle>
          <AlertDescription>
            Configuration here is recorded for audit but has no runtime effect until the
            evaluator ships. Edits remain safe — they will activate automatically when
            the Specialist goes live.
          </AlertDescription>
        </Alert>
      )}

      {tabsList.length === 0 ? (
        <Card><CardContent className="py-8 text-sm text-muted-foreground">This Specialist declares no capability tabs.</CardContent></Card>
      ) : (
        <Tabs value={current} onValueChange={(v) => setActiveTab(v as TabValue)}>
          <TabsList>
            {tabsList.map((t) => (
              <TabsTrigger key={t.value} value={t.value} data-testid={`tab-${t.value}`}>{t.label}</TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="workflow">
            <WorkflowTab
              specialistId={specialistId}
              description={definition.description}
              assignments={assignments}
            />
          </TabsContent>
          <TabsContent value="identity">
            <IdentityTab specialistId={specialistId} />
          </TabsContent>
          <TabsContent value="sources">
            <SourcesTab specialistId={specialistId} />
          </TabsContent>
          {tabsList.find((t) => t.value === "required-fields") && (
            <TabsContent value="required-fields">
              <RequiredFieldsTab
                specialistId={specialistId}
                config={config}
                candidateFields={data.definition.candidateFields ?? []}
                prerequisites={data.definition.prerequisites ?? []}
              />
            </TabsContent>
          )}
          {tabsList.find((t) => t.value === "llm-config") && (
            <TabsContent value="llm-config"><LlmConfigTab specialistId={specialistId} config={config} /></TabsContent>
          )}
          {tabsList.find((t) => t.value === "resource-assignments") && (
            <TabsContent value="resource-assignments"><ResourceAssignmentsTab specialistId={specialistId} assignments={assignments} /></TabsContent>
          )}
          {tabsList.find((t) => t.value === "runtime") && (
            <TabsContent value="runtime">
              <div className="space-y-6">
                {(definition.constantsOwned ?? []).length > 0 && (
                  <CadenceCard specialistId={specialistId} config={config} />
                )}
                <RuntimeTab specialistId={specialistId} config={config} />
              </div>
            </TabsContent>
          )}
          {tabsList.find((t) => t.value === "audit") && (
            <TabsContent value="audit"><AuditTab specialistId={specialistId} /></TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}
