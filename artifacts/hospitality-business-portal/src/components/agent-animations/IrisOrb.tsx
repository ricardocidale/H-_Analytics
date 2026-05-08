/**
 * IrisOrb — Resource Maintainer persona animation.
 *
 * Dashed ring (slow rotation) + orbiting indicator dot. Evokes a watchful
 * sentinel scanning and indexing. complete/error play once (finite), not looped.
 *
 * Color: info blue.
 */

import { motion } from "framer-motion";
import type { AgentPhase, AgentOrbSize } from "./types";
import { ORB_SIZE_PX } from "./types";

const PHASE_ROTATION_S: Record<AgentPhase, number> = {
  idle:         12.0,
  dispatching:   5.0,
  thinking:      2.4,
  synthesizing:  1.6,
  complete:      8.0, // finite
  error:         1.0, // finite
};

const PHASE_ORBIT_S: Record<AgentPhase, number> = {
  idle:         10.0,
  dispatching:   4.0,
  thinking:      2.0,
  synthesizing:  1.4,
  complete:      7.0, // finite
  error:         0.9, // finite
};

const PHASE_OPACITY: Record<AgentPhase, number> = {
  idle:         0.4,
  dispatching:  0.6,
  thinking:     0.78,
  synthesizing: 1.0,
  complete:     0.8,
  error:        0.65,
};

const RING_R_FRAC      = 0.74;
const RING_STROKE_FRAC = 0.08;
const INDICATOR_R_FRAC = 0.14;
const DASH_FRACTION    = 0.18; // 18% of circumference
const GAP_FRACTION     = 0.08; // 8% gap
const CENTER_R_FRAC    = 0.16;
const CENTER_PULSE_DUR = 2.4;

const TWO_PI = 2 * Math.PI;

const COLOR_BLUE = "hsl(var(--info))";

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
  const circumference = TWO_PI * ringR;
  const dashArray = `${circumference * DASH_FRACTION} ${circumference * GAP_FRACTION}`;
  const isTransient = phase === "complete" || phase === "error";

  return (
    <div style={{ width: diameter, height: diameter, position: "relative" }} className={className} aria-hidden>
      <motion.svg
        width={diameter} height={diameter} viewBox={`0 0 ${diameter} ${diameter}`}
        style={{ position: "absolute", inset: 0 }}
        animate={{ rotate: 360 }}
        transition={{ duration: rotDur, repeat: isTransient ? 0 : Infinity, ease: "linear" }}
      >
        <circle cx={center} cy={center} r={ringR} fill="none" stroke={COLOR_BLUE} strokeWidth={strokeW} strokeDasharray={dashArray} opacity={alpha * 0.55} />
      </motion.svg>

      <motion.svg
        width={diameter} height={diameter} viewBox={`0 0 ${diameter} ${diameter}`}
        style={{ position: "absolute", inset: 0 }}
        animate={{ rotate: 360 }}
        transition={{ duration: orbitDur, repeat: isTransient ? 0 : Infinity, ease: "linear" }}
      >
        <circle cx={center} cy={center - ringR} r={dotR} fill={COLOR_BLUE} opacity={alpha} />
      </motion.svg>

      <svg width={diameter} height={diameter} viewBox={`0 0 ${diameter} ${diameter}`} style={{ position: "absolute", inset: 0 }}>
        <motion.circle
          cx={center} cy={center} r={center * CENTER_R_FRAC}
          fill={COLOR_BLUE}
          animate={{ opacity: [alpha * 0.5, alpha * 0.85, alpha * 0.5] }}
          transition={{ duration: CENTER_PULSE_DUR, repeat: isTransient ? 0 : Infinity, ease: "easeInOut" }}
        />
      </svg>
    </div>
  );
}
