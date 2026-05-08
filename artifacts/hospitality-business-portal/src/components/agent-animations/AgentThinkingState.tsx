/**
 * AgentThinkingState — canonical persona animation component.
 *
 * Routes to the persona-specific orb + phase label. Falls back to a static
 * letter avatar + static label with no motion when the user prefers reduced
 * motion (prefers-reduced-motion: reduce).
 *
 * Usage:
 *   <AgentThinkingState persona="gustavo" phase="synthesizing" size="sm" />
 *   <AgentThinkingState persona="marco" phase="dispatching" size="md" showLabel />
 */

import { motion, AnimatePresence } from "framer-motion";
import { useReducedMotion } from "./useReducedMotion";
import { GustavoOrb }    from "./GustavoOrb";
import { MarcoOrb }      from "./MarcoOrb";
import { RebeccaOrb }    from "./RebeccaOrb";
import { IrisOrb }       from "./IrisOrb";
import { SpecialistOrb } from "./SpecialistOrb";
import { cn } from "@/lib/utils";
import type { AgentPhase, AgentPersona, AgentOrbSize } from "./types";
import { ORB_SIZE_PX } from "./types";

export type { AgentPhase, AgentPersona, AgentOrbSize };

const PHASE_NARRATION: Record<AgentPersona, Partial<Record<AgentPhase, string>>> = {
  gustavo: {
    dispatching:  "Dispatching specialists…",
    thinking:     "Analyzing data…",
    synthesizing: "Reconciling outputs…",
    complete:     "Analysis complete",
    error:        "Analysis error",
  },
  marco: {
    dispatching:  "Dispatching teams…",
    thinking:     "Building slides…",
    synthesizing: "Running Maya…",
    complete:     "Build complete",
    error:        "Build failed",
  },
  rebecca: {
    dispatching:  "Searching portfolio data…",
    thinking:     "Analyzing benchmarks…",
    synthesizing: "Composing response…",
    complete:     "Done",
    error:        "Something went wrong",
  },
  iris: {
    dispatching:  "Scanning resources…",
    thinking:     "Checking freshness…",
    synthesizing: "Updating index…",
    complete:     "Index updated",
    error:        "Scan error",
  },
  specialist: {
    dispatching:  "Dispatching…",
    thinking:     "Analyzing…",
    synthesizing: "Synthesizing…",
    complete:     "Complete",
    error:        "Error",
  },
};

const PERSONA_LETTER: Record<AgentPersona, string> = {
  gustavo:    "G",
  marco:      "M",
  rebecca:    "R",
  iris:       "I",
  specialist: "S",
};

const PERSONA_AVATAR_COLOR: Record<AgentPersona, string> = {
  gustavo:    "text-accent-pop",
  marco:      "text-success",
  rebecca:    "text-primary",
  iris:       "text-info",
  specialist: "text-muted-foreground",
};

const LABEL_TEXT_SIZE: Record<AgentOrbSize, string> = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

export interface AgentThinkingStateProps {
  persona: AgentPersona;
  phase: AgentPhase;
  size?: AgentOrbSize;
  /** When true, renders the phase narration label next to the orb. */
  showLabel?: boolean;
  className?: string;
  /** Accessible label for screen readers. Defaults to "<Persona> is <phase>." */
  "aria-label"?: string;
}

export function AgentThinkingState({
  persona,
  phase,
  size = "md",
  showLabel = false,
  className,
  "aria-label": ariaLabel,
}: AgentThinkingStateProps) {
  const reducedMotion = useReducedMotion();
  const label = PHASE_NARRATION[persona][phase];
  const accessibleLabel = ariaLabel ?? `${persona} is ${phase}.`;

  return (
    <div
      className={cn("inline-flex items-center gap-2", className)}
      role="status"
      aria-label={accessibleLabel}
    >
      {reducedMotion ? (
        <StaticAvatar persona={persona} size={size} />
      ) : (
        <OrbSwitch persona={persona} phase={phase} size={size} />
      )}

      {showLabel && label && (
        reducedMotion ? (
          // No motion — plain static label
          <span
            className={cn(LABEL_TEXT_SIZE[size], "text-muted-foreground leading-none")}
            aria-hidden
          >
            {label}
          </span>
        ) : (
          // Animated label with fade+blur transition between phases
          <AnimatePresence mode="wait">
            <motion.span
              key={`${persona}-${phase}`}
              initial={{ opacity: 0, y: 3, filter: "blur(3px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -3, filter: "blur(3px)" }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className={cn(LABEL_TEXT_SIZE[size], "text-muted-foreground leading-none")}
              aria-hidden
            >
              {label}
            </motion.span>
          </AnimatePresence>
        )
      )}
    </div>
  );
}

function OrbSwitch({ persona, phase, size }: { persona: AgentPersona; phase: AgentPhase; size: AgentOrbSize }) {
  switch (persona) {
    case "gustavo":    return <GustavoOrb phase={phase} size={size} />;
    case "marco":      return <MarcoOrb phase={phase} size={size} />;
    case "rebecca":    return <RebeccaOrb phase={phase} size={size} />;
    case "iris":       return <IrisOrb phase={phase} size={size} />;
    case "specialist": return <SpecialistOrb phase={phase} size={size} />;
  }
}

function StaticAvatar({ persona, size }: { persona: AgentPersona; size: AgentOrbSize }) {
  const diameter = ORB_SIZE_PX[size];
  const fontSize = Math.round(diameter * 0.52);

  return (
    <span
      style={{ width: diameter, height: diameter, fontSize, lineHeight: `${diameter}px` }}
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold bg-muted",
        PERSONA_AVATAR_COLOR[persona],
      )}
      aria-hidden
    >
      {PERSONA_LETTER[persona]}
    </span>
  );
}
