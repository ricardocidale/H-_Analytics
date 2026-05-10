import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { SaveButton } from "@/components/ui/save-button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSuggestScenarioName, useCreateScenario } from "@/lib/api/scenarios";
import { useScenarioDirtyState } from "@/lib/scenario-dirty-state";
import { useToast } from "@/hooks/use-toast";

const NAME_MAX = 60;
const DESC_MAX = 1000;

interface UnsavedChangesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
  onStay: () => void;
  context?: "logout" | "navigate" | "close";
}

export function UnsavedChangesDialog({
  open,
  onOpenChange,
  onDiscard,
  onStay,
  context = "navigate",
}: UnsavedChangesDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [hasUserTyped, setHasUserTyped] = useState(false);
  const { data: suggestion } = useSuggestScenarioName(open);
  const createScenario = useCreateScenario();
  const { clearDirty } = useScenarioDirtyState();
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setHasUserTyped(false);
    }
  }, [open]);

  useEffect(() => {
    if (suggestion?.suggestion && !hasUserTyped && !name) {
      setName(suggestion.suggestion);
    }
  }, [suggestion, hasUserTyped, name]);

  const handleNameChange = (v: string) => {
    if (v.length <= NAME_MAX) {
      setName(v);
      setHasUserTyped(true);
    }
  };

  const handleDescriptionChange = (v: string) => {
    if (v.length <= DESC_MAX) {
      setDescription(v);
    }
  };

  const handleSaveAndLeave = async () => {
    if (!name.trim()) return;
    try {
      await createScenario.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      useScenarioDirtyState.getState().setActiveScenario(name.trim(), "manual");
      clearDirty();
      toast({ title: "Saved", description: `Scenario "${name.trim()}" saved successfully.` });
      onOpenChange(false);
      onDiscard();
    } catch {
      toast({ title: "Error", description: "Failed to save scenario.", variant: "destructive" });
    }
  };

  const handleDiscard = () => {
    clearDirty();
    onOpenChange(false);
    onDiscard();
  };

  const handleStay = () => {
    onOpenChange(false);
    onStay();
  };

  const contextText = context === "logout"
    ? "You have unsaved changes. Would you like to save them before logging out?"
    : "You have unsaved changes. Would you like to save them before leaving?";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleStay(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Unsaved Changes</DialogTitle>
          <DialogDescription className="label-text">
            {contextText}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="label-text">Scenario Name</label>
              <span className={`text-xs tabular-nums ${name.length >= NAME_MAX ? "text-destructive font-medium" : name.length >= NAME_MAX - 10 ? "text-accent-pop" : "text-muted-foreground"}`} data-testid="text-unsaved-name-counter">
                {name.length}/{NAME_MAX}
              </span>
            </div>
            <Input
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder={suggestion?.suggestion || "e.g., My Changes"}
              maxLength={NAME_MAX}
              data-testid="input-unsaved-scenario-name"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="label-text">Description (optional)</label>
              <span className={`text-xs tabular-nums ${description.length >= DESC_MAX ? "text-destructive font-medium" : "text-muted-foreground"}`} data-testid="text-unsaved-desc-counter">
                {description.length}/{DESC_MAX}
              </span>
            </div>
            <Input
              value={description}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              placeholder="Brief description"
              maxLength={DESC_MAX}
              data-testid="input-unsaved-scenario-description"
            />
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleStay} data-testid="button-stay">
            Return
          </Button>
          <Button variant="outline" onClick={handleDiscard} className="text-destructive" data-testid="button-discard">
            Cancel
          </Button>
          <SaveButton
            onClick={handleSaveAndLeave}
            disabled={!name.trim()}
            isPending={createScenario.isPending}
            data-testid="button-save-and-leave"
          >
            Save
          </SaveButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
