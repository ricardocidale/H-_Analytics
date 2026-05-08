/**
 * SpecialistOrb — Generic specialist persona animation.
 *
 * Compact two-ring variant of GustavoOrb — same family, smaller footprint.
 * complete/error play once (finite), not looped.
 *
 * Color: subdued gold (accent-pop at 75% opacity).
 */

import { motion } from "framer-motion";
import type { AgentPhase, AgentOrbSize } from "./types";
import { ORB_SIZE_PX } from "./types";

const PHASE_DURATION_S: Record<AgentPhase, number> = {
  idle:         3.0,
  dispatching:  1.8,
  thinking:     1.0,
  synthesizing: 0.75,
  complete:     0.5,  // finite
  error:        0.45, // finite
};

const PHASE_OPACITY: Record<AgentPhase, number> = {
  idle:         0.3,
  dispatching:  0.5,
  thinking:     0.7,
  synthesizing: 0.95,
  complete:     0.85,
  error:        0.6,
};

const OUTER_R_FRAC    = 0.82;
const INNER_R_FRAC    = 0.40;
const RING_STAGGER_S  = 0.25;
const OUTER_SCALE_MAX = 1.07;
const INNER_SCALE_MAX = 1.12;

const COLOR_RING  = "hsl(var(--accent-pop) / 0.75)";
const COLOR_INNER = "hsl(var(--accent-pop))";

interface SpecialistOrbProps {
  phase: AgentPhase;
  size?: AgentOrbSize;
  className?: string;
}

export function SpecialistOrb({ phase, size = "md", className }: SpecialistOrbProps) {
  const diameter    = ORB_SIZE_PX[size];
  const center      = diameter / 2;
  const alpha       = PHASE_OPACITY[phase];
  const dur         = PHASE_DURATION_S[phase];
  const outerR      = center * OUTER_R_FRAC;
  const innerR      = center * INNER_R_FRAC;
  const strokeW     = Math.max(1, diameter * 0.07);
  const isTransient = phase === "complete" || phase === "error";

  return (
    <motion.svg width={diameter} height={diameter} viewBox={`0 0 ${diameter} ${diameter}`} className={className} aria-hidden>
      <motion.circle
        cx={center} cy={center} r={outerR}
        fill="none" stroke={COLOR_RING} strokeWidth={strokeW}
        animate={{ opacity: [alpha * 0.45, alpha * 0.85, alpha * 0.45], scale: [1, OUTER_SCALE_MAX, 1] }}
        transition={{ duration: dur, repeat: isTransient ? 0 : Infinity, ease: "easeInOut", delay: RING_STAGGER_S }}
        style={{ transformOrigin: `${center}px ${center}px` }}
      />
      <motion.circle
        cx={center} cy={center} r={innerR}
        fill={COLOR_INNER}
        animate={{ opacity: [alpha * 0.7, alpha, alpha * 0.7], scale: [1, INNER_SCALE_MAX, 1] }}
        transition={{ duration: dur, repeat: isTransient ? 0 : Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: `${center}px ${center}px` }}
      />
    </motion.svg>
  );
}
