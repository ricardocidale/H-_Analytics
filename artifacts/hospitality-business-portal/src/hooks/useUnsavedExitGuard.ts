import { useState, useEffect, useCallback, useRef } from "react";

export interface UseUnsavedExitGuardOptions {
  isDirty: boolean;
  onSave: () => void | Promise<void>;
  enabled?: boolean;
}

export interface UnsavedExitGuard {
  dialogOpen: boolean;
  isSaving: boolean;
  confirmLeave: (callback: () => void) => void;
  handleSave: () => Promise<void>;
  handleLeave: () => void;
  handleCancel: () => void;
}

export function useUnsavedExitGuard({
  isDirty,
  onSave,
  enabled = true,
}: UseUnsavedExitGuardOptions): UnsavedExitGuard {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const pendingCallbackRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!enabled || !isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty, enabled]);

  const confirmLeave = useCallback(
    (callback: () => void) => {
      if (!enabled || !isDirty) {
        callback();
        return;
      }
      pendingCallbackRef.current = callback;
      setDialogOpen(true);
    },
    [isDirty, enabled],
  );

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await onSave();
      setDialogOpen(false);
      const cb = pendingCallbackRef.current;
      pendingCallbackRef.current = null;
      cb?.();
    } finally {
      setIsSaving(false);
    }
  }, [onSave]);

  const handleLeave = useCallback(() => {
    setDialogOpen(false);
    const cb = pendingCallbackRef.current;
    pendingCallbackRef.current = null;
    cb?.();
  }, []);

  const handleCancel = useCallback(() => {
    setDialogOpen(false);
    pendingCallbackRef.current = null;
  }, []);

  return { dialogOpen, isSaving, confirmLeave, handleSave, handleLeave, handleCancel };
}
