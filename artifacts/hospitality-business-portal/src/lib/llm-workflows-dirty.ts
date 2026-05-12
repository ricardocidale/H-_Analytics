/**
 * Global LLM-workflows dirty state.
 *
 * Why a separate module: the unsaved-slot state lives inside
 * LlmWorkflowsPage's `useSlotAssignments` hook, but route-level navigation
 * guards (e.g. clicking the app sidebar's "Properties" link) need to read
 * the dirty state from outside that component — by the time the route
 * guard's effect runs, LlmWorkflowsPage has already unmounted and its
 * local state is gone.
 *
 * The page pushes the live `isDirty` / `dirtyCount` into this singleton
 * via `setLlmWorkflowsDirtyState`, and clears it on unmount. The App-level
 * `LlmWorkflowsRouteGuard` (see app-session.tsx) reads the snapshot to
 * decide whether to intercept a wouter location change.
 *
 * Test bypass mirrors useUnsavedChangesGuard: under Vitest the page never
 * pushes a dirty value, so the guard sees `isDirty === false` and lets
 * every navigation through.
 */

import { useSyncExternalStore } from "react";

interface LlmWorkflowsDirtyState {
  isDirty: boolean;
  dirtyCount: number;
}

let state: LlmWorkflowsDirtyState = { isDirty: false, dirtyCount: 0 };
const listeners = new Set<() => void>();

export function setLlmWorkflowsDirtyState(next: LlmWorkflowsDirtyState) {
  if (state.isDirty === next.isDirty && state.dirtyCount === next.dirtyCount) {
    return;
  }
  state = next;
  listeners.forEach((fn) => fn());
}

export function getLlmWorkflowsDirtyState(): LlmWorkflowsDirtyState {
  return state;
}

export function useLlmWorkflowsDirtyState(): LlmWorkflowsDirtyState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => { listeners.delete(l); };
    },
    () => state,
    () => state,
  );
}
