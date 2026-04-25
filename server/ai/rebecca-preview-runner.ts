/**
 * Server-side preview-replay runner for Rebecca fixtures (Task #559).
 *
 * The Test Chat fixtures panel (client/src/components/admin/ai-agents/
 * RebeccaFixturesPanel.tsx) lets admins save a (settings + transcript)
 * snapshot and replay it on demand by walking each user turn through
 * `POST /api/chat` from the browser. That manual replay is great for
 * an admin sanity-check after editing settings, but it cannot detect
 * regressions on its own — nobody hits the button on a schedule.
 *
 * Task #559 adds a background job that needs the same "send this user
 * turn through Rebecca with these settings, get the assistant reply"
 * primitive but without an HTTP request, without auth/rate-limiting,
 * and without persisting to the live conversation thread. This module
 * provides exactly that: one function that mirrors the LLM-dispatch
 * core of /api/chat (persona overlay, system prompt assembly, model
 * selection, primary + fallback provider) and returns just the reply
 * string.
 *
 * What this runner intentionally does NOT do (vs. the real /api/chat):
 *   - **No vector / RAG retrieval, no asset search, no per-property
 *     field context, no scenario context.** Those subsystems pull
 *     fresh data on every request (vector embeddings, scenario
 *     listings, knowledge-base chunks) — replaying through them would
 *     produce drift that has nothing to do with the fixture's saved
 *     settings, defeating the purpose of fixture-based regression
 *     detection. The fixture exists to catch *settings-induced*
 *     drift (system prompt edits, persona slider changes, model
 *     swaps, source-toggle flips). A fixture that needs RAG context
 *     to be meaningful should be replayed manually from the UI.
 *   - **No conversation persistence.** Replays never write to
 *     `rebecca_conversations` / `rebecca_messages`.
 *   - **No cost logging via `logApiCost`.** Cost logs are tied to a
 *     real user request; the scheduled cycle would pollute per-user
 *     spend dashboards. The LLM call still happens through the real
 *     provider clients (so it is still billed by the upstream
 *     vendor), it just isn't attributed to a specific user row.
 *
 * The fixture's saved `settings.llm` (provider, model, sampling,
 * fallback) is honored verbatim. That is the whole point — the
 * fixture pins the configuration we want to keep stable, and the
 * replay verifies that configuration still produces the same answer.
 */
import {
  mergeRebeccaSettings,
  buildPersonaOverlay,
  assembleSystemPrompt,
  rebeccaSettingsSchema,
  REBECCA_DEFAULT_MODEL,
  type RebeccaSettings,
} from "@shared/rebecca-settings";
import { callLlm } from "../routes/chat";
import { storage } from "../storage";
import { DEFAULT_SYSTEM_PROMPT } from "../routes/chat-prompts";
import { logger } from "../logger";

export interface FixtureReplayHistoryTurn {
  role: "user" | "assistant";
  content: string;
}

export interface RunFixtureReplayTurnInput {
  /** Fully-merged Rebecca settings snapshot from the fixture. */
  settings: unknown;
  /** Accumulated history (THIS replay's prior turns), in order. */
  history: FixtureReplayHistoryTurn[];
  /** The user prompt to send. */
  message: string;
  /**
   * The system actor whose `global_assumptions.rebeccaSystemPrompt` is
   * used as the base prompt. Falls back to {@link DEFAULT_SYSTEM_PROMPT}
   * if the row is missing or the actor cannot be resolved. The replay
   * runner intentionally avoids `getGlobalAssumptions()` for any
   * non-prompt field — properties / scenarios / funding context are
   * not threaded through the replay (see file header).
   */
  systemActorId: number | null;
}

export interface RunFixtureReplayTurnResult {
  response: string;
  /** Provider that produced the response (after any fallback). */
  provider: "openai" | "anthropic" | "gemini" | "perplexity";
  model: string;
  /** True if the primary provider failed and we used the fallback. */
  usedFallback: boolean;
}

/**
 * Send a single user turn through Rebecca using the fixture's settings.
 * Mirrors the provider-dispatch + fallback shape of /api/chat without
 * the request/response/auth/persistence overhead.
 */
export async function runFixtureReplayTurn(
  input: RunFixtureReplayTurnInput,
): Promise<RunFixtureReplayTurnResult> {
  // Re-parse the settings snapshot through the canonical schema so a
  // half-migrated old fixture (e.g. one missing a slider that was added
  // later) still produces a valid RebeccaSettings object — same defense
  // the live POST handler runs.
  const parsed = rebeccaSettingsSchema.safeParse(input.settings);
  const settings: RebeccaSettings = parsed.success
    ? parsed.data
    : mergeRebeccaSettings(input.settings as Record<string, unknown>);

  // Pull just the system-prompt base. Everything else about the GA row
  // (portfolio, funding lines, projection horizon, etc.) is intentionally
  // skipped — see file header.
  let baseSystemPrompt = DEFAULT_SYSTEM_PROMPT;
  if (input.systemActorId != null) {
    try {
      const ga = await storage.getGlobalAssumptions(input.systemActorId);
      if (ga?.rebeccaSystemPrompt) baseSystemPrompt = ga.rebeccaSystemPrompt;
    } catch (err: unknown) {
      logger.warn(
        `fixture-replay: getGlobalAssumptions(${input.systemActorId}) failed, falling back to DEFAULT_SYSTEM_PROMPT — ${err instanceof Error ? err.message : String(err)}`,
        "rebecca-preview-runner",
      );
    }
  }

  const personaOverlay = buildPersonaOverlay(settings, "Rebecca");
  // No portfolio / RAG / asset / field blocks — see file header.
  const fullSystemPrompt = assembleSystemPrompt(
    {
      baseSystem: baseSystemPrompt,
      personaOverlay,
    },
    settings.sources,
  );

  const provider = settings.llm.provider;
  const model = settings.llm.model || REBECCA_DEFAULT_MODEL[provider];
  const sampling = {
    temperature: settings.llm.temperature,
    maxOutputTokens: settings.llm.maxOutputTokens,
    topP: settings.llm.topP,
  };
  const webSearchEnabled = settings.sources.webSearch.enabled;

  try {
    const r = await callLlm(
      provider,
      model,
      fullSystemPrompt,
      input.history,
      input.message,
      sampling,
      undefined, // no userId — replay is system-attributed
      webSearchEnabled,
    );
    return { response: r.text, provider, model, usedFallback: false };
  } catch (err: unknown) {
    // Mirror the live /api/chat fallback path. If the fixture's
    // settings declare a fallback, try it once.
    const fb = settings.llm.fallbackProvider;
    if (fb) {
      const fbModel = settings.llm.fallbackModel || REBECCA_DEFAULT_MODEL[fb];
      try {
        const r = await callLlm(
          fb,
          fbModel,
          fullSystemPrompt,
          input.history,
          input.message,
          sampling,
          undefined,
          webSearchEnabled,
        );
        return { response: r.text, provider: fb, model: fbModel, usedFallback: true };
      } catch (fallbackErr: unknown) {
        const m = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        throw new Error(`Replay failed (primary + fallback): ${m}`);
      }
    }
    const m = err instanceof Error ? err.message : String(err);
    throw new Error(`Replay failed: ${m}`);
  }
}
