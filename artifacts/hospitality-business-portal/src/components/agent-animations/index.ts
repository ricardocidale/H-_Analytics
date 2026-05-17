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

// Rebecca advanced animation components (Lascoux set)
export { RebeccaOrbitAdvanced, REBECCA_ORBIT_ADVANCED_META } from "./RebeccaAdvancedOrbit";
export { RebeccaOrbit, REBECCA_ORBIT_META }                  from "./RebeccaSwissOrbit";
export { RebeccaCaveSequence, REBECCA_CAVE_SEQUENCE_META }   from "./RebeccaCaveSequence";
export { RebeccaGeoSequence, REBECCA_GEO_SEQUENCE_META }     from "./RebeccaGeoSequence";
export { RebeccaTotemSequence, REBECCA_TOTEM_SEQUENCE_META } from "./RebeccaTotemSequence";
export { RebeccaAlive, REBECCA_ALIVE_META }                  from "./RebeccaAliveGeometry";

// Analyst animation components (Cube set)
export { AnalystBarChartPulse, ANALYST_BAR_CHART_PULSE_META }     from "./AnalystBarChartPulse";
export { AnalystExpandingSolver, ANALYST_EXPANDING_SOLVER_META }   from "./AnalystExpandingSolver";
export { AnalystNexusCore, ANALYST_NEXUS_CORE_META }               from "./AnalystNexusCore";
export { AnalystQuantumSolver, ANALYST_QUANTUM_SOLVER_META }       from "./AnalystQuantumSolver";
export { AnalystSwissCube, ANALYST_SWISS_CUBE_META }               from "./AnalystSwissCube";
export { AnalystThinkingCube, ANALYST_THINKING_CUBE_META }         from "./AnalystThinkingCube";
