/**
 * SlideFactoryPanel — Slide Factory V2 pipeline wizard
 *
 * 6-tab wizard driven by run status.
 *
 *   Tab 1  f-brief       new / brief_ready
 *   Tab 2  f-lorenzo     ingesting
 *   Tab 3  f-properties  ingested
 *   Tab 4  f-lucca       drafting / draft_review
 *   Tab 5  f-agents      building / complete / error
 *   Tab 6  f-download    complete / error
 *
 * Auto-fire pattern: accept-brief immediately starts Lorenzo; saving properties
 * immediately starts Lucca. Both endpoints return 202 Accepted.
 */

import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "@/components/icons/themed-icons";

import { FACTORY_TABS } from "./SlideFactoryConstants";
import { statusBadge, statusToTab } from "./SlideFactoryUtils";
import { useActiveFactoryRun } from "./SlideFactoryHooks";
import type { SlideFactoryRun } from "./SlideFactoryTypes";
import { PlaceholderTab } from "./tabs/SharedComponents";
import { FactoryBriefTab } from "./tabs/BriefTab";
import { FactoryLorenzoTab } from "./tabs/LorenzoTab";
import { FactoryPropertiesTab } from "./tabs/PropertiesTab";
import { FactoryLuccaTab } from "./tabs/LuccaTab";
import { FactoryAgentsTab } from "./tabs/AgentsTab";
import { FactoryDownloadTab } from "./tabs/DownloadTab";

// Re-exports kept for backward compatibility with test fixtures that import
// these names directly from SlideFactoryPanel.
export { deriveSlotStatus } from "./SlideFactoryUtils";
export { MAYA_VERDICT_CLASS } from "./SlideFactoryConstants";

// ── Main panel ──────────────────────────────────────────────────────────────

export function SlideFactoryPanel() {
  const qc = useQueryClient();
  const { run, isLoading } = useActiveFactoryRun();

  const handleRunUpdate = (updated: SlideFactoryRun) => {
    qc.setQueryData(["factory-run-list"], updated);
    qc.setQueryData(["factory-run", updated.id], updated);
  };

  const activeTab = statusToTab(run?.status);
  const badge = run ? statusBadge(run.status) : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-accent-pop" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Factory Pipeline</p>
        {badge && (
          <Badge variant={badge.variant} className="text-xs">
            {badge.label}
          </Badge>
        )}
      </div>

      <Tabs value={activeTab}>
        <TabsList className="flex flex-wrap h-auto gap-1 p-1">
          {FACTORY_TABS.map(({ value, label }) => (
            <TabsTrigger
              key={value}
              value={value}
              disabled={value !== activeTab}
              className="text-xs"
              title={value !== activeTab ? "Complete the previous step to unlock" : undefined}
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="f-brief" className="mt-4">
          <FactoryBriefTab run={run} onRunUpdate={handleRunUpdate} />
        </TabsContent>

        <TabsContent value="f-lorenzo" className="mt-4">
          {run ? (
            <FactoryLorenzoTab run={run} />
          ) : (
            <PlaceholderTab
              title="Lorenzo — Canonical ingestion"
              description="Lorenzo will process the brief once it has been accepted."
            />
          )}
        </TabsContent>

        <TabsContent value="f-properties" className="mt-4">
          {run?.status === "ingested" ? (
            <FactoryPropertiesTab run={run} onRunUpdate={handleRunUpdate} />
          ) : (
            <PlaceholderTab
              title="Properties"
              description="Waiting for Lorenzo to finish ingesting the brief."
            />
          )}
        </TabsContent>

        <TabsContent value="f-lucca" className="mt-4">
          {run && (run.status === "drafting" || run.status === "draft_review") ? (
            <FactoryLuccaTab run={run} onRunUpdate={handleRunUpdate} />
          ) : (
            <PlaceholderTab
              title="Lucca — Drafting"
              description="Lucca will draft slide content once properties are assigned."
            />
          )}
        </TabsContent>

        <TabsContent value="f-agents" className="mt-4">
          {run && (run.status === "building" || run.status === "complete" || run.status === "error") ? (
            <FactoryAgentsTab run={run} />
          ) : (
            <PlaceholderTab
              title="Agents — Building slides"
              description="The slide agents will build each individual slide once the draft review is complete."
            />
          )}
        </TabsContent>

        <TabsContent value="f-download" className="mt-4">
          {run && (run.status === "complete" || run.status === "rebuilding" || run.status === "error") ? (
            <FactoryDownloadTab run={run} onRunUpdate={handleRunUpdate} />
          ) : (
            <PlaceholderTab
              title="Complete — Download deck"
              description="The deck will be available for download once all slides are built and approved."
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
