export interface AdminSaveState {
  isDirty: boolean;
  isPending: boolean;
  onSave: () => void;
  /**
   * When true, the shared admin Save button stays clickable and fully
   * opaque even when nothing is dirty so the admin can re-endorse the
   * displayed values. Use only on tabs whose backend save is safe to
   * invoke as a no-op (e.g. Model Defaults, where the save is the
   * endorsement contract). Tabs that produce audit log entries or other
   * side effects on every save (e.g. Rebecca config) should leave this
   * unset so the button disables when clean. Defaults to false.
   */
  requiresEndorsement?: boolean;
}

/** Callback prop for tabs to report their save state to a parent shell. */
export type SaveStateCallback = (state: AdminSaveState | null) => void;
