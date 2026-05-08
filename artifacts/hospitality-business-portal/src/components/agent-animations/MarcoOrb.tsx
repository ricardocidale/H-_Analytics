/**
 * MarcoOrb — Slide Factory orchestrator persona animation.
 *
 * Six equilateral triangles at hexagon vertices, each pointing inward.
 * The assembly rotates as a unit — "six teams resolving into structure".
 * complete/error play once (finite), not looped.
 */

import { motion } from "framer-motion";
import type { AgentPhase, AgentOrbSize } from "./types";
import { ORB_SIZE_PX } from "./types";

const PHASE_ROTATION_S: Record<AgentPhase, number> = {
  idle:         16.0,
  dispatching:   5.5,
  thinking:      2.8,
  synthesizing:  1.6,
  complete:      8.0, // finite — slow to rest
  error:         1.0, // finite — tight spin
};

const PHASE_OPACITY: Record<AgentPhase, number> = {
  idle:         0.30,
  dispatching:  0.52,
  thinking:     0.75,
  synthesizing: 1.0,
  complete:     0.85,
  error:        0.60,
};

const TRIANGLE_COUNT  = 6;
const TRI_ANGLE_STEP  = 360 / TRIANGLE_COUNT; // 60°
const ORBIT_R_FRAC    = 0.60;
const TRI_SIDE_FRAC   = 0.36;
const CENTER_DOT_R_FRAC = 0.18;
const VERTEX_STAGGER_S  = 0.12;
const TRI_PULSE_DUR_S   = 1.4;

// Equilateral triangle geometry: h = s × √3/2; centroid at 2h/3 from tip
const SQRT3_OVER_2        = Math.sqrt(3) / 2;
const CENTROID_TO_TIP_FRAC  = 2 / 3;
const CENTROID_TO_BASE_FRAC = 1 / 3;

const COLOR_GREEN = "hsl(var(--success))";

interface MarcoOrbProps {
  phase: AgentPhase;
  size?: AgentOrbSize;
  className?: string;
}

export function MarcoOrb({ phase, size = "md", className }: MarcoOrbProps) {
  const diameter   = ORB_SIZE_PX[size];
  const center     = diameter / 2;
  const alpha      = PHASE_OPACITY[phase];
  const rotDur     = PHASE_ROTATION_S[phase];
  const orbitR     = center * ORBIT_R_FRAC;
  const isTransient = phase === "complete" || phase === "error";

  // Triangle geometry — centroid at origin, tip pointing +y (toward center)
  const triSide  = center * TRI_SIDE_FRAC;
  const triH     = triSide * SQRT3_OVER_2;
  const tipY     = triH * CENTROID_TO_TIP_FRAC;
  const baseY    = -triH * CENTROID_TO_BASE_FRAC;
  const halfBase = triSide / 2;
  const triPoints = `0,${tipY.toFixed(2)} ${(-halfBase).toFixed(2)},${baseY.toFixed(2)} ${halfBase.toFixed(2)},${baseY.toFixed(2)}`;

  return (
    <motion.svg
      width={diameter}
      height={diameter}
      viewBox={`0 0 ${diameter} ${diameter}`}
      className={className}
      aria-hidden
      animate={{ rotate: 360 }}
      transition={{ duration: rotDur, repeat: isTransient ? 0 : Infinity, ease: "linear" }}
    >
      {/*
        Each triangle i: rotate(i×60°) around center, translate out to orbit radius.
        Triangle is defined pointing toward +y (center), so transform is correct for all vertices.
      */}
      {Array.from({ length: TRIANGLE_COUNT }).map((_, i) => (
        <motion.polygon
          key={i}
          transform={`rotate(${i * TRI_ANGLE_STEP}, ${center}, ${center}) translate(${center}, ${center - orbitR})`}
          points={triPoints}
          fill={COLOR_GREEN}
          animate={{ opacity: [alpha * 0.45, alpha, alpha * 0.45] }}
          transition={{ duration: TRI_PULSE_DUR_S, repeat: isTransient ? 0 : Infinity, ease: "easeInOut", delay: i * VERTEX_STAGGER_S }}
        />
      ))}
      <motion.circle
        cx={center} cy={center} r={center * CENTER_DOT_R_FRAC}
        fill={COLOR_GREEN}
        animate={{ opacity: [alpha * 0.65, alpha, alpha * 0.65] }}
        transition={{ duration: 1.8, repeat: isTransient ? 0 : Infinity, ease: "easeInOut" }}
      />
    </motion.svg>
  );
}
