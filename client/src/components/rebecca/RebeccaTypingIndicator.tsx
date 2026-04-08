import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RebeccaAvatar } from "./RebeccaAvatar";

const PHASES = [
  "Searching portfolio data",
  "Analyzing benchmarks",
  "Composing response",
];

const PHASE_INTERVAL_MS = 2800;

function BouncingDots() {
  return (
    <span className="inline-flex items-center gap-[3px] ml-0.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-[5px] h-[5px] rounded-full bg-current opacity-60"
          animate={{ y: [0, -4, 0] }}
          transition={{
            duration: 0.5,
            repeat: Infinity,
            delay: i * 0.15,
            ease: "easeInOut",
          }}
        />
      ))}
    </span>
  );
}

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
      <div className="bg-muted rounded-lg rounded-tl-sm px-3 py-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <AnimatePresence mode="wait">
            <motion.span
              key={phaseIndex}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="text-xs"
            >
              {PHASES[phaseIndex]}
            </motion.span>
          </AnimatePresence>
          <BouncingDots />
        </div>
      </div>
    </div>
  );
}
