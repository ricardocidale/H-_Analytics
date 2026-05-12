/**
 * LlmWorkflowsPage — the ONLY place in Intelligence to manage LLM configuration.
 *
 * Doctrine (binding):
 *   hplus-admin-nav-ia Rule 12 — LLM model names, endpoints, API key references,
 *     rate limits, and fallback chains are managed exclusively here.
 *   hplus-admin-nav-ia Rule 13 — Uses workflow cards (accordion), NOT a flat LLM registry.
 *
 * Page sections (top → bottom):
 *   1. Toolbar — Analyst probe + slot Save               ┐
 *   2. Vendor Health — live status per vendor            ├─ HeaderBar
 *   3. Slot dirty warning                                ┘
 *   4. Function-Area Defaults — seed vendor/model per functional area
 *      (filtered to the active category's tabs)
 *   5. N+1 Orchestrator Defaults — global multi-model pipeline (Research only)
 *   6. Slot Accordion — per-slot overrides (filtered to active category)
 *   7. Specialists — per-specialist override status (Agents only)
 *
 * The `category` prop (injected by Intelligence.tsx) scopes the page to a
 * single LLM sub-domain. When undefined, all groups are shown (legacy behavior
 * for the `llm-workflows` deep link).
 *
 * Each section is extracted under ./llm-workflows/. Slot-assignment state is
 * lifted into a hook (useSlotAssignments) so HeaderBar and SlotAccordion share
 * the same selections / dirty tracking. The other sections own their state
 * locally.
 */

import { type LlmCategory } from "./llm-workflows/constants";
import { useLlmRegistry, useRefreshLlmRegistry } from "@/lib/api/admin";
import { Loader2 } from "@/components/icons/themed-icons";
import { ActiveModelsSummary } from "./llm-workflows/sections/ActiveModelsSummary";
import { HeaderBar } from "./llm-workflows/sections/HeaderBar";
import { FunctionAreaDefaults } from "./llm-workflows/sections/FunctionAreaDefaults";
import { OrchestratorDefaults } from "./llm-workflows/sections/OrchestratorDefaults";
import { SlotAccordion } from "./llm-workflows/sections/SlotAccordion";
import { SpecialistsSection } from "./llm-workflows/sections/SpecialistsSection";
import { useSlotAssignments } from "./llm-workflows/useSlotAssignments";
import { useUnsavedChangesGuard } from "./llm-workflows/useUnsavedChangesGuard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface LlmWorkflowsPageProps {
  category?: LlmCategory;
}

export default function LlmWorkflowsPage({ category }: LlmWorkflowsPageProps) {
  // Registry (vendor probe results + recommendations) — read by header,
  // function-area defaults, and slot accordion.
  const { data: registry } = useLlmRegistry();
  const refreshRegistry = useRefreshLlmRegistry();

  // Slot assignments state is lifted here because two sections share it:
  // HeaderBar (Save button + dirty count) and SlotAccordion (per-slot cards).
  const {
    slotResources,
    slotsLoading,
    modelResources,
    modelsByVendor,
    selections,
    setSelections,
    originalSlugs,
    isDirty,
    dirtyCount,
    visibleDirtyCount,
    otherDirtyCount,
    batchSavePending,
    handleSlotSave,
  } = useSlotAssignments(category);

  // Close the navigation gap: if the admin clicks another Intelligence
  // sidebar item, navigates to a different route, or closes the tab while
  // slot edits are staged, prompt before discarding. Switching between
  // LLM sub-categories (llms-agents ↔ llms-research ↔ …) keeps this
  // component mounted and is intentionally NOT intercepted.
  const guard = useUnsavedChangesGuard(isDirty);

  // Derived visibility flags per category.
  // OrchestratorDefaults is Research-only (it configures the N+1 pipeline).
  // SpecialistsSection is Agents-only (agent-LLM override config).
  const showOrchestratorDefaults = !category || category === "research";
  const showSpecialists = !category || category === "agents";
  // FunctionAreaDefaults renders its own tab filtering; hide the whole section
  // when the active category has no tabs assigned (Graphics has none).
  const showFunctionAreaDefaults = category !== "graphics";
  // SlotAccordion hides itself when no groups match the category; always show
  // for unscoped (legacy) view.
  const showSlotAccordion = true;

  if (slotsLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-accent-pop" />
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="page-llm-workflows">
      <ActiveModelsSummary
        slotResources={slotResources}
        modelResources={modelResources}
        category={category}
        vendorStatuses={registry?.vendorStatuses}
      />

      <HeaderBar
        registry={registry}
        refreshRegistry={refreshRegistry}
        isDirty={isDirty}
        dirtyCount={dirtyCount}
        visibleDirtyCount={visibleDirtyCount}
        otherDirtyCount={otherDirtyCount}
        batchSavePending={batchSavePending}
        onSlotSave={handleSlotSave}
      />

      {showFunctionAreaDefaults && (
        <FunctionAreaDefaults registry={registry} category={category} />
      )}

      {showOrchestratorDefaults && (
        <OrchestratorDefaults modelResources={modelResources} />
      )}

      {showSlotAccordion && (
        <SlotAccordion
          slotResources={slotResources}
          selections={selections}
          setSelections={setSelections}
          originalSlugs={originalSlugs}
          modelsByVendor={modelsByVendor}
          registry={registry}
          category={category}
        />
      )}

      {showSpecialists && <SpecialistsSection />}

      <Dialog
        open={guard.promptOpen}
        onOpenChange={(v) => {
          if (!v) guard.stay();
        }}
      >
        <DialogContent data-testid="dialog-llm-unsaved-changes">
          <DialogHeader>
            <DialogTitle className="font-display">Unsaved LLM changes</DialogTitle>
            <DialogDescription className="label-text">
              {`You have ${dirtyCount} unsaved slot ${
                dirtyCount === 1 ? "change" : "changes"
              }. Discard or go back to save?`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={guard.stay}
              data-testid="button-llm-unsaved-go-back"
            >
              Go back to save
            </Button>
            <Button
              variant="destructive"
              onClick={guard.confirmDiscard}
              data-testid="button-llm-unsaved-discard"
            >
              Discard changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
