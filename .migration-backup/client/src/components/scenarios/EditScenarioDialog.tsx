import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconSave } from "@/components/icons";

interface EditScenarioDialogProps {
  scenario: { id: number; name: string; description: string } | null;
  onNameChange: (name: string) => void;
  onDescriptionChange: (desc: string) => void;
  onClose: () => void;
  onSave: () => void;
  isPending: boolean;
}

export function EditScenarioDialog({
  scenario,
  onNameChange,
  onDescriptionChange,
  onClose,
  onSave,
  isPending,
}: EditScenarioDialogProps) {
  return (
    <Dialog open={!!scenario} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Edit Scenario</DialogTitle>
          <DialogDescription className="label-text">
            Update the name and description of this scenario
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="label-text">Scenario Name</label>
            <Input
              value={scenario?.name || ""}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Scenario name"
              data-testid="input-edit-scenario-name"
            />
          </div>
          <div className="space-y-2">
            <label className="label-text">Description (optional)</label>
            <Input
              value={scenario?.description || ""}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="Brief description"
              data-testid="input-edit-scenario-description"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={onSave}
            disabled={isPending || !scenario?.name.trim()}
            data-testid="button-update-scenario"
            className="flex items-center gap-2"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <IconSave className="w-4 h-4" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
