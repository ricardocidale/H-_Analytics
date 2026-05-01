/**
 * Cognitive Engine version + fingerprint.
 *
 * Part of the ADR-004 verdict-cache design. The cache key includes
 * `engineVersion` so any change to the Cognitive Engine's synthesis
 * semantics cold-misses the cache by definition.
 *
 * When you change:
 *   - `server/ai/synthesis-schema.ts` (FIELD_DEFINITIONS, SynthesisOutputSchema)
 *   - `server/ai/research-prompt-builders.ts` (prompt templates)
 *   - the model choices for Analyst A / B / Synthesis
 *
 * you MUST:
 *   1. Bump `ENGINE_VERSION` (append `-b`, `-c`, or move to next date)
 *   2. Update `SYNTHESIS_FINGERPRINT` to the new hash
 *   3. Update `COGNITIVE_MODEL_VERSIONS` if you swapped a model
 *
 * `tests/proof/engine-version-drift.test.ts` enforces this. If you
 * change a synthesis file without bumping, the test fails.
 *
 * Recompute the fingerprint locally with:
 *   cat server/ai/synthesis-schema.ts server/ai/research-prompt-builders.ts | sha256sum
 */

// OT-A.4: bump to v2 — synthesis-schema.ts gained the
// `synthesisOutputToLegacyJson` adapter, which is a Cognitive Engine
// semantic change (it defines how SynthesisOutput maps onto the legacy
// envelope that extractGuidance + UI consume). Verdict cache must
// cold-miss; ADR-004 invariant.
export const ENGINE_VERSION = "v2-2026-04-20-a" as const;

export const SYNTHESIS_FINGERPRINT =
  "786aae354061bc8780e8f092a2dd78581c086b840a2ad0e032be383aa27d8769" as const;

export const COGNITIVE_MODEL_VERSIONS = {
  analystA: "gemini-2.5-flash",
  analystB: "claude-sonnet-4-5",
  synthesis: "claude-opus-4-6",
} as const;

export type CognitiveModelRole = keyof typeof COGNITIVE_MODEL_VERSIONS;
