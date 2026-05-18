import { create } from "zustand";
import type { ReactNode } from "react";

export interface ProcessingCardJob {
  id: string;
  title: string;
  captions: string[];
  caption?: string;
  animation?: ReactNode;
  progress?: number;
  onCancel?: () => void;
}

interface ProcessingCardState {
  job: ProcessingCardJob | null;
  spawn: (job: ProcessingCardJob) => void;
  update: (patch: Partial<Pick<ProcessingCardJob, "caption" | "progress">>) => void;
  dismiss: () => void;
}

export const useProcessingCardStore = create<ProcessingCardState>((set) => ({
  job: null,
  spawn: (job) => set({ job }),
  update: (patch) =>
    set((state) =>
      state.job ? { job: { ...state.job, ...patch } } : state,
    ),
  dismiss: () => set({ job: null }),
}));
