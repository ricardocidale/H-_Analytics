import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconSave } from "@/components/icons";
import { useSuggestScenarioName } from "@/lib/api/scenarios";

const NAME_MAX = 60;
const DESC_MAX = 1000;

interface SaveScenarioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  onNameChange: (v: string) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  onSave: () => void;
  isPending: boolean;
}

export function SaveScenarioDialog({
  open,
  onOpenChange,
  name,
  onNameChange,
  description,
  onDescriptionChange,
  onSave,
  isPending,
}: SaveScenarioDialogProps) {
  const { data: suggestion } = useSuggestScenarioName(open);
  const [hasUserTyped, setHasUserTyped] = useState(false);

  useEffect(() => {
    if (open) {
      setHasUserTyped(false);
    }
  }, [open]);

  useEffect(() => {
    if (suggestion?.suggestion && !hasUserTyped && !name) {
      onNameChange(suggestion.suggestion);
    }
  }, [suggestion, hasUserTyped, name]);

  const handleNameChange = (v: string) => {
    if (v.length <= NAME_MAX) {
      onNameChange(v);
      setHasUserTyped(true);
    }
  };

  const handleDescriptionChange = (v: string) => {
    if (v.length <= DESC_MAX) {
      onDescriptionChange(v);
    }
  };

  const nameLen = name.length;
  const descLen = description.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Save Current Configuration</DialogTitle>
          <DialogDescription className="label-text">
            Save your current assumptions and properties as a new scenario
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="label-text">Scenario Name</label>
              <span className={`text-xs tabular-nums ${nameLen >= NAME_MAX ? "text-destructive font-medium" : nameLen >= NAME_MAX - 10 ? "text-accent-pop" : "text-muted-foreground"}`} data-testid="text-name-counter">
                {nameLen}/{NAME_MAX}
              </span>
            </div>
            <Input
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder={suggestion?.suggestion || "e.g., Base Case, Optimistic, Conservative"}
              maxLength={NAME_MAX}
              data-testid="input-scenario-name"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="label-text">Description (optional)</label>
              <span className={`text-xs tabular-nums ${descLen >= DESC_MAX ? "text-destructive font-medium" : descLen >= DESC_MAX - 50 ? "text-accent-pop" : "text-muted-foreground"}`} data-testid="text-desc-counter">
                {descLen}/{DESC_MAX}
              </span>
            </div>
            <Input
              value={description}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              placeholder="Brief description of this scenario"
              maxLength={DESC_MAX}
              data-testid="input-scenario-description"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={onSave}
            disabled={isPending || !name.trim()}
            data-testid="button-save-scenario"
            className="flex items-center gap-2"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <IconSave className="w-4 h-4" />}
            Save Scenario
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
