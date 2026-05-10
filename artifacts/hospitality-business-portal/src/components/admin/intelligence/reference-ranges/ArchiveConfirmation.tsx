/**
 * ArchiveConfirmation — AlertDialog asking the admin to confirm archiving
 * a reference range row.
 *
 * Extracted from `../ReferenceRangesTab.tsx` (task-1360). The markup is
 * byte-identical to the original; the open target row, mutation pending
 * state, and the confirm/cancel handlers come in as props.
 */
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ReferenceRangeRow } from "./types";

type Props = {
  archiveTarget: ReferenceRangeRow | null;
  archivePending: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function ArchiveConfirmation({
  archiveTarget,
  archivePending,
  onClose,
  onConfirm,
}: Props) {
  return (
    <AlertDialog open={archiveTarget !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <AlertDialogContent data-testid="dialog-archive-confirm">
        <AlertDialogHeader>
          <AlertDialogTitle>Archive this range?</AlertDialogTitle>
          <AlertDialogDescription>
            It will be hidden from the grid and from Specialist lookups. You can restore it later by toggling "Show archived".
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-archive-cancel">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={archivePending}
            data-testid="button-archive-confirm"
          >
            {archivePending ? "Archiving…" : "Archive"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
