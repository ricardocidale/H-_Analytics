/**
 * IrisOrb — Resource Maintainer persona animation.
 *
 * A dashed ring that slowly rotates (scanning motion) plus a small dot
 * that orbits the ring at a steady rate. Evokes a watchful sentinel,
 * quietly checking and indexing.
 *
 * complete/error phases rotate once and stop (finite transient), not looping.
 *
 * Color: info blue (hsl(var(--info))).
 * Character: methodical, watchful, maintenance-oriented.
 */

import { motion } from "framer-motion";
import type { AgentPhase, AgentOrbSize } from "./types";
import { ORB_SIZE_PX } from "./types";

// ── Phase parameters ──────────────────────────────────────────────────────────

/** Ring rotation cycle in seconds per phase. */
const PHASE_ROTATION_S: Record<AgentPhase, number> = {
  idle:         12.0, // nearly still
  dispatching:   5.0, // starting a scan
  thinking:      2.4, // active scan
  synthesizing:  1.6, // indexing at speed
  complete:      8.0, // cooling down (plays once)
  error:         1.0, // distress spin (plays once)
};

/** Orbit period for the indicator dot, in seconds. Slightly faster than ring. */
const PHASE_ORBIT_S: Record<AgentPhase, number> = {
  idle:         10.0,
  dispatching:   4.0,
  thinking:      2.0,
  synthesizing:  1.4,
  complete:      7.0, // plays once
  error:         0.9, // plays once
};

/** Opacity per phase. */
const PHASE_OPACITY: Record<AgentPhase, number> = {
  idle:         0.4,
  dispatching:  0.6,
  thinking:     0.78,
  synthesizing: 1.0,
  complete:     0.8,
  error:        0.65,
};

// ── Geometry ──────────────────────────────────────────────────────────────────

/** Dashed ring radius as fraction of half the orb diameter. */
const RING_R_FRAC = 0.74;

/** Stroke width of the dashed ring as fraction of the orb diameter. */
const RING_STROKE_FRAC = 0.08;

/** The orbiting indicator dot radius as fraction of half the orb diameter. */
const INDICATOR_R_FRAC = 0.14;

/** Dash array: dash length fraction (relative to circumference). */
const DASH_FRACTION = 0.18; // 18% dash
/** Gap length fraction (relative to circumference). */
const GAP_FRACTION  = 0.08; // 8% gap

/** Center nucleus radius as fraction of half the orb diameter. */
const CENTER_R_FRAC = 0.16;

/** Center nucleus heartbeat pulse duration (seconds). */
const CENTER_PULSE_DUR_S = 2.4;

// ── Color ──────────────────────────────────────────────────────────────────

const COLOR_BLUE = "hsl(var(--info))";

// ── Helpers ────────────────────────────────────────────────────────────────

const TWO_PI = 2 * Math.PI;

// ── Component ──────────────────────────────────────────────────────────────

interface IrisOrbProps {
  phase: AgentPhase;
  size?: AgentOrbSize;
  className?: string;
}

export function IrisOrb({ phase, size = "md", className }: IrisOrbProps) {
  const diameter  = ORB_SIZE_PX[size];
  const center    = diameter / 2;
  const alpha     = PHASE_OPACITY[phase];
  const rotDur    = PHASE_ROTATION_S[phase];
  const orbitDur  = PHASE_ORBIT_S[phase];
  const ringR     = center * RING_R_FRAC;
  const strokeW   = diameter * RING_STROKE_FRAC;
  const dotR      = center * INDICATOR_R_FRAC;

  // Dash pattern derived from circumference — scales with orb size
  const circumference = TWO_PI * ringR;
  const dashLen   = circumference * DASH_FRACTION;
  const gapLen    = circumference * GAP_FRACTION;
  const dashArray = `${dashLen} ${gapLen}`;

  // The orbiting dot starts at the top (−90°) of the ring radius
  const orbitRadius = ringR;

  // complete/error phases: rotate once then stop — not an infinite loop
  const isTransient = phase === "complete" || phase === "error";

  return (
    <div
      style={{ width: diameter, height: diameter, position: "relative" }}
      className={className}
      aria-hidden
    >
      {/* Dashed ring — slow scan rotation */}
      <motion.svg
        width={diameter}
        height={diameter}
        viewBox={`0 0 ${diameter} ${diameter}`}
        style={{ position: "absolute", inset: 0 }}
        animate={{ rotate: 360 }}
        transition={{ duration: rotDur, repeat: isTransient ? 0 : Infinity, ease: "linear" }}
      >
        <circle
          cx={center}
          cy={center}
          r={ringR}
          fill="none"
          stroke={COLOR_BLUE}
          strokeWidth={strokeW}
          strokeDasharray={dashArray}
          opacity={alpha * 0.55}
        />
      </motion.svg>

      {/* Orbiting indicator dot — faster than the ring */}
      <motion.svg
        width={diameter}
        height={diameter}
        viewBox={`0 0 ${diameter} ${diameter}`}
        style={{ position: "absolute", inset: 0 }}
        animate={{ rotate: 360 }}
        transition={{ duration: orbitDur, repeat: isTransient ? 0 : Infinity, ease: "linear" }}
      >
        {/* Dot positioned at top of orbit radius, rotation pivots around center */}
        <circle
          cx={center}
          cy={center - orbitRadius}
          r={dotR}
          fill={COLOR_BLUE}
          opacity={alpha}
        />
      </motion.svg>

      {/* Static center pulse — subtle heartbeat */}
      <svg
        width={diameter}
        height={diameter}
        viewBox={`0 0 ${diameter} ${diameter}`}
        style={{ position: "absolute", inset: 0 }}
      >
        <motion.circle
          cx={center}
          cy={center}
          r={center * CENTER_R_FRAC}
          fill={COLOR_BLUE}
          animate={{ opacity: [alpha * 0.5, alpha * 0.85, alpha * 0.5] }}
          transition={{
            duration: CENTER_PULSE_DUR_S,
            repeat: isTransient ? 0 : Infinity,
            ease: "easeInOut",
          }}
        />
      </svg>
    </div>
  );
}
