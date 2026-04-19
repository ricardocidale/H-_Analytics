// engine/analyst/surface — Surface Specialists, one per UI surface.
//
// Each subdirectory holds the Specialist(s) for one surface. A Specialist
// knows one surface, knows what to ask the Cognitive Engine for, and
// returns an AnalystVerdict (Phase 3) routed by the Surface Router.
//
// Phase 4 builds out remaining Specialists incrementally.

export * as MgmtCo from "./mgmt-co/index";
export * as Property from "./property/index";
export * as AdminDefaults from "./admin-defaults/index";
export * as Icp from "./icp/index";
export * as CrossPortfolio from "./cross-portfolio/index";
export * as Staleness from "./staleness/index";
