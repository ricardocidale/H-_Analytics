import { create } from "zustand";

interface QueuedResearch {
  id: string;
  label: string;
  propertyId?: number;
  type: "property" | "company" | "global";
  status: "queued" | "active" | "complete" | "error" | "rate-limited";
  position: number;
  startedAt?: number;
  completedAt?: number;
  retryCount: number;
  error?: string;
}

interface ResearchQueueState {
  items: QueuedResearch[];
  maxConcurrent: number;
  isProcessing: boolean;

  enqueue: (item: Omit<QueuedResearch, "status" | "position" | "retryCount">) => void;
  remove: (id: string) => void;
  markActive: (id: string) => void;
  markComplete: (id: string) => void;
  markError: (id: string, error: string) => void;
  markRateLimited: (id: string) => void;
  clearCompleted: () => void;
  getNext: () => QueuedResearch | undefined;
  activeCount: () => number;
  queuedCount: () => number;
}

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 5000;

function reindex(items: QueuedResearch[]): QueuedResearch[] {
  let pos = 0;
  return items.map((item) => {
    if (item.status === "queued") {
      pos++;
      return { ...item, position: pos };
    }
    return { ...item, position: 0 };
  });
}

export const useResearchQueue = create<ResearchQueueState>((set, get) => ({
  items: [],
  maxConcurrent: 2,
  isProcessing: false,

  enqueue: (item) => {
    set((state) => {
      const queuedCount = state.items.filter((i) => i.status === "queued").length;
      return {
        items: [
          ...state.items,
          { ...item, status: "queued" as const, position: queuedCount + 1, retryCount: 0 },
        ],
        isProcessing: true,
      };
    });
  },

  remove: (id) => {
    set((state) => ({
      items: reindex(state.items.filter((i) => i.id !== id)),
    }));
  },

  markActive: (id) => {
    set((state) => ({
      items: reindex(
        state.items.map((i) =>
          i.id === id ? { ...i, status: "active" as const, startedAt: Date.now() } : i
        )
      ),
      isProcessing: true,
    }));
  },

  markComplete: (id) => {
    set((state) => {
      const updated = reindex(
        state.items.map((i) =>
          i.id === id ? { ...i, status: "complete" as const, completedAt: Date.now() } : i
        )
      );
      return {
        items: updated,
        isProcessing: updated.some((i) => i.status === "active" || i.status === "queued"),
      };
    });
  },

  markError: (id, error) => {
    set((state) => ({
      items: reindex(
        state.items.map((i) =>
          i.id === id ? { ...i, status: "error" as const, error } : i
        )
      ),
    }));
  },

  markRateLimited: (id) => {
    set((state) => ({
      items: reindex(
        state.items.map((i) => {
          if (i.id !== id) return i;
          const retryCount = i.retryCount + 1;
          if (retryCount > MAX_RETRIES) {
            return { ...i, status: "error" as const, error: "Rate limit exceeded after retries" };
          }
          return { ...i, status: "queued" as const, retryCount };
        })
      ),
    }));
  },

  clearCompleted: () => {
    set((state) => ({
      items: reindex(state.items.filter((i) => i.status !== "complete")),
    }));
  },

  getNext: () => {
    const state = get();
    const activeCount = state.items.filter((i) => i.status === "active").length;
    if (activeCount >= state.maxConcurrent) return undefined;
    return state.items.find((i) => i.status === "queued");
  },

  activeCount: () => get().items.filter((i) => i.status === "active").length,
  queuedCount: () => get().items.filter((i) => i.status === "queued").length,
}));

export function getBackoffDelay(retryCount: number): number {
  // eslint-disable-next-line no-restricted-syntax -- exponential backoff, non-financial
  return BASE_BACKOFF_MS * Math.pow(2, retryCount - 1) + Math.random() * 1000;
}
