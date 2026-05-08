/**
 * AgentThinkingState — canonical persona animation component.
 *
 * Single import for all surfaces. Composes the persona-specific orb with a
 * phase-aware narration label. Falls back to a static avatar when the user
 * has opted into reduced motion.
 *
 * Usage:
 *   <AgentThinkingState persona="gustavo" phase="synthesizing" size="sm" />
 *   <AgentThinkingState persona="marco" phase="dispatching" size="md" showLabel />
 *
 * The `showLabel` prop adds the phase narration text next to the orb.
 * Omit it when you only want the visual mark (e.g. inside a header badge).
 */

import { motion, AnimatePresence } from "framer-motion";
import { useReducedMotion } from "./useReducedMotion";
import { GustavoOrb }   from "./GustavoOrb";
import { MarcoOrb }     from "./MarcoOrb";
import { RebeccaOrb }   from "./RebeccaOrb";
import { IrisOrb }      from "./IrisOrb";
import { SpecialistOrb } from "./SpecialistOrb";
import { cn } from "@/lib/utils";
import type { AgentPhase, AgentPersona, AgentOrbSize } from "./types";

export type { AgentPhase, AgentPersona, AgentOrbSize };

// ── Narration labels ──────────────────────────────────────────────────────────

/** Phase narration strings per persona. Only active phases (non-idle) have labels. */
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

// ── Reduced-motion static avatars ─────────────────────────────────────────────

/** Single-letter avatar shown in place of animation when reduced motion is on. */
const PERSONA_LETTER: Record<AgentPersona, string> = {
  gustavo:    "G",
  marco:      "M",
  rebecca:    "R",
  iris:       "I",
  specialist: "S",
};

/** Brand color class for each persona's static avatar. */
const PERSONA_AVATAR_COLOR: Record<AgentPersona, string> = {
  gustavo:    "text-accent-pop",
  marco:      "text-success",
  rebecca:    "text-primary",
  iris:       "text-info",
  specialist: "text-muted-foreground",
};

// ── Label text size per orb size ───────────────────────────────────────────────

const LABEL_TEXT_SIZE: Record<AgentOrbSize, string> = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

// ── Orb pixel diameter for the static avatar letter font size ─────────────────

import { ORB_SIZE_PX } from "./types";

// ── Main component ─────────────────────────────────────────────────────────────

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
      {/* Orb — animated or static fallback */}
      {reducedMotion ? (
        <StaticAvatar persona={persona} size={size} />
      ) : (
        <OrbSwitch persona={persona} phase={phase} size={size} />
      )}

      {/* Phase narration label */}
      {showLabel && (
        <AnimatePresence mode="wait">
          {label ? (
            <motion.span
              key={`${persona}-${phase}`}
              initial={{ opacity: 0, y: 3, filter: "blur(3px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -3, filter: "blur(3px)" }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className={cn(
                LABEL_TEXT_SIZE[size],
                "text-muted-foreground leading-none",
              )}
              aria-hidden // label already announced via aria-label above
            >
              {label}
            </motion.span>
          ) : null}
        </AnimatePresence>
      )}
    </div>
  );
}

// ── Internal sub-components ────────────────────────────────────────────────────

function OrbSwitch({
  persona,
  phase,
  size,
}: {
  persona: AgentPersona;
  phase: AgentPhase;
  size: AgentOrbSize;
}) {
  switch (persona) {
    case "gustavo":    return <GustavoOrb phase={phase} size={size} />;
    case "marco":      return <MarcoOrb phase={phase} size={size} />;
    case "rebecca":    return <RebeccaOrb phase={phase} size={size} />;
    case "iris":       return <IrisOrb phase={phase} size={size} />;
    case "specialist": return <SpecialistOrb phase={phase} size={size} />;
  }
}

function StaticAvatar({
  persona,
  size,
}: {
  persona: AgentPersona;
  size: AgentOrbSize;
}) {
  const diameter = ORB_SIZE_PX[size];
  const fontSize = Math.round(diameter * 0.52);

  return (
    <span
      style={{
        width:          diameter,
        height:         diameter,
        fontSize:       fontSize,
        lineHeight:     `${diameter}px`,
        display:        "inline-flex",
        alignItems:     "center",
        justifyContent: "center",
        borderRadius:   "50%",
      }}
      className={cn(
        "font-semibold bg-muted",
        PERSONA_AVATAR_COLOR[persona],
      )}
      aria-hidden
    >
      {PERSONA_LETTER[persona]}
    </span>
  );
}
