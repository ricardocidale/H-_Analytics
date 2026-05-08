/**
 * SpecialistOrb — Generic specialist persona animation.
 *
 * A smaller, faster variant of the GustavoOrb — same concentric ring family
 * but with only two rings and a more compact footprint. Communicates "same
 * family as The Analyst, but scoped to a single research domain".
 *
 * Color: primary / muted (subdued relative to Gustavo's full gold).
 * Character: focused, efficient, single-domain.
 */

import { motion } from "framer-motion";
import type { AgentPhase, AgentOrbSize } from "./types";
import { ORB_SIZE_PX } from "./types";

// ── Phase parameters ─────────────────────────────────────────────────────────

/** Pulse cycle duration in seconds per phase — faster than Gustavo. */
const PHASE_DURATION_S: Record<AgentPhase, number> = {
  idle:         3.0, // noticeably slower than active
  dispatching:  1.8,
  thinking:     1.0,
  synthesizing: 0.75,
  complete:     0.5,
  error:        0.45,
};

/** Opacity of the rings per phase. */
const PHASE_OPACITY: Record<AgentPhase, number> = {
  idle:         0.3,
  dispatching:  0.5,
  thinking:     0.7,
  synthesizing: 0.95,
  complete:     0.85,
  error:        0.6,
};

// ── Geometry ──────────────────────────────────────────────────────────────────

/** Outer ring radius as fraction of half the orb diameter. */
const OUTER_R_FRAC = 0.82;
/** Inner nucleus radius as fraction of half the orb diameter. */
const INNER_R_FRAC = 0.40;

/** Stagger delay between ring pulses — creates cascade feel (seconds). */
const RING_STAGGER_S = 0.25;

// ── Colors ────────────────────────────────────────────────────────────────────

const COLOR_RING   = "hsl(var(--accent-pop) / 0.75)"; // subdued gold
const COLOR_INNER  = "hsl(var(--accent-pop))";

// ── Component ─────────────────────────────────────────────────────────────────

interface SpecialistOrbProps {
  phase: AgentPhase;
  size?: AgentOrbSize;
  className?: string;
}

export function SpecialistOrb({ phase, size = "md", className }: SpecialistOrbProps) {
  const diameter  = ORB_SIZE_PX[size];
  const center    = diameter / 2;
  const alpha     = PHASE_OPACITY[phase];
  const dur       = PHASE_DURATION_S[phase];
  const outerR    = center * OUTER_R_FRAC;
  const innerR    = center * INNER_R_FRAC;
  const strokeW   = Math.max(1, diameter * 0.07);

  return (
    <motion.svg
      width={diameter}
      height={diameter}
      viewBox={`0 0 ${diameter} ${diameter}`}
      className={className}
      aria-hidden
    >
      {/* Outer ring */}
      <motion.circle
        cx={center}
        cy={center}
        r={outerR}
        fill="none"
        stroke={COLOR_RING}
        strokeWidth={strokeW}
        animate={{
          opacity: [alpha * 0.45, alpha * 0.85, alpha * 0.45],
          scale:   [1, 1.07, 1],
        }}
        transition={{
          duration: dur,
          repeat: Infinity,
          ease: "easeInOut",
          delay: RING_STAGGER_S,
        }}
        style={{ transformOrigin: `${center}px ${center}px` }}
      />

      {/* Inner nucleus */}
      <motion.circle
        cx={center}
        cy={center}
        r={innerR}
        fill={COLOR_INNER}
        animate={{
          opacity: [alpha * 0.7, alpha, alpha * 0.7],
          scale:   [1, 1.12, 1],
        }}
        transition={{
          duration: dur,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 0,
        }}
        style={{ transformOrigin: `${center}px ${center}px` }}
      />
    </motion.svg>
  );
}
