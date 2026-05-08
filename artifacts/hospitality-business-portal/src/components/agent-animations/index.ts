/**
 * Agent Animations — public barrel.
 *
 * Import the canonical `AgentThinkingState` component for all surfaces.
 * Individual orbs are internal; import them directly only when you need
 * a persona-specific orb without the wrapping layout.
 */

export { AgentThinkingState } from "./AgentThinkingState";
export type {
  AgentThinkingStateProps,
  AgentPhase,
  AgentPersona,
  AgentOrbSize,
} from "./AgentThinkingState";

export { GustavoOrb }    from "./GustavoOrb";
export { MarcoOrb }      from "./MarcoOrb";
export { RebeccaOrb }    from "./RebeccaOrb";
export { IrisOrb }       from "./IrisOrb";
export { SpecialistOrb } from "./SpecialistOrb";

export { useReducedMotion } from "./useReducedMotion";
