/**
 * SlideFactoryPanel — Slide Factory V2 pipeline wizard
 *
 * 6-step pipeline driven by run status. Each step is a collapsible section;
 * the current step is automatically expanded as the run progresses.
 *
 *   Step 1  f-brief       new / brief_ready
 *   Step 2  f-lorenzo     ingesting
 *   Step 3  f-properties  ingested
 *   Step 4  f-lucca       drafting / draft_review
 *   Step 5  f-agents      building / complete / error
 *   Step 6  f-download    complete / error
 *
 * Auto-fire pattern: accept-brief immediately starts Lorenzo; saving properties
 * immediately starts Lucca. Both endpoints return 202 Accepted.
 */

import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CollapsibleSection } from "@/components/ui/collapsible-section";

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
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <div className="flex gap-1">
          {[80, 64, 72, 56, 68, 80].map((w, i) => (
            <Skeleton key={i} className="h-8 rounded-md" style={{ width: `${w}px` }} />
          ))}
        </div>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-16 w-3/4" />
      </div>
    );
  }

  const getStepContent = (value: string): React.ReactNode => {
    switch (value) {
      case "f-brief":
        return <FactoryBriefTab run={run} onRunUpdate={handleRunUpdate} />;
      case "f-lorenzo":
        return run ? (
          <FactoryLorenzoTab run={run} />
        ) : (
          <PlaceholderTab
            title="Lorenzo — Canonical ingestion"
            description="Lorenzo will process the brief once it has been accepted."
          />
        );
      case "f-properties":
        return run?.status === "ingested" ? (
          <FactoryPropertiesTab run={run} onRunUpdate={handleRunUpdate} />
        ) : (
          <PlaceholderTab
            title="Properties"
            description="Waiting for Lorenzo to finish ingesting the brief."
          />
        );
      case "f-lucca":
        return run && (run.status === "drafting" || run.status === "draft_review") ? (
          <FactoryLuccaTab run={run} onRunUpdate={handleRunUpdate} />
        ) : (
          <PlaceholderTab
            title="Lucca — Drafting"
            description="Lucca will draft slide content once properties are assigned."
          />
        );
      case "f-agents":
        return run && (run.status === "building" || run.status === "complete" || run.status === "error") ? (
          <FactoryAgentsTab run={run} />
        ) : (
          <PlaceholderTab
            title="Agents — Building slides"
            description="The slide agents will build each individual slide once the draft review is complete."
          />
        );
      case "f-download":
        return run && (run.status === "complete" || run.status === "rebuilding" || run.status === "error") ? (
          <FactoryDownloadTab run={run} onRunUpdate={handleRunUpdate} />
        ) : (
          <PlaceholderTab
            title="Complete — Download deck"
            description="The deck will be available for download once all slides are built and approved."
          />
        );
      default:
        return null;
    }
  };

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

      <CollapsibleSection
        defaultOpenId={activeTab}
        forceOpenId={activeTab}
        items={FACTORY_TABS.map(({ value, label }) => ({
          id: value,
          summary: (
            <span className="flex items-center gap-2">
              {label}
              {activeTab === value && (
                <Badge
                  variant="outline"
                  className="text-[10px] text-green-700 border-green-300 dark:text-green-400 dark:border-green-700"
                >
                  Active
                </Badge>
              )}
            </span>
          ),
          expandedContent: getStepContent(value),
        }))}
      />
    </div>
  );
}
