/**
 * MarcoOrb — Slide Factory orchestrator persona animation.
 *
 * Six dots positioned at the vertices of a regular hexagon, rotating around
 * a central dot. Each vertex dot scales independently, creating a "team
 * assembling" visual metaphor that matches Marco's role as swarm orchestrator.
 * Color: green (success / accent-pop-2).
 *
 * Character: geometric precision, coordinated motion, structured assembly.
 */

import { motion } from "framer-motion";
import type { AgentPhase, AgentOrbSize } from "./types";
import { ORB_SIZE_PX } from "./types";

// ── Phase parameters ─────────────────────────────────────────────────────────

/** Rotation speed for the hexagon vertex ring, in seconds per full revolution. */
const PHASE_ROTATION_S: Record<AgentPhase, number> = {
  idle:         14.0, // barely drifting
  dispatching:  5.5,  // picking up
  thinking:     2.8,  // coordinating
  synthesizing: 1.8,  // peak assembly
  complete:     8.0,  // slowing to rest
  error:        1.0,  // tight anxious spin
};

/** Opacity of vertex dots per phase. */
const PHASE_OPACITY: Record<AgentPhase, number> = {
  idle:         0.35,
  dispatching:  0.55,
  thinking:     0.78,
  synthesizing: 1.0,
  complete:     0.85,
  error:        0.65,
};

// ── Geometry ────────────────────────────────────────────────────────────────

/** Number of vertices on the hexagon — defines team-of-six visual identity. */
const VERTEX_COUNT = 6;

/** Orbit radius as fraction of half the orb diameter. */
const ORBIT_R_FRAC = 0.66;

/** Dot radius for vertex dots as fraction of half the orb diameter. */
const VERTEX_DOT_R_FRAC = 0.12;

/** Center nucleus dot radius as fraction of half the orb diameter. */
const CENTER_DOT_R_FRAC = 0.18;

/** Stagger delay between vertex dot scale pulses (seconds). */
const VERTEX_STAGGER_S = 0.14; // total stagger = 6 × 0.14 = 0.84 s wave

// ── Color ────────────────────────────────────────────────────────────────────

const COLOR_GREEN = "hsl(var(--success))";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Convert degrees to radians. */
const DEG_TO_RAD = Math.PI / 180;

interface MarcoOrbProps {
  phase: AgentPhase;
  size?: AgentOrbSize;
  className?: string;
}

export function MarcoOrb({ phase, size = "md", className }: MarcoOrbProps) {
  const diameter  = ORB_SIZE_PX[size];
  const center    = diameter / 2;
  const alpha     = PHASE_OPACITY[phase];
  const rotDur    = PHASE_ROTATION_S[phase];
  const orbitR    = center * ORBIT_R_FRAC;
  const vDotR     = center * VERTEX_DOT_R_FRAC;
  const cDotR     = center * CENTER_DOT_R_FRAC;

  return (
    <div
      style={{ width: diameter, height: diameter, position: "relative" }}
      className={className}
      aria-hidden
    >
      {/* Rotating vertex ring */}
      <motion.svg
        width={diameter}
        height={diameter}
        viewBox={`0 0 ${diameter} ${diameter}`}
        style={{ position: "absolute", inset: 0 }}
        animate={{ rotate: 360 }}
        transition={{ duration: rotDur, repeat: Infinity, ease: "linear" }}
      >
        {Array.from({ length: VERTEX_COUNT }).map((_, i) => {
          // Compute vertex position: 0° = top, equally spaced at 60°
          const angleDeg = (i / VERTEX_COUNT) * 360 - 90;
          const angleRad = angleDeg * DEG_TO_RAD;
          const vx = center + orbitR * Math.cos(angleRad);
          const vy = center + orbitR * Math.sin(angleRad);

          return (
            <motion.circle
              key={i}
              cx={vx}
              cy={vy}
              r={vDotR}
              fill={COLOR_GREEN}
              animate={{
                opacity: [alpha * 0.5, alpha, alpha * 0.5],
                r: [vDotR * 0.8, vDotR * 1.3, vDotR * 0.8],
              }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * VERTEX_STAGGER_S,
              }}
            />
          );
        })}
      </motion.svg>

      {/* Static center nucleus */}
      <svg
        width={diameter}
        height={diameter}
        viewBox={`0 0 ${diameter} ${diameter}`}
        style={{ position: "absolute", inset: 0 }}
      >
        <motion.circle
          cx={center}
          cy={center}
          r={cDotR}
          fill={COLOR_GREEN}
          animate={{ opacity: [alpha * 0.7, alpha, alpha * 0.7] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />
      </svg>
    </div>
  );
}
