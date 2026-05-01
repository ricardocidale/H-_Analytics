import { useResearchQueue } from "@/lib/research-queue";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Clock, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ResearchQueueIndicatorProps {
  className?: string;
}

export function ResearchQueueIndicator({ className }: ResearchQueueIndicatorProps) {
  const items = useResearchQueue((s) => s.items);
  const activeItems = items.filter((i) => i.status === "active");
  const queuedItems = items.filter((i) => i.status === "queued");
  const recentComplete = items.filter(
    (i) => i.status === "complete" && i.completedAt && Date.now() - i.completedAt < 10000
  );

  const hasActivity = activeItems.length > 0 || queuedItems.length > 0 || recentComplete.length > 0;

  if (!hasActivity) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium",
          activeItems.length > 0
            ? "bg-primary/10 text-primary border border-primary/20"
            : recentComplete.length > 0
              ? "bg-green-500/10 text-green-600 border border-green-500/20"
              : "bg-muted text-muted-foreground border border-border",
          className
        )}
        data-testid="research-queue-indicator"
      >
        {activeItems.length > 0 && (
          <>
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>
              {activeItems.length} researching
              {queuedItems.length > 0 && ` · ${queuedItems.length} queued`}
            </span>
          </>
        )}
        {activeItems.length === 0 && queuedItems.length > 0 && (
          <>
            <Clock className="w-3 h-3" />
            <span>{queuedItems.length} queued</span>
          </>
        )}
        {activeItems.length === 0 && queuedItems.length === 0 && recentComplete.length > 0 && (
          <>
            <CheckCircle className="w-3 h-3" />
            <span>{recentComplete.length} complete</span>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
