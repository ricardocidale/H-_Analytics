/**
 * Slide factory slot-suggest route.
 *
 * POST /api/lb-slides/factory/runs/:id/slots/:key/suggest
 *
 * Calls an LLM to propose an improved value for a single Lucca draft slot.
 * Admin-only; run must be `complete` and the slot key must exist in luccaDraft.
 *
 * In-flight guard: a module-level Set prevents concurrent duplicate requests for
 * the same run+slot combination (returns 429). The entry is removed in a `finally`
 * block so a failure never permanently locks the slot.
 *
 * Model resolution: uses the "research-synthesis" llm_slot row from admin_resources
 * via resolveLlmFor(), then dispatches to the appropriate AI client. Throws on
 * missing slot row (guaranteed seeded by admin-resources-005) so no fallback needed.
 */
import type { Express, Request, Response } from "express";
import { requireAdmin, getAuthUser } from "../auth";
import { getSlideFactoryRun } from "../storage/slide-factory-runs";
import { parseRouteId, logAndSendError } from "./helpers";
import { resolveLlmFor } from "../ai/llm-config-resolver";
import { getAnthropicClient } from "../ai/clients";
import { getOpenAIClient } from "../ai/clients";
import { getGeminiClient } from "../ai/clients";
import { logger } from "../logger";
import {
  HTTP_200_OK,
  HTTP_400_BAD_REQUEST,
  HTTP_404_NOT_FOUND,
  HTTP_409_CONFLICT,
  HTTP_429_TOO_MANY_REQUESTS,
  HTTP_502_BAD_GATEWAY,
  AI_SLOT_SUGGEST_MAX_TOKENS,
  AI_SLOT_SUGGEST_TEMPERATURE,
} from "../constants";

// ── In-flight guard ───────────────────────────────────────────────────────────
// Key format: "<runId>:<slotKey>"
const inFlightSuggestions = new Set<string>();

// ── Route registration ────────────────────────────────────────────────────────

export function registerSlideFactorySuggestRoutes(app: Express): void {
  app.post(
    "/api/lb-slides/factory/runs/:id/slots/:key/suggest",
    requireAdmin,
    async (req: Request, res: Response) => {
      try {
        const user = getAuthUser(req);
        const id = parseRouteId(req.params.id);
        if (!id) {
          return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid run ID" });
        }

        const rawKey = req.params.key;
        if (!rawKey || Array.isArray(rawKey)) {
          return res.status(HTTP_400_BAD_REQUEST).json({ error: "Missing or invalid slot key" });
        }
        const slotKey: string = rawKey;

        // Auth + existence guard
        const run = await getSlideFactoryRun(id, user.id);
        if (!run) {
          return res.status(HTTP_404_NOT_FOUND).json({ error: "Not found" });
        }

        // Status guard: only suggest on completed runs
        if (run.status !== "complete") {
          return res.status(HTTP_409_CONFLICT).json({
            error: `Slot suggest requires status 'complete', current: '${run.status}'`,
          });
        }

        // Slot key guard
        if (!run.luccaDraft || !(slotKey in run.luccaDraft)) {
          return res.status(HTTP_404_NOT_FOUND).json({
            error: `Slot '${slotKey}' not found in draft`,
          });
        }

        const currentValue = run.luccaDraft[slotKey].value;

        // In-flight duplicate guard
        const inFlightKey = `${id}:${slotKey}`;
        if (inFlightSuggestions.has(inFlightKey)) {
          return res.status(HTTP_429_TOO_MANY_REQUESTS).json({
            error: "Suggestion already in progress for this slot.",
          });
        }
        inFlightSuggestions.add(inFlightKey);

        try {
          // Resolve LLM via admin_resources (no hardcoded model identifiers)
          const { vendor, modelId } = await resolveLlmFor("research-synthesis");

          const prompt = `You are a hospitality investment deck copywriter. Improve the following slide copy for slot "${slotKey}".
Current value: "${currentValue}"
Keep it concise, professional, and investor-facing. Return ONLY the improved text, nothing else.`;

          let suggestionText: string;

          if (vendor === "anthropic") {
            const client = getAnthropicClient();
            const response = await client.messages.create({
              model: modelId,
              max_tokens: AI_SLOT_SUGGEST_MAX_TOKENS,
              temperature: AI_SLOT_SUGGEST_TEMPERATURE,
              messages: [{ role: "user", content: prompt }],
            });
            const textBlock = response.content.find((b) => b.type === "text");
            if (!textBlock || textBlock.type !== "text") {
              throw new Error("LLM returned no text block");
            }
            suggestionText = textBlock.text.trim();
          } else if (vendor === "openai") {
            const client = getOpenAIClient();
            const completion = await client.chat.completions.create({
              model: modelId,
              max_tokens: AI_SLOT_SUGGEST_MAX_TOKENS,
              temperature: AI_SLOT_SUGGEST_TEMPERATURE,
              messages: [{ role: "user", content: prompt }],
            });
            suggestionText = (completion.choices[0]?.message?.content ?? "").trim();
          } else {
            // Gemini / other
            const gemini = getGeminiClient();
            const response = await gemini.models.generateContent({
              model: modelId,
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              config: {
                maxOutputTokens: AI_SLOT_SUGGEST_MAX_TOKENS,
                temperature: AI_SLOT_SUGGEST_TEMPERATURE,
              },
            });
            suggestionText = (response.text ?? "").trim();
          }

          if (!suggestionText) {
            throw new Error("LLM returned empty suggestion");
          }

          return res.status(HTTP_200_OK).json({ suggestion: suggestionText });
        } catch (llmErr: unknown) {
          const msg = llmErr instanceof Error ? llmErr.message : String(llmErr);
          logger.error(`Slot suggest LLM error (run=${id}, slot=${slotKey}): ${msg}`, "slide-factory-suggest");
          return res.status(HTTP_502_BAD_GATEWAY).json({
            error: "Suggestion unavailable — try again.",
          });
        } finally {
          inFlightSuggestions.delete(inFlightKey);
        }
      } catch (err: unknown) {
        logAndSendError(res, "Failed to generate slot suggestion", err);
      }
    },
  );
}
