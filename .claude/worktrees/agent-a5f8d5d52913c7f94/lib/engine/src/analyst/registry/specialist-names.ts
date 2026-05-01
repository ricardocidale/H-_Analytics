/**
 * Canonical humanName constants for every Specialist persona and the
 * orchestrator (Gustavo). Import from here whenever you need to reference a
 * Specialist name in code — catalog, identity.ts, prompt builders, tests.
 *
 * Why a separate module: the catalog is a large object declaration and the
 * identity module has its own concerns. Centralising names here means
 * renaming a Specialist persona requires exactly ONE edit, not a grep-and-
 * replace across the codebase.
 *
 * Naming convention: SPECIALIST_HUMAN_NAME_<LETTER> follows the stable
 * catalog letter (A–P) so the constant is rename-safe — the letter does not
 * change when the persona name does.
 */

// ── Orchestrator ─────────────────────────────────────────────────────────────
export const ORCHESTRATOR_HUMAN_NAME = "Gustavo" as const;

// ── Management Company Specialists ───────────────────────────────────────────
/** A — Funding Intelligence */
export const SPECIALIST_HUMAN_NAME_A = "Ana" as const;
/** B — Revenue Intelligence */
export const SPECIALIST_HUMAN_NAME_B = "Bia" as const;
/** C — ICP Intelligence */
export const SPECIALIST_HUMAN_NAME_C = "Cecília" as const;
/** M — Compensation Intelligence */
export const SPECIALIST_HUMAN_NAME_M = "Mariana" as const;
/** N — Overhead Intelligence */
export const SPECIALIST_HUMAN_NAME_N = "Natália" as const;
/** O — Company Intelligence */
export const SPECIALIST_HUMAN_NAME_O = "Olívia" as const;
/** P — Property Defaults Intelligence */
export const SPECIALIST_HUMAN_NAME_P = "Paula" as const;

// ── Property Specialists ──────────────────────────────────────────────────────
/** D — Property Risk Intelligence */
export const SPECIALIST_HUMAN_NAME_D = "Daniela" as const;
/** E — Executive Summary */
export const SPECIALIST_HUMAN_NAME_E = "Eloá" as const;

// ── Photos Specialist ─────────────────────────────────────────────────────────
/** F — Photo Enhancer & Renders */
export const SPECIALIST_HUMAN_NAME_F = "Fernanda" as const;

// ── Portfolio Ops Specialist ──────────────────────────────────────────────────
/** G — Portfolio Watchdog */
export const SPECIALIST_HUMAN_NAME_G = "Giovanna" as const;

// ── Constants & Authority Sources Specialists ─────────────────────────────────
/** H — Tax Authority Research */
export const SPECIALIST_HUMAN_NAME_H = "Helena" as const;
/** I — Macro Indicators Research */
export const SPECIALIST_HUMAN_NAME_I = "Isadora" as const;
/** J — Depreciation Schedule Research */
export const SPECIALIST_HUMAN_NAME_J = "Júlia" as const;
/** K — Reporting Conventions Research */
export const SPECIALIST_HUMAN_NAME_K = "Kamila" as const;

// ── Resource Builder ──────────────────────────────────────────────────────────
/** L — Resource Builder */
export const SPECIALIST_HUMAN_NAME_L = "Letícia" as const;
