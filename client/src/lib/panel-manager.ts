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
  currentValue?: number | null;
  guidanceLow?: number | null;
  guidanceMid?: number | null;
  guidanceHigh?: number | null;
  entityType?: "property" | "company";
  entityId?: number;
}

interface PanelManagerState {
  activePanel: PanelType;
  guidanceContext: GuidanceContext | null;
  rebeccaContext: RebeccaContext | null;
  openGuidance: (context: GuidanceContext) => void;
  openRebecca: (context?: RebeccaContext) => void;
  closeAll: () => void;
}

export const usePanelManager = create<PanelManagerState>((set) => ({
  activePanel: null,
  guidanceContext: null,
  rebeccaContext: null,

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
    }),

  closeAll: () =>
    set({
      activePanel: null,
      guidanceContext: null,
      rebeccaContext: null,
    }),
}));

export type { GuidanceContext, RebeccaContext, PanelType };
