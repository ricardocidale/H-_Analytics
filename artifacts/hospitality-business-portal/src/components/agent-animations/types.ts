/**
 * Shared type definitions for the agent persona animation system.
 *
 * Phase vocabulary is shared across all personas so surfaces can drive
 * animation state from the same run-status enum without per-persona branching.
 *
 * Persona maps to the canonical agent taxonomy from `agent-taxonomy.ts`.
 * Adding a new top-level persona requires a matching Orb component.
 */

/**
 * Cognitive phase — drives animation character for every persona.
 *
 * idle         → very slow ambient pulse (0.5 opacity, 4 s cycle)
 * dispatching  → medium pulse, slight motion (2 s cycle)
 * thinking     → active pulse, faster orbit (1.2 s cycle)
 * synthesizing → full brightness, all elements active (1 s cycle)
 * complete     → quick scale-up → settle, then idle
 * error        → brief shake → drop to idle
 */
export type AgentPhase =
  | "idle"
  | "dispatching"
  | "thinking"
  | "synthesizing"
  | "complete"
  | "error";

/** Named persona — each has a distinct visual orb with brand-matched colors. */
export type AgentPersona =
  | "gustavo"    // The Analyst — concentric pulsing rings, gold
  | "marco"      // Slide Factory orchestrator — rotating hexagon geometry, green
  | "rebecca"    // Conversational agent — warm bounce dots, primary
  | "iris"       // Resource maintainer — expanding ring + orbiting dot, info blue
  | "specialist"; // Generic specialist — smaller Gustavo-style orb, muted

/** Visual size of the orb and accompanying label text. */
export type AgentOrbSize = "sm" | "md" | "lg";

/** Pixel diameter of the orb at each size tier. */
export const ORB_SIZE_PX: Record<AgentOrbSize, number> = {
  sm: 20, // small inline orb
  md: 28, // standard card header orb
  lg: 40, // full-panel hero orb
} as const;
