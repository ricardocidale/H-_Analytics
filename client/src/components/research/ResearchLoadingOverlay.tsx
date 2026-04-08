import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Loader2, TrendingUp, BarChart3, Building2, Search, Database, Brain, Globe, Zap } from "lucide-react";

const RESEARCH_TIPS = [
  { icon: TrendingUp, text: "Analyzing market trends and comparable properties..." },
  { icon: BarChart3, text: "Cross-referencing industry benchmarks with your data..." },
  { icon: Building2, text: "Evaluating property performance against peers..." },
  { icon: Search, text: "Scanning recent transaction data and market reports..." },
  { icon: Database, text: "Aggregating data from multiple intelligence sources..." },
  { icon: Brain, text: "Running multi-model analysis for deeper insights..." },
  { icon: Globe, text: "Checking macro-economic indicators and rates..." },
  { icon: Zap, text: "Synthesizing findings into actionable recommendations..." },
];

interface ResearchLoadingOverlayProps {
  isVisible: boolean;
  phases?: string[];
  queuePosition?: number;
  queueTotal?: number;
  className?: string;
  variant?: "inline" | "fullscreen" | "compact";
}

function useRotatingTip(isVisible: boolean) {
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    if (!isVisible) {
      setTipIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % RESEARCH_TIPS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [isVisible]);

  return RESEARCH_TIPS[tipIndex];
}

function PulsingOrb() {
  return (
    <div className="relative w-16 h-16">
      <motion.div
        className="absolute inset-0 rounded-full bg-primary/20"
        animate={{ scale: [1, 1.4, 1], opacity: [0.3, 0.1, 0.3] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute inset-2 rounded-full bg-primary/30"
        animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.2, 0.5] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
      />
      <motion.div
        className="absolute inset-4 rounded-full bg-primary/50 flex items-center justify-center"
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
      >
        <Brain className="w-4 h-4 text-primary-foreground" />
      </motion.div>
    </div>
  );
}

function WaveformBar({ delay }: { delay: number }) {
  return (
    <motion.div
      className="w-1 rounded-full bg-primary/40"
      animate={{ height: [8, 24, 12, 20, 8] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut", delay }}
    />
  );
}

function Waveform() {
  return (
    <div className="flex items-end gap-0.5 h-6">
      {[0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9].map((d) => (
        <WaveformBar key={d} delay={d} />
      ))}
    </div>
  );
}

export function ResearchLoadingOverlay({
  isVisible,
  phases = [],
  queuePosition,
  queueTotal,
  className,
  variant = "inline",
}: ResearchLoadingOverlayProps) {
  const currentTip = useRotatingTip(isVisible);
  const latestPhase = phases[phases.length - 1];

  const displayMessage = latestPhase || currentTip?.text || "Preparing analysis...";
  const TipIcon = currentTip?.icon || Search;

  const elapsedSeconds = useElapsedTimer(isVisible);

  if (!isVisible) return null;

  if (variant === "compact") {
    return (
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        className={cn(
          "flex items-center gap-3 px-4 py-2.5 rounded-lg bg-primary/5 border border-primary/10",
          className
        )}
        data-testid="research-loading-compact"
      >
        <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
        <AnimatePresence mode="wait">
          <motion.span
            key={displayMessage}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.3 }}
            className="text-sm text-foreground/80 truncate"
          >
            {displayMessage}
          </motion.span>
        </AnimatePresence>
        {elapsedSeconds > 0 && (
          <span className="text-xs text-muted-foreground ml-auto shrink-0">
            {formatElapsed(elapsedSeconds)}
          </span>
        )}
      </motion.div>
    );
  }

  if (variant === "fullscreen") {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          data-testid="research-loading-fullscreen"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="bg-card/95 backdrop-blur-xl border border-primary/20 rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 space-y-6"
          >
            <div className="flex flex-col items-center gap-4">
              <PulsingOrb />
              <div className="text-center space-y-1">
                <h3 className="text-lg font-semibold">Research in Progress</h3>
                {elapsedSeconds >= 5 && (
                  <p className="text-sm text-muted-foreground">
                    {formatElapsed(elapsedSeconds)} elapsed
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <Waveform />
              <AnimatePresence mode="wait">
                <motion.div
                  key={displayMessage}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.4 }}
                  className="flex items-center gap-2.5 text-sm text-foreground/80"
                >
                  <TipIcon className="w-4 h-4 text-primary shrink-0" />
                  <span>{displayMessage}</span>
                </motion.div>
              </AnimatePresence>
            </div>

            {queuePosition != null && queueTotal != null && queueTotal > 1 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t border-border/40">
                <div className="flex gap-1">
                  {Array.from({ length: queueTotal }).map((_, i) => (
                    <motion.div
                      key={i}
                      className={cn(
                        "w-2 h-2 rounded-full",
                        i < queuePosition ? "bg-primary" : i === queuePosition ? "bg-primary animate-pulse" : "bg-muted-foreground/30"
                      )}
                    />
                  ))}
                </div>
                <span>
                  {queuePosition + 1} of {queueTotal} in queue
                </span>
              </div>
            )}

            {phases.length > 0 && (
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {phases.slice(-5).map((phase, i) => (
                  <motion.div
                    key={`${phase}-${i}`}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: i === phases.slice(-5).length - 1 ? 1 : 0.5, x: 0 }}
                    className="flex items-center gap-2 text-xs"
                  >
                    {i === phases.slice(-5).length - 1 ? (
                      <Loader2 className="w-3 h-3 animate-spin text-primary" />
                    ) : (
                      <div className="w-3 h-3 rounded-full bg-primary/30 flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      </div>
                    )}
                    <span className="text-muted-foreground">{phase}</span>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className={cn(
        "rounded-xl border border-primary/15 bg-gradient-to-br from-primary/5 to-transparent p-5 space-y-4",
        className
      )}
      data-testid="research-loading-inline"
    >
      <div className="flex items-center gap-3">
        <PulsingOrb />
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold">Generating Research</h4>
            <span className="text-xs text-muted-foreground">{formatElapsed(elapsedSeconds)}</span>
          </div>
          <AnimatePresence mode="wait">
            <motion.p
              key={displayMessage}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="text-xs text-muted-foreground truncate"
            >
              {displayMessage}
            </motion.p>
          </AnimatePresence>
        </div>
        <Waveform />
      </div>

      {queuePosition != null && queueTotal != null && queueTotal > 1 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="flex gap-0.5">
            {Array.from({ length: queueTotal }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  i < queuePosition ? "bg-primary" : i === queuePosition ? "bg-primary animate-pulse" : "bg-muted-foreground/30"
                )}
              />
            ))}
          </div>
          <span>Position {queuePosition + 1} of {queueTotal}</span>
        </div>
      )}
    </motion.div>
  );
}

function useElapsedTimer(isActive: boolean) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isActive]);

  return elapsed;
}

function formatElapsed(seconds: number): string {
  if (seconds < 5) return "";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}
