/**
 * RebeccaTypingIndicator — shows Rebecca thinking while composing a response.
 *
 * Uses AgentThinkingState (persona "rebecca") and cycles through three phases.
 * All motion is skipped when the user prefers reduced motion.
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RebeccaAvatar } from "./RebeccaAvatar";
import { AgentThinkingState } from "@/components/agent-animations";
import { useReducedMotion } from "@/components/agent-animations/useReducedMotion";
import type { AgentPhase } from "@/components/agent-animations";

const REBECCA_PHASES: readonly AgentPhase[] = [
  "dispatching",  // Searching portfolio data…
  "thinking",     // Analyzing benchmarks…
  "synthesizing", // Composing response…
] as const;

const PHASE_LABELS: readonly string[] = [
  "Searching portfolio data",
  "Analyzing benchmarks",
  "Composing response",
] as const;

/** How long each phase label is shown before advancing (milliseconds). */
const PHASE_INTERVAL_MS = 2800;

export function RebeccaTypingIndicator() {
  const [phaseIndex, setPhaseIndex] = useState(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const interval = setInterval(() => {
      setPhaseIndex((prev) => Math.min(prev + 1, REBECCA_PHASES.length - 1));
    }, PHASE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const currentPhase = REBECCA_PHASES[phaseIndex] ?? "thinking";
  const currentLabel = PHASE_LABELS[phaseIndex] ?? PHASE_LABELS[0];

  const bubbleContent = (
    <div className="flex items-center gap-2">
      <AgentThinkingState
        persona="rebecca"
        phase={currentPhase}
        size="sm"
        aria-label="Rebecca is thinking"
      />

      {reducedMotion ? (
        <span className="text-xs">{currentLabel}</span>
      ) : (
        <AnimatePresence mode="wait">
          <motion.span
            key={phaseIndex}
            initial={{ opacity: 0, filter: "blur(4px)", y: 6 }}
            animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
            exit={{ opacity: 0, filter: "blur(4px)", y: -6 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="text-xs"
          >
            {currentLabel}
          </motion.span>
        </AnimatePresence>
      )}
    </div>
  );

  return (
    <div
      className="flex items-start gap-2"
      data-testid="rebecca-typing-indicator"
      role="status"
      aria-live="polite"
      aria-label="Rebecca is thinking"
    >
      <RebeccaAvatar size="sm" />
      {reducedMotion ? (
        <div className="bg-muted rounded-lg rounded-tl-sm px-3 py-2 text-sm text-muted-foreground">
          {bubbleContent}
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="bg-muted rounded-lg rounded-tl-sm px-3 py-2 text-sm text-muted-foreground"
        >
          {bubbleContent}
        </motion.div>
      )}
    </div>
  );
}
