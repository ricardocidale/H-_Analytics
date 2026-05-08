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
 * turn through Rebecca, get the assistant reply" primitive but without
 * an HTTP request, without auth/rate-limiting, and without persisting
 * to the live conversation thread. This module provides exactly that:
 * one function that mirrors the LLM-dispatch core of /api/chat
 * (persona overlay, system prompt assembly, model selection, primary +
 * fallback provider) and returns just the reply string.
 *
 * **Settings source: live production config, NOT the fixture snapshot.**
 *   - The whole point of the scheduled replayer is to flag config
 *     regressions: an admin tweaks a slider in `RebeccaConfig.tsx`,
 *     the next nightly cycle re-runs every saved fixture against the
 *     freshly-merged `globalAssumptions.rebeccaConfig`, and any
 *     fixture whose answer drifts as a result fires an alert. If the
 *     replayer used the fixture's snapshot the loop would always
 *     pass — same inputs, same model, same persona — and config
 *     drift would never be caught.
 *   - The fixture's saved `settings` column is therefore intentionally
 *     IGNORED by the runner. It stays on the row as historical context
 *     (when the baseline was captured, what the persona looked like at
 *     the time) and as the source of truth for the manual client-side
 *     replay button, but the scheduled cycle always reads live config.
 *
 * What this runner intentionally does NOT do (vs. the real /api/chat):
 *   - **No vector / RAG retrieval, no asset search, no per-property
 *     field context, no scenario context.** Those subsystems pull
 *     fresh data on every request (vector embeddings, scenario
 *     listings, knowledge-base chunks) — replaying through them would
 *     produce drift unrelated to Rebecca's settings. The fixture
 *     exists to catch *settings-induced* drift (system prompt edits,
 *     persona slider changes, model swaps, source-toggle flips). A
 *     fixture that needs RAG context to be meaningful should be
 *     replayed manually from the UI.
 *   - **No conversation persistence.** Replays never write to
 *     `rebecca_conversations` / `rebecca_messages`.
 *   - **No cost logging via `logApiCost`.** Cost logs are tied to a
 *     real user request; the scheduled cycle would pollute per-user
 *     spend dashboards. The LLM call still happens through the real
 *     provider clients (so it is still billed by the upstream
 *     vendor), it just isn't attributed to a specific user row.
 */
import {
  mergeRebeccaSettings,
  buildPersonaOverlay,
  assembleSystemPrompt,
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
  /** Accumulated history (THIS replay's prior turns), in order. */
  history: FixtureReplayHistoryTurn[];
  /** The user prompt to send. */
  message: string;
  /**
   * The system actor whose `global_assumptions.rebeccaConfig` AND
   * `rebeccaSystemPrompt` define the LIVE production Rebecca settings
   * the replay should run against. Falls back to baked-in defaults
   * (mergeRebeccaSettings({}) + DEFAULT_SYSTEM_PROMPT) if the row is
   * missing or the actor cannot be resolved — keeps the cycle
   * functional in dev environments without admin seeding.
   *
   * The replay deliberately threads NO other GA field (portfolio,
   * funding lines, projection horizon, etc.) — see file header.
   */
  systemActorId: number | null;
}

export interface RunFixtureReplayTurnResult {
  response: string;
  /** Provider that produced the response (after any fallback). */
  provider: "openai" | "anthropic" | "gemini" | "perplexity" | "exa";
  model: string;
  /** True if the primary provider failed and we used the fallback. */
  usedFallback: boolean;
}

/**
 * Send a single user turn through Rebecca using the LIVE production
 * settings (system actor's `rebeccaConfig` + `rebeccaSystemPrompt`).
 * Mirrors the provider-dispatch + fallback shape of /api/chat without
 * the request/response/auth/persistence overhead.
 */
export async function runFixtureReplayTurn(
  input: RunFixtureReplayTurnInput,
): Promise<RunFixtureReplayTurnResult> {
  // Pull the live Rebecca config + system prompt off the system actor's
  // global_assumptions row. Anything else on that row is intentionally
  // ignored (see file header).
  let baseSystemPrompt = DEFAULT_SYSTEM_PROMPT;
  let liveConfig: Record<string, unknown> | null = null;
  if (input.systemActorId != null) {
    try {
      const ga = await storage.getGlobalAssumptions(input.systemActorId);
      if (ga?.rebeccaSystemPrompt) baseSystemPrompt = ga.rebeccaSystemPrompt;
      if (ga?.rebeccaConfig) liveConfig = ga.rebeccaConfig as Record<string, unknown>;
    } catch (err: unknown) {
      logger.warn(
        `fixture-replay: getGlobalAssumptions(${input.systemActorId}) failed, falling back to DEFAULT settings — ${err instanceof Error ? err.message : String(err)}`,
        "rebecca-preview-runner",
      );
    }
  }

  // mergeRebeccaSettings handles a null/missing config by returning
  // a fully-populated defaults object — same defense /api/chat runs.
  const settings: RebeccaSettings = mergeRebeccaSettings(liveConfig ?? {});

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
      input.history as Array<{ role: string; content: unknown; [key: string]: unknown }>,
      input.message,
      sampling,
      undefined, // no userId — replay is system-attributed
      webSearchEnabled,
    );
    return { response: r.text, provider, model, usedFallback: false };
  } catch (err: unknown) {
    // Mirror the live /api/chat fallback path. If the live settings
    // declare a fallback, try it once.
    const fb = settings.llm.fallbackProvider;
    if (fb) {
      const fbModel = settings.llm.fallbackModel || REBECCA_DEFAULT_MODEL[fb];
      try {
        const r = await callLlm(
          fb,
          fbModel,
          fullSystemPrompt,
          input.history as Array<{ role: string; content: unknown; [key: string]: unknown }>,
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
