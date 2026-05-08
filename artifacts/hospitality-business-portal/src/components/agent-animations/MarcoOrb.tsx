/**
 * MarcoOrb — Slide Factory orchestrator persona animation.
 *
 * Six equilateral triangles positioned at hexagon vertices, each pointing
 * inward toward the center. The whole assembly rotates as one piece.
 * The visual metaphor: "six teams assembling into a coherent structure" —
 * triangles that collectively resolve into a hexagon form.
 *
 * Color: green (success token).
 * Character: geometric precision, structured assembly, coordinated motion.
 */

import { motion } from "framer-motion";
import type { AgentPhase, AgentOrbSize } from "./types";
import { ORB_SIZE_PX } from "./types";

// ── Phase parameters ──────────────────────────────────────────────────────────

/** Full-revolution rotation duration per phase (seconds). */
const PHASE_ROTATION_S: Record<AgentPhase, number> = {
  idle:         16.0, // barely drifting — sentinel presence only
  dispatching:   5.5, // picking up momentum
  thinking:      2.8, // coordinating six teams
  synthesizing:  1.6, // peak — full assembly in motion
  complete:      8.0, // slowing to rest after completion
  error:         1.0, // tight anxious spin
};

/** Triangle fill opacity per phase. */
const PHASE_OPACITY: Record<AgentPhase, number> = {
  idle:         0.30,
  dispatching:  0.52,
  thinking:     0.75,
  synthesizing: 1.0,
  complete:     0.85,
  error:        0.60,
};

// ── Geometry constants ────────────────────────────────────────────────────────

/** Number of triangles — one per hexagon vertex. */
const TRIANGLE_COUNT = 6;

/** Angle between adjacent triangles (degrees). */
const TRI_ANGLE_STEP = 360 / TRIANGLE_COUNT; // 60°

/** Triangle orbit radius as fraction of half the orb diameter. */
const ORBIT_R_FRAC = 0.60;

/** Triangle side length as fraction of half the orb diameter. */
const TRI_SIDE_FRAC = 0.36;

/** Center nucleus dot radius as fraction of half the orb diameter. */
const CENTER_DOT_R_FRAC = 0.18;

/** Stagger delay between triangle opacity pulses (seconds). */
const VERTEX_STAGGER_S = 0.12; // 6 × 0.12 = 0.72 s wave

// ── Equilateral triangle geometry ────────────────────────────────────────────
// For an equilateral triangle with side length `s`:
//   height h = s × (√3 / 2)
//   centroid divides height: 2h/3 from tip, h/3 from base

/** √3 / 2 — height-to-side ratio for an equilateral triangle. */
const SQRT3_OVER_2 = Math.sqrt(3) / 2;
/** Fraction of height from centroid to tip (2/3). */
const CENTROID_TO_TIP_FRAC = 2 / 3;
/** Fraction of height from centroid to base (1/3). */
const CENTROID_TO_BASE_FRAC = 1 / 3;

// ── Opacity pulse duration for individual triangles (seconds). ────────────────
const TRI_PULSE_DUR_S = 1.4;

// ── Color ─────────────────────────────────────────────────────────────────────

const COLOR_GREEN = "hsl(var(--success))";

// ── Helpers ───────────────────────────────────────────────────────────────────

interface MarcoOrbProps {
  phase: AgentPhase;
  size?: AgentOrbSize;
  className?: string;
}

export function MarcoOrb({ phase, size = "md", className }: MarcoOrbProps) {
  const diameter = ORB_SIZE_PX[size];
  const center   = diameter / 2;
  const alpha    = PHASE_OPACITY[phase];
  const rotDur   = PHASE_ROTATION_S[phase];
  const orbitR   = center * ORBIT_R_FRAC;

  // ── Triangle geometry (centroid at origin, tip pointing toward +y = center) ─
  const triSide  = center * TRI_SIDE_FRAC;
  const triH     = triSide * SQRT3_OVER_2;
  const tipY     = triH * CENTROID_TO_TIP_FRAC;  // below centroid (toward center)
  const baseY    = -triH * CENTROID_TO_BASE_FRAC; // above centroid (away from center)
  const halfBase = triSide / 2;

  // SVG polygon points string: tip → left base corner → right base corner
  const triPoints = [
    `0,${tipY.toFixed(2)}`,
    `${(-halfBase).toFixed(2)},${baseY.toFixed(2)}`,
    `${halfBase.toFixed(2)},${baseY.toFixed(2)}`,
  ].join(" ");

  // complete/error phases: play animation once and stop (transient, then settle)
  const isTransient = phase === "complete" || phase === "error";

  return (
    <motion.svg
      width={diameter}
      height={diameter}
      viewBox={`0 0 ${diameter} ${diameter}`}
      className={className}
      aria-hidden
      animate={{ rotate: 360 }}
      transition={{
        duration: rotDur,
        repeat: isTransient ? 0 : Infinity,
        ease: "linear",
      }}
    >
      {/*
        Each triangle i is placed at hexagon vertex i:
          rotate(i×60°, center, center)  — swing to vertex position
          translate(center, center−orbitR) — move out to orbit radius
        Triangle points are defined with centroid at origin and tip pointing +y
        (toward center), so the transform places it correctly at each vertex.
      */}
      {Array.from({ length: TRIANGLE_COUNT }).map((_, i) => (
        <motion.polygon
          key={i}
          transform={`rotate(${i * TRI_ANGLE_STEP}, ${center}, ${center}) translate(${center}, ${center - orbitR})`}
          points={triPoints}
          fill={COLOR_GREEN}
          animate={{ opacity: [alpha * 0.45, alpha, alpha * 0.45] }}
          transition={{
            duration: TRI_PULSE_DUR_S,
            repeat: isTransient ? 0 : Infinity,
            ease: "easeInOut",
            delay: i * VERTEX_STAGGER_S,
          }}
        />
      ))}

      {/* Central nucleus — the orchestrator at the core of the assembly */}
      <motion.circle
        cx={center}
        cy={center}
        r={center * CENTER_DOT_R_FRAC}
        fill={COLOR_GREEN}
        animate={{ opacity: [alpha * 0.65, alpha, alpha * 0.65] }}
        transition={{
          duration: 1.8,
          repeat: isTransient ? 0 : Infinity,
          ease: "easeInOut",
        }}
      />
    </motion.svg>
  );
}
