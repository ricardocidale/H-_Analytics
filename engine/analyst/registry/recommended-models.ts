/**
 * Canonical recommended model slugs by pipeline role.
 *
 * Source of truth: `.claude/rules/llm-vendor-roster.md` recommendation matrix
 * (refreshed 2026-04-25). Updated quarterly via the roster refresh process.
 *
 * These are product recommendations — the best model for each role given the
 * current vendor landscape. They are intentionally separate from runtime
 * fallbacks in `server/ai/specialist-llm-resolver.ts::HARDCODED_LLM_DEFAULTS`,
 * which reflect today's actual defaults. The gap between the two is surfaced
 * in the LLM Config tab so admins see when a Specialist is running below the
 * recommended tier.
 *
 * Do NOT store numeric resource IDs here — those are env-specific. Store the
 * model slug (the `modelSlug` column in `admin_resources`). The UI resolves
 * the slug to a resource ID via the models list.
 */
export const RECOMMENDED_MODEL_SLUGS_BY_ROLE = {
  /** Prompt Engineer pre-stage (cheap tier, structured output) */
  primary: "claude-sonnet-4-6",
  /** Quantitative panel (fast, numeric extraction) */
  analystA: "gemini-2-5-flash",
  /** Market panel (qualitative, reasoning + citation) */
  analystB: "claude-sonnet-4-6",
  /** Synthesis / final verdict (Opus tier) */
  synthesis: "claude-opus-4-7",
  /** N+2 failover (lightweight, persona-safe — must stay Anthropic family) */
  fallback: "claude-haiku-4-5-20251001",
} as const satisfies Record<string, string>;

export type RecommendedModelRole = keyof typeof RECOMMENDED_MODEL_SLUGS_BY_ROLE;
