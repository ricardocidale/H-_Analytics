/**
 * Specialist registry contracts.
 *
 * Spec: docs/architecture/resources-control-plane.md
 * Doctrine: replit.md "AI Research sidebar section" + "Specialist page tab
 *           catalog" blocks (LOCKED 2026-04-21).
 *
 * The Specialist catalog (`engine/analyst/registry/specialist-catalog.ts`)
 * is the single source of truth for: which Specialists exist, what subject
 * each belongs to (sidebar grouping), what page tabs each renders
 * (capabilities), and what canonical Resources each is wired to
 * (assignmentRefs).
 *
 * The catalog is git-reviewable code. Adding/removing a Specialist or
 * changing its assignments requires a code edit + PR + deploy. A super-
 * admin-only audited time-boxed break-glass override (P2) exists for
 * incident reroute.
 *
 * P1 scope: types + the catalog declaration. No DB persistence yet (P2
 * adds the materialization job and the specialist_assignments join table).
 *
 * Implementation split into focused domain files under `./specialist/`
 * (task #1361). This barrel re-exports the full surface for backward
 * compatibility — consumers can import from either `@workspace/db/schema`
 * or `@workspace/db/schema/specialist` and see the same names.
 */

export * from "./specialist/enums";
export * from "./specialist/definition";
export * from "./specialist/config";
export * from "./specialist/identity";
export * from "./specialist/recommendations";
