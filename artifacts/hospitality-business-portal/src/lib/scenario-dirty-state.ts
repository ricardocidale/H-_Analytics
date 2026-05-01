import { create } from "zustand";

interface ScenarioDirtyState {
  isDirty: boolean;
  activeScenarioName: string | null;
  activeScenarioKind: string | null;
  setDirty: (dirty: boolean) => void;
  markDirty: () => void;
  clearDirty: () => void;
  setActiveScenario: (name: string | null, kind?: string | null) => void;
}

export const useScenarioDirtyState = create<ScenarioDirtyState>((set) => ({
  isDirty: false,
  activeScenarioName: null,
  activeScenarioKind: null,
  setDirty: (dirty) => set({ isDirty: dirty }),
  markDirty: () => set({ isDirty: true }),
  clearDirty: () => set({ isDirty: false }),
  setActiveScenario: (name, kind) => set({ activeScenarioName: name, activeScenarioKind: kind ?? null }),
}));
