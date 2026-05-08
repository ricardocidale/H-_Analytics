/**
 * GustavoOrb — The Analyst persona animation.
 *
 * Three concentric pulsing rings in gold (accent-pop). The outer rings carry
 * slow gravitational weight; the inner nucleus is always the brightest.
 * Phase drives animation speed and overall luminosity.
 *
 * complete/error phases play once and settle (finite transient), not looping.
 *
 * Character: authority, depth, deliberate thought.
 */

import { motion } from "framer-motion";
import type { AgentPhase, AgentOrbSize } from "./types";
import { ORB_SIZE_PX } from "./types";

// ── Phase-driven animation parameters ───────────────────────────────────────

/** Pulse cycle duration in seconds per phase. */
const PHASE_DURATION_S: Record<AgentPhase, number> = {
  idle:         4.0, // very slow ambient — almost no motion
  dispatching:  2.2, // waking up
  thinking:     1.2, // actively processing
  synthesizing: 0.9, // peak — all rings firing
  complete:     0.6, // quick settle (plays once)
  error:        0.5, // brief alarm (plays once)
};

/** Base opacity of each ring at each phase. Outer rings are always dimmer. */
const PHASE_OPACITY: Record<AgentPhase, number> = {
  idle:         0.35,
  dispatching:  0.55,
  thinking:     0.75,
  synthesizing: 1.0,
  complete:     0.9,
  error:        0.7,
};

// ── Ring geometry (fractions of the total orb diameter) ───────────────────

/** Outer ring radius as a fraction of half the orb diameter (50%). */
const OUTER_RING_R_FRAC = 0.88;
/** Middle ring radius as a fraction of half the orb diameter. */
const MID_RING_R_FRAC   = 0.66;
/** Inner nucleus radius as a fraction of half the orb diameter. */
const INNER_R_FRAC      = 0.38;

/** Scale swell amplitude for the outer ring — subtle, not distracting. */
const OUTER_SCALE_MAX = 1.06;
/** Scale swell amplitude for the middle ring. */
const MID_SCALE_MAX   = 1.09;
/** Scale swell amplitude for the inner nucleus. */
const INNER_SCALE_MAX = 1.14;

/** Delay factor between ring animations (seconds) — creates wave-like cascade. */
const RING_STAGGER_S = 0.35;

// ── Shake geometry (error phase) ──────────────────────────────────────────

/** Horizontal shake keyframes in px — brief alarm, plays once. */
const ERROR_SHAKE_X = [0, -3, 3, -2, 2, 0];
/** Duration of the shake animation (seconds). */
const ERROR_SHAKE_DUR_S = 0.4;

// ── Color ─────────────────────────────────────────────────────────────────

const COLOR_GOLD = "hsl(var(--accent-pop))";

// ── Component ─────────────────────────────────────────────────────────────

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

  const outerR = center * OUTER_RING_R_FRAC;
  const midR   = center * MID_RING_R_FRAC;
  const innerR = center * INNER_R_FRAC;

  // complete/error phases: play once then settle — not an infinite loop
  const isTransient = phase === "complete" || phase === "error";

  // error phase: one horizontal shake then rest
  const shakeAnim  = phase === "error" ? { x: ERROR_SHAKE_X } : {};
  const shakeTrans = phase === "error"
    ? { duration: ERROR_SHAKE_DUR_S, ease: "easeInOut" as const, repeat: 0 }
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
      {/* Outer ring */}
      <motion.circle
        cx={center}
        cy={center}
        r={outerR}
        fill="none"
        stroke={COLOR_GOLD}
        strokeWidth={Math.max(1, diameter * 0.06)}
        animate={{
          opacity: [baseAlpha * 0.5, baseAlpha * 0.85, baseAlpha * 0.5],
          scale:   [1, OUTER_SCALE_MAX, 1],
        }}
        transition={{
          duration: dur,
          repeat: isTransient ? 0 : Infinity,
          ease: "easeInOut",
          delay: RING_STAGGER_S * 2,
        }}
        style={{ transformOrigin: `${center}px ${center}px` }}
      />

      {/* Middle ring */}
      <motion.circle
        cx={center}
        cy={center}
        r={midR}
        fill="none"
        stroke={COLOR_GOLD}
        strokeWidth={Math.max(1, diameter * 0.08)}
        animate={{
          opacity: [baseAlpha * 0.65, baseAlpha, baseAlpha * 0.65],
          scale:   [1, MID_SCALE_MAX, 1],
        }}
        transition={{
          duration: dur,
          repeat: isTransient ? 0 : Infinity,
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
        fill={COLOR_GOLD}
        animate={{
          opacity: [baseAlpha * 0.8, 1, baseAlpha * 0.8],
          scale:   [1, INNER_SCALE_MAX, 1],
        }}
        transition={{
          duration: dur,
          repeat: isTransient ? 0 : Infinity,
          ease: "easeInOut",
          delay: 0,
        }}
        style={{ transformOrigin: `${center}px ${center}px` }}
      />
    </motion.svg>
  );
}
