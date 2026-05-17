import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "@/components/icons/themed-icons";

interface UnsavedExitDialogProps {
  open: boolean;
  onSave: () => void | Promise<void>;
  onLeave: () => void;
  onCancel: () => void;
  isSaving?: boolean;
}

export function UnsavedExitDialog({
  open,
  onSave,
  onLeave,
  onCancel,
  isSaving = false,
}: UnsavedExitDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Unsaved changes</DialogTitle>
          <DialogDescription>
            You have unsaved changes. Save before leaving?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2">
          <Button variant="ghost" onClick={onLeave} disabled={isSaving}>
            Leave without saving
          </Button>
          <Button onClick={onSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
