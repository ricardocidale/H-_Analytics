import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RebeccaAvatar } from "./RebeccaAvatar";
import { BreathingDots } from "@/components/ui/ai-loader";

const PHASES = [
  "Searching portfolio data",
  "Analyzing benchmarks",
  "Composing response",
];

const PHASE_INTERVAL_MS = 2800;

export function RebeccaTypingIndicator() {
  const [phaseIndex, setPhaseIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setPhaseIndex((prev) => Math.min(prev + 1, PHASES.length - 1));
    }, PHASE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-start gap-2" data-testid="rebecca-typing-indicator" role="status" aria-live="polite" aria-label="Rebecca is thinking">
      <RebeccaAvatar size="sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="bg-muted rounded-lg rounded-tl-sm px-3 py-2 text-sm text-muted-foreground"
      >
        <div className="flex items-center gap-2">
          <AnimatePresence mode="wait">
            <motion.span
              key={phaseIndex}
              initial={{ opacity: 0, filter: "blur(4px)", y: 6 }}
              animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
              exit={{ opacity: 0, filter: "blur(4px)", y: -6 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="text-xs"
            >
              {PHASES[phaseIndex]}
            </motion.span>
          </AnimatePresence>
          <BreathingDots />
        </div>
      </motion.div>
    </div>
  );
}
