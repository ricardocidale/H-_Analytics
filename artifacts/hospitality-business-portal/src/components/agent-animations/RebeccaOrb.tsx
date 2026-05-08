/**
 * RebeccaOrb — Conversational agent persona animation.
 *
 * Three warm dots in a horizontal row, staggered bounce wave.
 * complete/error play once (finite), not looped.
 */

import { motion } from "framer-motion";
import type { AgentPhase, AgentOrbSize } from "./types";
import { ORB_SIZE_PX } from "./types";

const PHASE_DURATION_S: Record<AgentPhase, number> = {
  idle:         3.5,
  dispatching:  1.8,
  thinking:     1.1,
  synthesizing: 0.85,
  complete:     0.7,  // finite
  error:        0.6,  // finite
};

const BOUNCE_HEIGHT_FRAC: Record<AgentPhase, number> = {
  idle:         0.12,
  dispatching:  0.25,
  thinking:     0.4,
  synthesizing: 0.55,
  complete:     0.35,
  error:        0.3,
};

const PHASE_OPACITY: Record<AgentPhase, number> = {
  idle:         0.45,
  dispatching:  0.6,
  thinking:     0.8,
  synthesizing: 1.0,
  complete:     0.9,
  error:        0.7,
};

const DOT_COUNT      = 3;
const DOT_SIZE_FRAC  = 0.22;
const DOT_GAP_FRAC   = 0.14;
const DOT_STAGGER_S  = 0.18;
const DOT_SCALE_MIN  = 0.85;
const DOT_SCALE_MAX  = 1.1;

const COLOR_PRIMARY = "hsl(var(--primary))";

interface RebeccaOrbProps {
  phase: AgentPhase;
  size?: AgentOrbSize;
  className?: string;
}

export function RebeccaOrb({ phase, size = "md", className }: RebeccaOrbProps) {
  const orbDiameter = ORB_SIZE_PX[size];
  const dotSize     = orbDiameter * DOT_SIZE_FRAC;
  const gap         = orbDiameter * DOT_GAP_FRAC;
  const dur         = PHASE_DURATION_S[phase];
  const bounceH     = orbDiameter * BOUNCE_HEIGHT_FRAC[phase];
  const alpha       = PHASE_OPACITY[phase];
  const totalWidth  = DOT_COUNT * dotSize + (DOT_COUNT - 1) * gap;
  // complete/error phases: play bounce once then settle — not an infinite loop
  const isTransient = phase === "complete" || phase === "error";

  return (
    <div
      style={{ width: totalWidth, height: orbDiameter, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", gap }}
      className={className}
      aria-hidden
    >
      {Array.from({ length: DOT_COUNT }).map((_, i) => (
        <motion.span
          key={i}
          style={{ display: "block", width: dotSize, height: dotSize, borderRadius: "50%", backgroundColor: COLOR_PRIMARY, flexShrink: 0 }}
          animate={{ y: [0, -bounceH, 0], opacity: [alpha * 0.5, alpha, alpha * 0.5], scale: [DOT_SCALE_MIN, DOT_SCALE_MAX, DOT_SCALE_MIN] }}
          transition={{ duration: dur, repeat: isTransient ? 0 : Infinity, ease: "easeInOut", delay: i * DOT_STAGGER_S }}
        />
      ))}
    </div>
  );
}
