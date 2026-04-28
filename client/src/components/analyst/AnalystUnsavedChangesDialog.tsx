/**
 * AnalystUnsavedChangesDialog — three-button dialog shown when an admin
 * presses the page-level AnalystButton with unsaved form changes on
 * Company Assumptions.
 *
 * The Analyst evaluates only what's persisted in the GlobalAssumptions
 * row — it cannot see in-flight form edits. So when the form is dirty,
 * the user has three choices:
 *
 *   1. Save and analyze        — persist the active tab first, then run
 *                                the Analyst against the fresh state.
 *   2. Continue with last saved — ignore unsaved edits and run the
 *                                Analyst against the current persisted
 *                                row (useful for "what would you say
 *                                about what I have on disk?").
 *   3. Cancel                  — close the dialog, keep editing.
 *
 * Voice convention: this dialog speaks AS the Analyst (concise, plain,
 * decision-prompting). It does NOT scold the user for being dirty.
 */
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { IconSparkles } from "@/components/icons";
import { Loader2 } from "@/components/icons/themed-icons";

export interface AnalystUnsavedChangesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveAndAnalyze: () => void | Promise<void>;
  onContinueWithLastSaved: () => void;
  isSaving?: boolean;
  /** Human label for which tab will be saved (e.g. "Funding"). */
  tabLabel?: string;
}

export function AnalystUnsavedChangesDialog({
  open,
  onOpenChange,
  onSaveAndAnalyze,
  onContinueWithLastSaved,
  isSaving = false,
  tabLabel,
}: AnalystUnsavedChangesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isSaving) onOpenChange(v); }}>
      <DialogContent
        className="sm:max-w-lg overflow-hidden p-7"
        data-testid="dialog-analyst-unsaved-changes"
      >
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="space-y-5"
        >
          <DialogHeader className="space-y-3">
            <DialogTitle className="flex items-center gap-3 font-display text-lg leading-tight">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary">
                <IconSparkles className="h-4 w-4" />
              </span>
              You have unsaved changes
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
              The Analyst reads what's saved — save your{" "}
              {tabLabel ? (
                <span className="font-medium text-foreground">{tabLabel}</span>
              ) : (
                "current"
              )}
              {" "}edits, or run on the last saved version.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:space-x-0">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
              data-testid="button-analyst-unsaved-cancel"
              className="sm:w-auto w-full"
            >
              Cancel
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:gap-3">
              <Button
                variant="destructive"
                onClick={onContinueWithLastSaved}
                disabled={isSaving}
                data-testid="button-analyst-unsaved-continue"
                className="sm:w-auto w-full"
              >
                Continue with last saved
              </Button>
              <Button
                variant="default"
                onClick={() => void onSaveAndAnalyze()}
                disabled={isSaving}
                data-testid="button-analyst-unsaved-save-and-analyze"
                className="sm:w-auto w-full"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  "Save and analyze"
                )}
              </Button>
            </div>
          </DialogFooter>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
