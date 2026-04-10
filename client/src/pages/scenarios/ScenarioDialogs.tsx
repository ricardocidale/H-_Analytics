import { lazy, Suspense } from "react";
import type { ScenarioActions } from "./useScenarioActions";

const SaveScenarioDialog = lazy(() => import("@/components/scenarios/SaveScenarioDialog").then(m => ({ default: m.SaveScenarioDialog })));
const EditScenarioDialog = lazy(() => import("@/components/scenarios/EditScenarioDialog").then(m => ({ default: m.EditScenarioDialog })));
const CompareResultDialog = lazy(() => import("@/components/scenarios/CompareResultDialog").then(m => ({ default: m.CompareResultDialog })));
const ShareScenarioDialog = lazy(() => import("@/components/scenarios/ShareScenarioDialog").then(m => ({ default: m.ShareScenarioDialog })));
const LoadSharedWarningDialog = lazy(() => import("@/components/scenarios/LoadSharedWarningDialog").then(m => ({ default: m.LoadSharedWarningDialog })));

interface ScenarioDialogsProps {
  actions: ScenarioActions;
}

export function ScenarioDialogs({ actions }: ScenarioDialogsProps) {
  const {
    isCreating, setIsCreating,
    newScenarioName, setNewScenarioName,
    newScenarioDescription, setNewScenarioDescription,
    editingScenario, setEditingScenario,
    sharingScenario, setSharingScenario,
    loadSharedWarning, setLoadSharedWarning,
    compareDialogOpen, setCompareDialogOpen,
    compareResult,
    handleCreate, handleUpdate, handleLoad,
    createIsPending, updateIsPending, loadIsPending,
  } = actions;

  return (
    <Suspense fallback={null}>
      <SaveScenarioDialog
        open={isCreating}
        onOpenChange={setIsCreating}
        name={newScenarioName}
        onNameChange={setNewScenarioName}
        description={newScenarioDescription}
        onDescriptionChange={setNewScenarioDescription}
        onSave={handleCreate}
        isPending={createIsPending}
      />

      <EditScenarioDialog
        scenario={editingScenario}
        onNameChange={(name) => setEditingScenario(prev => prev ? { ...prev, name } : null)}
        onDescriptionChange={(desc) => setEditingScenario(prev => prev ? { ...prev, description: desc } : null)}
        onClose={() => setEditingScenario(null)}
        onSave={handleUpdate}
        isPending={updateIsPending}
      />

      <CompareResultDialog
        open={compareDialogOpen}
        onOpenChange={(open) => { if (!open) setCompareDialogOpen(false); }}
        result={compareResult}
      />

      {sharingScenario && (
        <ShareScenarioDialog
          open={!!sharingScenario}
          onOpenChange={(open) => { if (!open) setSharingScenario(null); }}
          scenarioId={sharingScenario.id}
          scenarioName={sharingScenario.name}
        />
      )}

      {loadSharedWarning && (
        <LoadSharedWarningDialog
          open={!!loadSharedWarning}
          onOpenChange={(open) => { if (!open) setLoadSharedWarning(null); }}
          scenarioName={loadSharedWarning.name}
          sharedByName={loadSharedWarning.sharedByName}
          onConfirm={() => handleLoad(loadSharedWarning.id, loadSharedWarning.name)}
          isPending={loadIsPending}
        />
      )}
    </Suspense>
  );
}
