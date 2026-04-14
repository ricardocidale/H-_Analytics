import { create } from "zustand";
import { motion, AnimatePresence } from "framer-motion";
import { Lightbulb, X, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RebeccaAvatar } from "./RebeccaAvatar";
import { cn } from "@/lib/utils";

export interface RebeccaInsight {
  id: string;
  message: string;
  type: "observation" | "warning" | "tip";
  timestamp: number;
  dismissed: boolean;
  context?: string;
}

interface InsightState {
  insights: RebeccaInsight[];
  seenHashes: Set<string>;
  addInsight: (insight: Omit<RebeccaInsight, "id" | "timestamp" | "dismissed">, sourceHash?: string) => void;
  dismissInsight: (id: string) => void;
  dismissAll: () => void;
  activeInsight: () => RebeccaInsight | undefined;
}

export const useRebeccaInsightStore = create<InsightState>((set, get) => ({
  insights: [],
  seenHashes: new Set<string>(),
  addInsight: (insight, sourceHash?) => {
    if (sourceHash && get().seenHashes.has(sourceHash)) return;
    set((state) => {
      const newSeenHashes = new Set(state.seenHashes);
      if (sourceHash) newSeenHashes.add(sourceHash);
      return {
        seenHashes: newSeenHashes,
        insights: [
          {
            ...insight,
            id: `insight-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            timestamp: Date.now(),
            dismissed: false,
          },
          ...state.insights,
        ].slice(0, 10),
      };
    });
  },
  dismissInsight: (id) =>
    set((state) => ({
      insights: state.insights.map((i) =>
        i.id === id ? { ...i, dismissed: true } : i
      ),
    })),
  dismissAll: () =>
    set((state) => ({
      insights: state.insights.map((i) => ({ ...i, dismissed: true })),
    })),
  activeInsight: () => get().insights.find((i) => !i.dismissed),
}));

interface RebeccaInsightBannerProps {
  onAskRebecca?: (question: string) => void;
  className?: string;
}

const TYPE_STYLES = {
  observation: "border-primary/20 bg-primary/5",
  warning: "border-orange-400/30 bg-orange-50/50 dark:bg-orange-950/20",
  tip: "border-emerald-400/30 bg-emerald-50/50 dark:bg-emerald-950/20",
} as const;

const _TYPE_ICONS = {
  observation: Lightbulb,
  warning: Lightbulb,
  tip: Lightbulb,
} as const;

export function RebeccaInsightBanner({ onAskRebecca, className }: RebeccaInsightBannerProps) {
  const { activeInsight, dismissInsight } = useRebeccaInsightStore();
  const insight = activeInsight();

  return (
    <AnimatePresence>
      {insight && (
        <motion.div
          key={insight.id}
          initial={{ opacity: 0, height: 0, marginBottom: 0 }}
          animate={{ opacity: 1, height: "auto", marginBottom: 8 }}
          exit={{ opacity: 0, height: 0, marginBottom: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className={cn("overflow-hidden", className)}
          data-testid="rebecca-insight-banner"
        >
          <div className={cn(
            "rounded-lg border px-3 py-2.5",
            TYPE_STYLES[insight.type],
          )}>
            <div className="flex items-start gap-2">
              <RebeccaAvatar size="sm" className="mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground/90 leading-relaxed" data-testid="text-insight-message">
                  {insight.message}
                </p>
                {onAskRebecca && insight.context && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      onAskRebecca(insight.context!);
                      dismissInsight(insight.id);
                    }}
                    className="h-6 px-2 mt-1 text-[11px] text-primary hover:text-primary gap-1"
                    data-testid="button-insight-ask"
                  >
                    <MessageCircle className="w-3 h-3" />
                    Ask Rebecca about this
                  </Button>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 shrink-0 opacity-50 hover:opacity-100"
                onClick={() => dismissInsight(insight.id)}
                data-testid="button-insight-dismiss"
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
