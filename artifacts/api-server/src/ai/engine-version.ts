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
//
// OT-A.5 C.3/C.4: bump to v3 — added CBRE/HVS management contract
// source pointer to incentiveFee and brand FDD / STR HOST pointer to
// svcFeeMarketing. Both are Class-1 watchlist fields; these anchors
// prevent mode-collapse by naming the authoritative publication. Verdict
// cache must cold-miss; ADR-004 invariant.
export const ENGINE_VERSION = "v3-2026-05-05-a" as const;

export const SYNTHESIS_FINGERPRINT =
  "4a5ddf4d81e42483b634e2eb4cb5f7c8839d625a045ace2e214f9eee7fbff0ed" as const;

export const COGNITIVE_MODEL_VERSIONS = {
  analystA: "gemini-2.5-flash",
  analystB: "claude-sonnet-4-5",
  synthesis: "claude-opus-4-6",
} as const;

export type CognitiveModelRole = keyof typeof COGNITIVE_MODEL_VERSIONS;
