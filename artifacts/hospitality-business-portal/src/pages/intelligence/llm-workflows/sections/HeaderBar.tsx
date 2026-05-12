/**
 * HeaderBar — sections 1, 2, and 3 of the LlmWorkflows page:
 *   1. Toolbar (Analyst probe + slot Save)
 *   2. Vendor Health (live status per vendor after a probe)
 *   3. Slot dirty warning (count of unsaved slot changes)
 *
 * These three blocks are visually distinct but share concerns: the toolbar's
 * Save button and the dirty warning both reflect slot-assignment state, and
 * the vendor-health panel reads the same registry the Analyst button refreshes.
 *
 * Extracted from LlmWorkflowsPage.tsx during the task-1358 section split.
 */

import { Button } from "@/components/ui/button";
import { SaveButton } from "@/components/ui/save-button";
import { ToolbarRow } from "@/components/ui/toolbar-row";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconCpu } from "@/components/icons";
import { LLM_VENDORS } from "@/components/admin/research-center/research-shared";
import type { LlmRegistryState } from "@/lib/api/admin";

/**
 * `useRefreshLlmRegistry()` returns the full UseMutationResult; we only use a
 * narrow slice. Declared here to keep the API surface explicit.
 */
export type RefreshRegistryMutation = {
  mutate: () => void;
  isPending: boolean;
};

export interface HeaderBarProps {
  registry: LlmRegistryState | undefined;
  refreshRegistry: RefreshRegistryMutation;
  isDirty: boolean;
  /** Total dirty slots across every category — what Save will persist. */
  dirtyCount: number;
  /**
   * Dirty slots in the current sub-section. Drives the Save button label so
   * the badge reflects what the admin can actually see on screen.
   */
  visibleDirtyCount: number;
  /**
   * Dirty slots that live in OTHER LLM sub-sections. Used to surface a
   * secondary hint so admins know they have unsaved changes elsewhere.
   */
  otherDirtyCount: number;
  batchSavePending: boolean;
  onSlotSave: () => void;
}

export function HeaderBar({
  registry,
  refreshRegistry,
  isDirty,
  dirtyCount,
  visibleDirtyCount,
  otherDirtyCount,
  batchSavePending,
  onSlotSave,
}: HeaderBarProps) {
  return (
    <>
      {/* 1 — Toolbar */}
      <ToolbarRow
        start={
          <>
            <div className="flex items-center gap-2">
              <IconCpu
                className="w-4 h-4 text-muted-foreground shrink-0"
                aria-hidden="true"
              />
              <h2 className="text-base font-semibold">LLM Configuration</h2>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Set area defaults and per-slot overrides. Probe vendors with
              Analyst, then Save to persist slot assignments.
            </p>
            {registry?.status === "ready" && (
              <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                {registry.models.length} models probed across{" "}
                {registry.vendorStatuses.filter((v) => v.available).length}{" "}
                vendors
              </p>
            )}
          </>
        }
        end={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refreshRegistry.mutate()}
              disabled={refreshRegistry.isPending}
              className="gap-1.5"
              data-testid="button-analyst-llm-workflows"
              title="Probe vendor APIs for current model lists — does not save"
            >
              {refreshRegistry.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-accent-pop" />
              ) : (
                <span className="text-[11px] font-semibold text-accent-pop">
                  Analyst
                </span>
              )}
              {!refreshRegistry.isPending && (
                <span className="text-xs">Refresh models</span>
              )}
            </Button>
            <span
              title={
                otherDirtyCount > 0
                  ? `Save persists all ${dirtyCount} unsaved change${dirtyCount !== 1 ? "s" : ""} (${visibleDirtyCount} here, ${otherDirtyCount} in other LLM section${otherDirtyCount !== 1 ? "s" : ""}).`
                  : undefined
              }
            >
              <SaveButton
                size="sm"
                onClick={onSlotSave}
                hasChanges={isDirty}
                isPending={batchSavePending}
                data-testid="button-save-llm-workflows"
              >
                {`Save${visibleDirtyCount > 0 ? ` (${visibleDirtyCount})` : ""}`}
              </SaveButton>
            </span>
          </>
        }
      />

      {/* 2 — Vendor Health */}
      {registry?.vendorStatuses && registry.vendorStatuses.length > 0 && (
        <div
          className="grid grid-cols-2 sm:grid-cols-4 gap-2"
          data-testid="vendor-health-panel"
        >
          {LLM_VENDORS.map((v) => {
            const vs = registry.vendorStatuses.find((s) => s.vendor === v.value);
            const dotColor = vs?.available
              ? "bg-green-500"
              : vs
                ? "bg-red-500"
                : "bg-gray-400";
            return (
              <div
                key={v.value}
                className="flex items-start gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5"
                data-testid={`vendor-health-${v.value}`}
              >
                <span
                  className={`mt-0.5 inline-block w-2 h-2 rounded-full shrink-0 ${dotColor}${refreshRegistry.isPending ? " animate-pulse" : ""}`}
                />
                <div className="min-w-0">
                  <p className="text-xs font-medium leading-tight">{v.label}</p>
                  {vs ? (
                    <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                      {vs.available
                        ? `${vs.modelCount} model${vs.modelCount !== 1 ? "s" : ""}${vs.avgLatencyMs ? ` · ${vs.avgLatencyMs}ms` : ""}`
                        : (vs.error ?? "unavailable")}
                    </p>
                  ) : (
                    <p className="text-[10px] text-muted-foreground/50 leading-tight mt-0.5">
                      not probed
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 3 — Slot dirty warning */}
      {isDirty && (
        <p className="text-xs text-amber-700 bg-amber-50/50 border border-amber-200 rounded-md px-3 py-2">
          {visibleDirtyCount > 0 ? (
            <>
              You have {visibleDirtyCount} unsaved slot change
              {visibleDirtyCount !== 1 ? "s" : ""} in this section
              {otherDirtyCount > 0 && (
                <>
                  {" "}
                  (and {otherDirtyCount} in other LLM section
                  {otherDirtyCount !== 1 ? "s" : ""})
                </>
              )}
              . Click <strong>Save</strong> above to persist
              {otherDirtyCount > 0 ? " all of them" : ""}.
            </>
          ) : (
            <>
              You have {otherDirtyCount} unsaved slot change
              {otherDirtyCount !== 1 ? "s" : ""} in other LLM section
              {otherDirtyCount !== 1 ? "s" : ""}. Click <strong>Save</strong>{" "}
              above to persist {otherDirtyCount !== 1 ? "them" : "it"}, or
              switch sections to review.
            </>
          )}
        </p>
      )}
    </>
  );
}

