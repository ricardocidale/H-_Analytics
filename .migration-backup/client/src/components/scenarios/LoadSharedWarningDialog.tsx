import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconAlertTriangle, IconFolderOpen } from "@/components/icons";

interface LoadSharedWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scenarioName: string;
  sharedByName: string | null;
  onConfirm: () => void;
  isPending: boolean;
}

export function LoadSharedWarningDialog({
  open,
  onOpenChange,
  scenarioName,
  sharedByName,
  onConfirm,
  isPending,
}: LoadSharedWarningDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display flex items-center gap-2">
            <IconAlertTriangle className="w-5 h-5 text-warning" />
            Load Shared Scenario
          </AlertDialogTitle>
          <AlertDialogDescription className="label-text space-y-2">
            <p>
              You are about to load <strong>"{scenarioName}"</strong>
              {sharedByName ? <> shared by <strong>{sharedByName}</strong></> : null}.
            </p>
            <p>
              Loading this scenario will replace the current working data (assumptions and properties) for <strong>all users</strong> in the shared workspace. This action affects everyone's view of the live model.
            </p>
            <p>
              Are you sure you want to proceed?
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-load-shared-cancel">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isPending}
            data-testid="button-load-shared-confirm"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <IconFolderOpen className="w-4 h-4 mr-2" />}
            Load Scenario
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
