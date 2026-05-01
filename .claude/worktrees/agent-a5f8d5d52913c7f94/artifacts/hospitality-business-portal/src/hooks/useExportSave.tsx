import { useCallback } from "react";

export function useExportSave() {
  const requestSave = useCallback((suggestedName: string, extension: string, onConfirm: (filename: string) => void) => {
    const safeFilename = suggestedName.trim().replace(/[/\\:*?"<>|]/g, "_");
    onConfirm(`${safeFilename}${extension}`);
  }, []);

  const SaveDialog = null;

  return { requestSave, SaveDialog };
}
