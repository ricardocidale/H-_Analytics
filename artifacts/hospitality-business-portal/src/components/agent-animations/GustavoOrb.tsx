/**
 * GustavoOrb — The Analyst persona animation.
 *
 * Three concentric pulsing rings in gold (accent-pop). Outer rings carry
 * gravitational weight; the inner nucleus is always brightest. Phase drives
 * speed and luminosity. complete/error play once (finite), not looped.
 */

import { motion } from "framer-motion";
import type { AgentPhase, AgentOrbSize } from "./types";
import { ORB_SIZE_PX } from "./types";

const PHASE_DURATION_S: Record<AgentPhase, number> = {
  idle:         4.0,
  dispatching:  2.2,
  thinking:     1.2,
  synthesizing: 0.9,
  complete:     0.6, // finite — settle once
  error:        0.5, // finite — alarm once
};

const PHASE_OPACITY: Record<AgentPhase, number> = {
  idle:         0.35,
  dispatching:  0.55,
  thinking:     0.75,
  synthesizing: 1.0,
  complete:     0.9,
  error:        0.7,
};

const OUTER_RING_R_FRAC = 0.88;
const MID_RING_R_FRAC   = 0.66;
const INNER_R_FRAC      = 0.38;
const OUTER_SCALE_MAX   = 1.06;
const MID_SCALE_MAX     = 1.09;
const INNER_SCALE_MAX   = 1.14;
const RING_STAGGER_S    = 0.35;

/** Horizontal shake keyframes for error phase (px). */
const ERROR_SHAKE_X   = [0, -3, 3, -2, 2, 0];
const ERROR_SHAKE_DUR = 0.4;

const COLOR_GOLD = "hsl(var(--accent-pop))";

interface GustavoOrbProps {
  phase: AgentPhase;
  size?: AgentOrbSize;
  className?: string;
}

export function GustavoOrb({ phase, size = "md", className }: GustavoOrbProps) {
  const diameter  = ORB_SIZE_PX[size];
  const center    = diameter / 2;
  const baseAlpha = PHASE_OPACITY[phase];
  const dur       = PHASE_DURATION_S[phase];
  const outerR    = center * OUTER_RING_R_FRAC;
  const midR      = center * MID_RING_R_FRAC;
  const innerR    = center * INNER_R_FRAC;
  const isTransient = phase === "complete" || phase === "error";

  const shakeAnim  = phase === "error" ? { x: ERROR_SHAKE_X } : {};
  const shakeTrans = phase === "error"
    ? { duration: ERROR_SHAKE_DUR, ease: "easeInOut" as const, repeat: 0 }
    : {};

  return (
    <motion.svg
      width={diameter}
      height={diameter}
      viewBox={`0 0 ${diameter} ${diameter}`}
      className={className}
      aria-hidden
      animate={shakeAnim}
      transition={shakeTrans}
    >
      <motion.circle
        cx={center} cy={center} r={outerR}
        fill="none" stroke={COLOR_GOLD}
        strokeWidth={Math.max(1, diameter * 0.06)}
        animate={{ opacity: [baseAlpha * 0.5, baseAlpha * 0.85, baseAlpha * 0.5], scale: [1, OUTER_SCALE_MAX, 1] }}
        transition={{ duration: dur, repeat: isTransient ? 0 : Infinity, ease: "easeInOut", delay: RING_STAGGER_S * 2 }}
        style={{ transformOrigin: `${center}px ${center}px` }}
      />
      <motion.circle
        cx={center} cy={center} r={midR}
        fill="none" stroke={COLOR_GOLD}
        strokeWidth={Math.max(1, diameter * 0.08)}
        animate={{ opacity: [baseAlpha * 0.65, baseAlpha, baseAlpha * 0.65], scale: [1, MID_SCALE_MAX, 1] }}
        transition={{ duration: dur, repeat: isTransient ? 0 : Infinity, ease: "easeInOut", delay: RING_STAGGER_S }}
        style={{ transformOrigin: `${center}px ${center}px` }}
      />
      <motion.circle
        cx={center} cy={center} r={innerR}
        fill={COLOR_GOLD}
        animate={{ opacity: [baseAlpha * 0.8, 1, baseAlpha * 0.8], scale: [1, INNER_SCALE_MAX, 1] }}
        transition={{ duration: dur, repeat: isTransient ? 0 : Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: `${center}px ${center}px` }}
      />
    </motion.svg>
  );
}
