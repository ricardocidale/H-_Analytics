/**
 * llm-models.ts — Centralized Claude model identifiers.
 *
 * Use the *_LATEST constants in new code instead of hard-coded model strings
 * so model upgrades happen in one place. Existing call sites that pin a
 * specific generation (e.g. `claude-opus-4-6` for the synthesis path) are
 * intentional and do not need to migrate to the constants — only stale or
 * unintentionally-drifting strings do.
 *
 * Stale Claude-3 IDs that may still appear in stored configs, user input,
 * or older code paths are mapped to a current model via
 * DEPRECATED_CLAUDE_MODEL_MAP. Route any externally-supplied model string
 * through normalizeClaudeModelId() before calling Anthropic so a typo or
 * stored stale string doesn't reach the API.
 *
 * Updating the model an entire app surface uses → edit this file.
 * Pinning a specific generation for a single use case → inline that ID
 * (with a comment explaining why pinning matters there).
 */

/** Most capable Claude model. */
export const CLAUDE_OPUS_LATEST = "claude-opus-4-7" as const;

/** Balanced speed and capability — the default for most LLM work. */
export const CLAUDE_SONNET_LATEST = "claude-sonnet-4-6" as const;

/** Fastest / lowest cost. Useful for routing, classification, light edits. */
export const CLAUDE_HAIKU_LATEST = "claude-haiku-4-5-20251001" as const;

/**
 * Stale Claude-3 model IDs that may still appear in stored data, persisted
 * configs, or legacy code paths. Each is redirected to a current Claude-4
 * model. The mapping target updates automatically when the *_LATEST
 * constants above are bumped.
 */
export const DEPRECATED_CLAUDE_MODEL_MAP: Record<string, string> = {
  "claude-3-5-sonnet-20241022": CLAUDE_SONNET_LATEST,
  "claude-3-5-sonnet": CLAUDE_SONNET_LATEST,
  // Stale Opus-3 requests are downgraded to Sonnet (not Opus) to avoid the
  // cost surprise of silently routing legacy traffic to the most expensive
  // current model. If a caller really needs Opus they should use
  // CLAUDE_OPUS_LATEST explicitly.
  "claude-3-opus-20240229": CLAUDE_SONNET_LATEST,
};

/**
 * Returns a current Claude model ID if the input is a known stale Claude-3
 * ID; otherwise returns the input unchanged. Use this on any model string
 * before passing it to anthropic.messages.create().
 */
export function normalizeClaudeModelId(model: string): string {
  return DEPRECATED_CLAUDE_MODEL_MAP[model] ?? model;
}
