/**
 * Voice Renderer — the single chokepoint between Specialist structured output
 * and user-facing strings. Runtime enforcement of the persona contract in
 * .claude/rules/the-analyst-persona.md.
 *
 * Spec:  docs/architecture/analyst/voice-rendering.md
 * Skill: .claude/skills/analyst/voice.md
 *
 * Hard rules (all enforced here):
 *   1. Specialists never craft user-facing strings — they supply structured
 *      inputs; this module composes the text.
 *   2. Forbidden patterns (FORBIDDEN_VOICE_PATTERNS) are runtime-rejected.
 *   3. range !== null && qualityScore < CONVICTION_FLOOR → developing-data
 *      voice, no range emitted.
 *   4. The renderer is pure. Same inputs → same output.
 *   5. In dev (NODE_ENV !== "production") violations throw.
 *      In prod, violations are logged + the offending phrase stripped.
 *
 * The branded VoiceRenderedString type (from contracts/verdict.ts) is the
 * static enforcement. This module is the only place that constructs values
 * of that branded type (via __castVoiceRendered).
 */

import { CONVICTION_FLOOR } from "@shared/analyst-conviction";
import {
  __castVoiceRendered,
  type PersonaContext,
  type Severity,
  type VerdictDimension,
  type VerdictRange,
  type VoiceBlock,
  type VoiceIntent,
  type VoiceRenderedString,
  type Evidence,
} from "../contracts/verdict";

// ────────────────────────────────────────────────────────────────────────────
// Forbidden patterns (runtime-rejected)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Patterns that must never appear in user-facing voice output. Regex-based
 * with word boundaries where appropriate. The runtime list is paired with
 * the static suite at tests/audit/vocabulary-compliance.test.ts for defense
 * in depth.
 *
 * NOTE: entries here are case-INsensitive unless marked otherwise. Order
 * matters for sanitization — more-specific phrases should come before
 * more-general ones so sanitize catches the bigger match first.
 */
export const FORBIDDEN_VOICE_PATTERNS: Array<{
  pattern: RegExp;
  label: string;
  replacement: string;
}> = [
  // Plural / possessive plural Analyst references
  { pattern: /\bthe\s+analysts\b/gi, label: "the analysts", replacement: "The Analyst" },
  { pattern: /\bour\s+analysts\b/gi, label: "our analysts", replacement: "The Analyst" },
  { pattern: /\byour\s+analysts\b/gi, label: "your analysts", replacement: "The Analyst" },

  // Lowercase "the analyst" as a noun (case-SENSITIVE — we expect capitalized "The Analyst")
  { pattern: /(?<![A-Za-z.])the\s+analyst\b/g, label: "the analyst (lowercase)", replacement: "The Analyst" },

  // "the system" / "the algorithm" attribution language
  { pattern: /\bthe\s+system\s+(?:generated|produced|computed|decided)\b/gi, label: "the system generated/produced/…", replacement: "The Analyst reviewed" },
  { pattern: /\bthe\s+algorithm\b/gi, label: "the algorithm", replacement: "The Analyst" },

  // Rebecca's scope — not The Analyst's
  { pattern: /\bthe\s+chatbot\b/gi, label: "the chatbot", replacement: "Rebecca" },
  { pattern: /\bthe\s+assistant\b/gi, label: "the assistant", replacement: "Rebecca" },
  { pattern: /\bAI\s+helper\b/gi, label: "AI helper", replacement: "Rebecca" },

  // Button labels
  { pattern: /\bSave\s+Changes\b/g, label: "Save Changes", replacement: "Save" },
  { pattern: /\bSave\s+changes\b/g, label: "Save changes", replacement: "Save" },

  // Legacy CTA phrase
  { pattern: /\bAsk\s+the\s+Analyst\b/gi, label: "Ask the Analyst", replacement: "Analyst" },

  // Legacy intelligence terms
  { pattern: /\bRegenerate\s+Intelligence\b/gi, label: "Regenerate Intelligence", replacement: "Analyst" },
  { pattern: /\bNo\s+Intelligence\b/gi, label: "No Intelligence", replacement: "Not yet reviewed" },

  // Internal team vocabulary — must never surface to the user
  { pattern: /\bSurface\s+Specialist(?:s)?\b/g, label: "Surface Specialist", replacement: "The Analyst" },
  { pattern: /\bCognitive\s+Engine\b/g, label: "Cognitive Engine", replacement: "The Analyst" },
  { pattern: /\bSurface\s+Router\b/g, label: "Surface Router", replacement: "The Analyst" },
  { pattern: /\bVoice\s+Renderer\b/g, label: "Voice Renderer", replacement: "The Analyst" },
  { pattern: /\bQuality\s+Scorer\b/g, label: "Quality Scorer", replacement: "The Analyst" },
];

// ────────────────────────────────────────────────────────────────────────────
// Error
// ────────────────────────────────────────────────────────────────────────────

export class PersonaViolationError extends Error {
  readonly field: string;
  readonly offending: string;
  readonly matchedLabel: string;
  constructor(field: string, offending: string, matchedLabel: string) {
    super(`Voice Renderer persona violation on field "${field}": matched "${matchedLabel}" in output "${offending}"`);
    this.name = "PersonaViolationError";
    this.field = field;
    this.offending = offending;
    this.matchedLabel = matchedLabel;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Conviction label mapping (mirrors confidence-scorer.ts tiers)
// ────────────────────────────────────────────────────────────────────────────

function convictionLabel(qualityScore: number): string {
  if (qualityScore >= 80) return "high conviction";
  if (qualityScore >= 60) return "moderate conviction";
  if (qualityScore >= CONVICTION_FLOOR) return "developing conviction";
  return "developing data";
}

// ────────────────────────────────────────────────────────────────────────────
// Severity → tone verb / opener
// ────────────────────────────────────────────────────────────────────────────

function toneOpener(severity: Severity, intent: VoiceIntent): string {
  if (severity === "block") return "The Analyst will not endorse this configuration";
  if (severity === "warning") return "The Analyst flags this for review";
  if (severity === "advisory") {
    if (intent === "below-range") return "The Analyst notes this sits at the low edge of range";
    if (intent === "above-range") return "The Analyst notes this sits above range";
    if (intent === "missing-data") return "The Analyst does not have enough data to endorse a range";
    return "The Analyst notes a calibration opportunity";
  }
  return "The Analyst confirms this is within range";
}

// ────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ────────────────────────────────────────────────────────────────────────────

function formatNumber(n: number, unit: string): string {
  if (unit === "%") return `${(n * 100).toFixed(1)}%`;
  if (unit === "$") return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return `${n}${unit ? " " + unit : ""}`;
}

function formatRange(r: VerdictRange): string {
  return `${formatNumber(r.low, r.unit)}–${formatNumber(r.high, r.unit)}`;
}

function personaPhrase(persona: PersonaContext): string {
  // Range anchor: "within The Analyst's L+B luxury range". Skip ambient
  // persona descriptors that don't read well in prose (e.g. "market = US").
  const parts = [persona.segment, persona.tier].filter((x) => x && x.length > 0);
  return parts.join(" ");
}

function humanField(field: string): string {
  // Simple heuristic: replace dots/underscores/hyphens with spaces, then
  // title-case. Good-enough readable names until a proper field registry
  // lands.
  return field
    .replace(/[._-]/g, " ")
    .replace(/\b([a-z])/g, (_m, c: string) => c.toUpperCase())
    .trim();
}

// ────────────────────────────────────────────────────────────────────────────
// Composition
// ────────────────────────────────────────────────────────────────────────────

function composeDimensionHeadline(inputs: VoiceRenderInputs): string {
  const { field, severity, range, qualityScore, intent, personaContext } = inputs;

  // Below-floor guard: any dimension whose qualityScore is below the
  // conviction floor emits developing-data voice with no range. This
  // covers both the "range passed in but weak" path and the Router's
  // downgrade path (which passes range=null + severity=ok).
  if (qualityScore < CONVICTION_FLOOR) {
    return `${humanField(field)} — developing data. The Analyst will refine this as more sources land.`;
  }

  const opener = toneOpener(severity, intent);
  const label = convictionLabel(qualityScore);

  if (range === null) {
    return `${humanField(field)} — ${opener}.`;
  }

  const midFormatted = formatNumber(range.mid, range.unit);
  const rangeFormatted = formatRange(range);
  const persona = personaPhrase(personaContext);
  const personaTail = persona ? ` ${persona} range` : " range";

  return `${humanField(field)} at ${midFormatted} — ${opener.replace(/^The Analyst /, "")} for The Analyst's${personaTail} (${rangeFormatted}, ${label}).`;
}

function composeDimensionDetail(inputs: VoiceRenderInputs): string | undefined {
  const { evidence, qualityScore, intent } = inputs;
  if (evidence.length === 0) return undefined;
  if (qualityScore < CONVICTION_FLOOR) return undefined;

  const sourceList = evidence
    .slice(0, 3)
    .map((e) => e.source)
    .join(", ");
  const more = evidence.length > 3 ? ` (+${evidence.length - 3} more)` : "";

  const tail = intent === "below-range" || intent === "above-range"
    ? " Expect LP questions on values outside the range."
    : "";

  return `Evidence: ${sourceList}${more}.${tail}`.trim();
}

function composeSurfaceHeadline(dimensions: readonly VerdictDimension[]): string {
  if (dimensions.length === 0) {
    return "The Analyst has no dimensions to report on this surface.";
  }
  const blocks = dimensions.filter((d) => d.severity === "block").length;
  const warnings = dimensions.filter((d) => d.severity === "warning").length;
  const advisories = dimensions.filter((d) => d.severity === "advisory").length;

  if (blocks > 0) {
    return `The Analyst will not endorse ${blocks} dimension${blocks === 1 ? "" : "s"} on this surface.`;
  }
  if (warnings > 0) {
    return `The Analyst flags ${warnings} dimension${warnings === 1 ? "" : "s"} for review${advisories > 0 ? ` and ${advisories} for calibration` : ""}.`;
  }
  if (advisories > 0) {
    return `The Analyst notes ${advisories} calibration opportunit${advisories === 1 ? "y" : "ies"}.`;
  }
  return "The Analyst confirms this surface is within range.";
}

function composeSurfaceDetail(dimensions: readonly VerdictDimension[]): string | undefined {
  if (dimensions.length === 0) return undefined;
  const names = dimensions
    .filter((d) => d.severity !== "ok")
    .slice(0, 3)
    .map((d) => humanField(d.field));
  if (names.length === 0) return undefined;
  return `Dimensions flagged: ${names.join(", ")}.`;
}

// ────────────────────────────────────────────────────────────────────────────
// Enforcement
// ────────────────────────────────────────────────────────────────────────────

function findForbidden(text: string): { pattern: RegExp; label: string; replacement: string } | null {
  for (const entry of FORBIDDEN_VOICE_PATTERNS) {
    // Reset lastIndex on global regexes in case of reuse.
    entry.pattern.lastIndex = 0;
    if (entry.pattern.test(text)) {
      entry.pattern.lastIndex = 0;
      return entry;
    }
  }
  return null;
}

function sanitize(text: string): string {
  let out = text;
  for (const entry of FORBIDDEN_VOICE_PATTERNS) {
    out = out.replace(entry.pattern, entry.replacement);
  }
  return out;
}

function enforceOrSanitize(text: string, field: string): string {
  const match = findForbidden(text);
  if (!match) return text;

  if (process.env.NODE_ENV === "production") {
    console.warn(`[voice-renderer] persona-violation field=${field} matched="${match.label}"`);
    return sanitize(text);
  }
  throw new PersonaViolationError(field, text, match.label);
}

// ────────────────────────────────────────────────────────────────────────────
// Public contract
// ────────────────────────────────────────────────────────────────────────────

export interface VoiceRenderInputs {
  field: string;
  severity: Severity;
  range: VerdictRange | null;
  qualityScore: number;
  evidence: Evidence[];
  intent: VoiceIntent;
  personaContext: PersonaContext;
}

export interface VoiceRenderer {
  renderDimension(inputs: VoiceRenderInputs): VoiceBlock;
  renderSurface(dimensions: readonly VerdictDimension[]): VoiceBlock;
}

export function createVoiceRenderer(): VoiceRenderer {
  return {
    renderDimension(inputs: VoiceRenderInputs): VoiceBlock {
      const headlineRaw = composeDimensionHeadline(inputs);
      const headline = enforceOrSanitize(headlineRaw, inputs.field);

      const detailRaw = composeDimensionDetail(inputs);
      const detail = detailRaw === undefined ? undefined : enforceOrSanitize(detailRaw, inputs.field);

      return {
        headline: __castVoiceRendered(headline),
        detail: detail === undefined ? undefined : __castVoiceRendered(detail),
      };
    },
    renderSurface(dimensions: readonly VerdictDimension[]): VoiceBlock {
      const headlineRaw = composeSurfaceHeadline(dimensions);
      const headline = enforceOrSanitize(headlineRaw, "__surface__");

      const detailRaw = composeSurfaceDetail(dimensions);
      const detail = detailRaw === undefined ? undefined : enforceOrSanitize(detailRaw, "__surface__");

      return {
        headline: __castVoiceRendered(headline),
        detail: detail === undefined ? undefined : __castVoiceRendered(detail),
      };
    },
  };
}

/**
 * Test helper: force-render a raw string through the enforcement machinery.
 * Only used by voice-renderer tests to assert forbidden-pattern behavior in
 * isolation from the composition logic.
 *
 * Do NOT import this outside tests.
 */
export const __testEnforce = (text: string, field = "__test__"): string => enforceOrSanitize(text, field);
export const __testSanitize = (text: string): string => sanitize(text);
