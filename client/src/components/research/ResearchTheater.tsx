import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  IconCheckCircle,
  IconXCircle,
  IconDollarSign,
} from "@/components/icons";
import { X } from "@/components/icons/themed-icons";
import { ThinkingRing } from "@/components/ui/ai-loader";
import { cn } from "@/lib/utils";

interface ResearchJob {
  id: string;
  label: string;
  group: string;
  status: "pending" | "generating" | "complete" | "error";
}

interface ResearchTheaterProps {
  jobs: ResearchJob[];
  streamingText?: string;
  estimatedCost?: number;
  onCancel?: () => void;
  isVisible: boolean;
}

const statusIcons: Record<ResearchJob["status"], React.ReactNode> = {
  pending: <span className="text-muted-foreground text-sm">{"\u25CB"}</span>,
  generating: <ThinkingRing size={16} />,
  complete: <IconCheckCircle className="h-4 w-4 text-primary" />,
  error: <IconXCircle className="h-4 w-4 text-destructive" />,
};

const containerVariants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.3, ease: "easeOut" as const },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    transition: { duration: 0.2, ease: "easeIn" as const },
  },
};

const jobItemVariants = {
  hidden: { opacity: 0, x: -12 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.06, duration: 0.25, ease: "easeOut" as const },
  }),
};

export function ResearchTheater({
  jobs,
  streamingText,
  estimatedCost,
  onCancel,
  isVisible,
}: ResearchTheaterProps) {
  const completedCount = jobs.filter((j) => j.status === "complete").length;
  const totalCount = jobs.length;
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const groupedJobs = useMemo(() => {
    const groups: Record<string, ResearchJob[]> = {};
    for (const job of jobs) {
      if (!groups[job.group]) {
        groups[job.group] = [];
      }
      groups[job.group].push(job);
    }
    return groups;
  }, [jobs]);

  const estimatedTimeRemaining = useMemo(() => {
    const remaining = jobs.filter(
      (j) => j.status === "pending" || j.status === "generating",
    ).length;
    const secondsPerJob = 15;
    const totalSeconds = remaining * secondsPerJob;

    if (totalSeconds < 60) {
      return `~${totalSeconds}s remaining`;
    }
    const minutes = Math.ceil(totalSeconds / 60);
    return `~${minutes}m remaining`;
  }, [jobs]);

  const previewText = streamingText
    ? streamingText.slice(-300)
    : "";

  let flatIndex = 0;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        >
          <Card className="relative w-full max-w-2xl bg-card/95 backdrop-blur-xl border-primary/20 shadow-2xl rounded-2xl overflow-hidden">
            {/* Accent border glow */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

            <div className="p-6 space-y-5">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-xl font-semibold text-foreground">
                    Consulting sources
                  </h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {completedCount} of {totalCount} complete
                    <span className="mx-2 text-border">{"\u00B7"}</span>
                    {estimatedTimeRemaining}
                  </p>
                </div>
                {onCancel && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onCancel}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Cancel
                  </Button>
                )}
              </div>

              {/* Progress Bar */}
              <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden">
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary to-primary/70"
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>

              {/* Job Groups */}
              <div className="space-y-4 max-h-64 overflow-y-auto pr-1">
                {Object.entries(groupedJobs).map(([group, groupJobs]) => (
                  <div key={group} className="space-y-1.5">
                    <p className="label-text text-muted-foreground font-medium uppercase tracking-wide">
                      {group}
                    </p>
                    <div className="space-y-1">
                      {groupJobs.map((job) => {
                        const idx = flatIndex++;
                        return (
                          <motion.div
                            key={job.id}
                            custom={idx}
                            variants={jobItemVariants}
                            initial="hidden"
                            animate="visible"
                            className={cn(
                              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                              job.status === "generating" &&
                                "bg-primary/5 border border-primary/10",
                              job.status === "complete" && "opacity-70",
                              job.status === "error" && "bg-destructive/5",
                              job.status === "pending" && "opacity-50",
                            )}
                          >
                            <div className="shrink-0">
                              {statusIcons[job.status]}
                            </div>
                            <span
                              className={cn(
                                "text-foreground",
                                job.status === "generating" && "font-medium",
                              )}
                            >
                              {job.label}
                            </span>
                            {job.status === "generating" && (
                              <motion.div
                                className="ml-auto h-1.5 w-1.5 rounded-full bg-primary"
                                animate={{ opacity: [1, 0.3, 1] }}
                                transition={{
                                  duration: 1.5,
                                  repeat: Infinity,
                                  ease: "easeInOut",
                                }}
                              />
                            )}
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Streaming Preview */}
              {previewText && (
                <div className="rounded-lg border border-border bg-muted/50 p-3 max-h-32 overflow-y-auto">
                  <p className="label-text text-muted-foreground mb-1.5">
                    Live Output
                  </p>
                  <pre className="text-xs text-foreground/80 font-mono whitespace-pre-wrap leading-relaxed">
                    {previewText}
                  </pre>
                </div>
              )}

              {/* Footer: Cost */}
              {estimatedCost != null && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <IconDollarSign className="h-3.5 w-3.5" />
                  <span>
                    Estimated cost:{" "}
                    <span className="font-medium text-foreground">
                      ${estimatedCost.toFixed(4)}
                    </span>
                  </span>
                </div>
              )}
            </div>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export type { ResearchJob, ResearchTheaterProps };
