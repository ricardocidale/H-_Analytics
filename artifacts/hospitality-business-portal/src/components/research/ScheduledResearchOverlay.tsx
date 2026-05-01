import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { RefreshCw, CheckCircle2, SkipForward } from "lucide-react";

interface StaleWorkflow {
  id: number;
  workflowKey: string;
  name: string;
  description: string | null;
  lastRunAt: string | null;
  frequencyHours: number;
}

interface StaleCheckResponse {
  hasStale: boolean;
  workflows: StaleWorkflow[];
}

type WorkflowStatus = "pending" | "running" | "completed" | "failed";

const pulseKeyframes = {
  scale: [1, 1.05, 1],
  opacity: [0.6, 1, 0.6],
};

function BrainAnimation() {
  return (
    <div className="relative w-32 h-32 mx-auto mb-6">
      <motion.div
        className="absolute inset-0 rounded-full bg-primary/10"
        animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.1, 0.3] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute inset-2 rounded-full bg-primary/15"
        animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.15, 0.4] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
      />
      <motion.div
        className="absolute inset-4 rounded-full bg-primary/20 flex items-center justify-center"
        animate={pulseKeyframes}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
      >
        <svg viewBox="0 0 64 64" className="w-16 h-16 text-primary" fill="none" stroke="currentColor" strokeWidth="1.5">
          <motion.path
            d="M32 8C18.7 8 8 18.7 8 32s10.7 24 24 24 24-10.7 24-24S45.3 8 32 8z"
            strokeDasharray="150"
            animate={{ strokeDashoffset: [150, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          />
          <motion.path
            d="M22 24c0-5.5 4.5-10 10-10s10 4.5 10 10"
            animate={{ pathLength: [0, 1] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.path
            d="M20 32h24M26 40h12M28 48h8"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
          />
          <circle cx="28" cy="28" r="2" fill="currentColor" opacity="0.6" />
          <circle cx="36" cy="28" r="2" fill="currentColor" opacity="0.6" />
          <motion.circle
            cx="32" cy="20" r="3"
            fill="currentColor"
            animate={{ opacity: [0.2, 0.8, 0.2], r: [2, 3.5, 2] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          />
        </svg>
      </motion.div>
      {[0, 1, 2, 3, 4, 5].map(i => (
        <motion.div
          key={i}
          className="absolute w-1.5 h-1.5 rounded-full bg-primary/40"
          style={{
            left: `${50 + 42 * Math.cos(i * Math.PI / 3)}%`,
            top: `${50 + 42 * Math.sin(i * Math.PI / 3)}%`,
          }}
          animate={{
            scale: [0, 1.5, 0],
            opacity: [0, 0.8, 0],
          }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            delay: i * 0.4,
            ease: "easeOut",
          }}
        />
      ))}
    </div>
  );
}

function WorkflowProgressItem({
  workflow,
  status,
  index,
}: {
  workflow: StaleWorkflow;
  status: WorkflowStatus;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.15, duration: 0.4, ease: "easeOut" }}
      className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-card/50 border border-border/40"
      data-testid={`overlay-workflow-${workflow.workflowKey}`}
    >
      <div className="shrink-0">
        {status === "completed" ? (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
          >
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          </motion.div>
        ) : status === "running" ? (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
          >
            <RefreshCw className="w-5 h-5 text-primary" />
          </motion.div>
        ) : status === "failed" ? (
          <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center">
            <span className="text-red-500 text-xs font-bold">!</span>
          </div>
        ) : (
          <div className="w-5 h-5 rounded-full bg-muted-foreground/10 border border-muted-foreground/20" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{workflow.name}</p>
        <p className="text-[11px] text-muted-foreground truncate">
          {status === "running"
            ? "Researching..."
            : status === "completed"
              ? "Updated successfully"
              : status === "failed"
                ? "Update failed"
                : "Waiting..."}
        </p>
      </div>
    </motion.div>
  );
}

export function useScheduledResearchCheck() {
  const [staleWorkflows, setStaleWorkflows] = useState<StaleWorkflow[]>([]);
  const [showOverlay, setShowOverlay] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (checked) return;
    const sessionKey = "hbg_research_check_ts";
    const lastCheck = sessionStorage.getItem(sessionKey);
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    if (lastCheck && parseInt(lastCheck) > fiveMinAgo) {
      setChecked(true);
      return;
    }

    const checkStale = async () => {
      try {
        const res = await fetch("/api/research/scheduled/check-stale", { credentials: "include" });
        if (!res.ok) { setChecked(true); return; }
        const data: StaleCheckResponse = await res.json();
        if (data.hasStale && data.workflows.length > 0) {
          setStaleWorkflows(data.workflows);
          setShowOverlay(true);
        }
        sessionStorage.setItem(sessionKey, String(Date.now()));
      } catch {
        /* silent */
      } finally {
        setChecked(true);
      }
    };

    const timer = setTimeout(checkStale, 2000);
    return () => clearTimeout(timer);
  }, [checked]);

  const dismiss = useCallback(() => {
    setShowOverlay(false);
  }, []);

  return { staleWorkflows, showOverlay, dismiss, checked };
}

export function ScheduledResearchOverlay({
  workflows,
  onDismiss,
}: {
  workflows: StaleWorkflow[];
  onDismiss: () => void;
}) {
  const [statuses, setStatuses] = useState<Record<number, WorkflowStatus>>({});
  const [allDone, setAllDone] = useState(false);
  const [autoCloseTimer, setAutoCloseTimer] = useState(3);

  const executeWorkflow = useCallback(async (wf: StaleWorkflow) => {
    setStatuses(prev => ({ ...prev, [wf.id]: "running" }));
    try {
      const response = await fetch(`/api/research/scheduled/${wf.id}/execute`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Request failed");
      const reader = response.body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          decoder.decode(value);
        }
      }
      setStatuses(prev => ({ ...prev, [wf.id]: "completed" }));
    } catch {
      setStatuses(prev => ({ ...prev, [wf.id]: "failed" }));
    }
  }, []);

  useEffect(() => {
    const runAll = async () => {
      for (const wf of workflows) {
        await executeWorkflow(wf);
      }
      setAllDone(true);
    };
    runAll();
  }, [workflows, executeWorkflow]);

  useEffect(() => {
    if (!allDone) return;
    const interval = setInterval(() => {
      setAutoCloseTimer(prev => {
        if (prev <= 1) {
          onDismiss();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [allDone, onDismiss]);

  const completedCount = Object.values(statuses).filter(s => s === "completed").length;
  const failedCount = Object.values(statuses).filter(s => s === "failed").length;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center"
        data-testid="scheduled-research-overlay"
      >
        <div className="absolute inset-0 bg-background/90 backdrop-blur-md" />

        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="relative z-10 w-full max-w-md mx-4"
        >
          <div className="text-center mb-6">
            <BrainAnimation />

            <motion.h2
              className="text-xl font-semibold text-foreground mb-2"
              animate={allDone ? {} : { opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 2, repeat: allDone ? 0 : Infinity }}
            >
              {allDone ? "Intelligence Updated" : "Updating Intelligence"}
            </motion.h2>

            <p className="text-sm text-muted-foreground">
              {allDone
                ? `${completedCount} topic${completedCount !== 1 ? "s" : ""} refreshed${failedCount > 0 ? `, ${failedCount} failed` : ""}`
                : "Refreshing primary research from online sources, APIs, and AI analysis..."}
            </p>
          </div>

          <div className="space-y-2 mb-6">
            {workflows.map((wf, index) => (
              <WorkflowProgressItem
                key={wf.id}
                workflow={wf}
                status={statuses[wf.id] ?? "pending"}
                index={index}
              />
            ))}
          </div>

          <div className="flex items-center justify-center gap-3">
            {allDone ? (
              <Button onClick={onDismiss} className="gap-2" data-testid="button-close-overlay">
                <CheckCircle2 className="w-4 h-4" />
                Continue ({autoCloseTimer}s)
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDismiss}
                className="text-muted-foreground hover:text-foreground gap-1.5"
                data-testid="button-skip-overlay"
              >
                <SkipForward className="w-4 h-4" />
                Skip — research will continue in background
              </Button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
