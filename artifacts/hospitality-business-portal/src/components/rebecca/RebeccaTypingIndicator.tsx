/**
 * RebeccaTypingIndicator — shows Rebecca thinking while composing a response.
 *
 * Migrated to the shared agent-animations system. Uses AgentThinkingState
 * with persona "rebecca" and cycles through three cognitive phases. The
 * RebeccaOrb provides the persona visual; a phase label provides narration.
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RebeccaAvatar } from "./RebeccaAvatar";
import { AgentThinkingState } from "@/components/agent-animations";
import type { AgentPhase } from "@/components/agent-animations";

// ── Phase cycling ──────────────────────────────────────────────────────────────

/**
 * Phase sequence Rebecca cycles through while composing a response.
 * Aligned with the canonical agent-taxonomy narration labels in AgentThinkingState.
 */
const REBECCA_PHASES: readonly AgentPhase[] = [
  "dispatching",  // Searching portfolio data…
  "thinking",     // Analyzing benchmarks…
  "synthesizing", // Composing response…
] as const;

/**
 * Displayed narration text — one per phase. Must stay in sync with
 * REBECCA_PHASES array order.
 */
const PHASE_LABELS: readonly string[] = [
  "Searching portfolio data",
  "Analyzing benchmarks",
  "Composing response",
] as const;

/** How long each phase label is shown before advancing (milliseconds). */
const PHASE_INTERVAL_MS = 2800;

// ── Component ──────────────────────────────────────────────────────────────────

export function RebeccaTypingIndicator() {
  const [phaseIndex, setPhaseIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setPhaseIndex((prev) => Math.min(prev + 1, REBECCA_PHASES.length - 1));
    }, PHASE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const currentPhase = REBECCA_PHASES[phaseIndex] ?? "thinking";
  const currentLabel = PHASE_LABELS[phaseIndex] ?? PHASE_LABELS[0];

  return (
    <div
      className="flex items-start gap-2"
      data-testid="rebecca-typing-indicator"
      role="status"
      aria-live="polite"
      aria-label="Rebecca is thinking"
    >
      <RebeccaAvatar size="sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="bg-muted rounded-lg rounded-tl-sm px-3 py-2 text-sm text-muted-foreground"
      >
        <div className="flex items-center gap-2">
          {/* Persona orb — visual identity mark */}
          <AgentThinkingState
            persona="rebecca"
            phase={currentPhase}
            size="sm"
            aria-label="Rebecca is thinking"
          />

          {/* Phase narration label — animated fade/blur transition */}
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
        </div>
      </motion.div>
    </div>
  );
}
