import { create } from "zustand";

type PanelType = "guidance" | "rebecca" | null;

interface GuidanceContext {
  entityType: "property" | "company";
  entityId: number;
  assumptionKey: string;
  fieldLabel?: string;
  currentValue?: number | null;
  scenarioId?: number | null;
}

interface RebeccaContext {
  fieldName?: string;
  entityName?: string;
  currentValue?: number | null;
  guidanceLow?: number | null;
  guidanceMid?: number | null;
  guidanceHigh?: number | null;
  entityType?: "property" | "company";
  entityId?: number;
  scenarioId?: number | null;
  fieldKey?: string;
  conversationId?: number | null;
  currentPage?: string;
}

interface PanelManagerState {
  activePanel: PanelType;
  guidanceContext: GuidanceContext | null;
  rebeccaContext: RebeccaContext | null;
  /** Persisted user preference: should the Rebecca rail be open by default? */
  rebeccaRailUserPref: boolean;
  /** True once we've hydrated from the server-side user record. */
  hydrated: boolean;
  hydrate: (open: boolean) => void;
  /** Reset hydration so the next mount/login can re-hydrate per-user. */
  resetHydration: () => void;
  openGuidance: (context: GuidanceContext) => void;
  openRebecca: (context?: RebeccaContext) => void;
  /** Explicit user collapse — clears pref and persists `false`. */
  closeRebecca: () => void;
  /** Generic cleanup (Esc on guidance, etc.). Does NOT change rail pref. */
  closeAll: () => void;
}

export const usePanelManager = create<PanelManagerState>((set) => ({
  activePanel: null,
  guidanceContext: null,
  rebeccaContext: null,
  rebeccaRailUserPref: false,
  hydrated: false,

  hydrate: (open) =>
    set({ rebeccaRailUserPref: open, hydrated: true }),

  resetHydration: () =>
    set({ hydrated: false, rebeccaRailUserPref: false, activePanel: null, rebeccaContext: null }),

  openGuidance: (context) =>
    set({
      activePanel: "guidance",
      guidanceContext: context,
      rebeccaContext: null,
    }),

  openRebecca: (context) =>
    set({
      activePanel: "rebecca",
      rebeccaContext: context ?? null,
      guidanceContext: null,
      rebeccaRailUserPref: true,
    }),

  closeRebecca: () =>
    set((s) => ({
      activePanel: s.activePanel === "rebecca" ? null : s.activePanel,
      rebeccaContext: null,
      rebeccaRailUserPref: false,
    })),

  closeAll: () =>
    set({
      activePanel: null,
      guidanceContext: null,
      rebeccaContext: null,
    }),
}));

/** True iff the Rebecca rail should currently be visible on screen. */
export function isRebeccaRailVisible(state: PanelManagerState): boolean {
  return state.rebeccaRailUserPref && state.activePanel !== "guidance";
}

export type { GuidanceContext, RebeccaContext, PanelType };
