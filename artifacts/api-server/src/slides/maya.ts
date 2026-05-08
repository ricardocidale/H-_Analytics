/**
 * Maya — cross-app slide content judge (Unit 7).
 *
 * Maya receives the assembled payloadV2 and slot drafts for one slide and
 * returns a holistic investor-appropriateness verdict. Called by Marco's
 * invoke_maya tool after dispatch_slide_team and before invoke_dino.
 *
 * Error path always returns verdict="block" — Maya may not silently pass a
 * slide it was unable to inspect.
 */
import { z } from "zod";
import { getAnthropicClient } from "../ai/clients";
import { logger } from "../logger";
import { MAYA_MODEL, MAYA_MAX_TOKENS, MAYA_PAYLOAD_TRUNCATE_CHARS, MAYA_DRAFTS_TRUNCATE_CHARS } from "./deck-render-constants";
import type { SlideNumber } from "./swarms/types";
import type { LuccaSlotDraft } from "@workspace/db";

export type MayaVerdictLevel = "ok" | "advisory" | "warning" | "block";

export interface MayaOutput {
  verdict: MayaVerdictLevel;
  headline: string;
  notes: string | null;
}

const MayaToolInputSchema = z.object({
  verdict: z.enum(["ok", "advisory", "warning", "block"]),
  headline: z.string(),
  notes: z.string().nullable().optional(),
});

const MAYA_TOOL_NAME = "report_maya_verdict";

const MAYA_SYSTEM = `You are Maya, a cross-application slide content judge for an investor-grade hospitality portfolio deck.

Your job: review the assembled content for ONE slide and return a holistic verdict on whether it is investor-appropriate, accurate-sounding, and visually coherent.

Use the report_maya_verdict tool to return your verdict:
  - "ok"       — ready to ship; no concerns
  - "advisory" — minor phrasing or formatting concern; does not block
  - "warning"  — material issue that should be reviewed before delivery
  - "block"    — content must not be delivered; serious accuracy or appropriateness problem

Be strict: investor decks are high-stakes. If content is missing, incoherent, or potentially misleading, block it.`;

const MAYA_TOOL: import("@anthropic-ai/sdk").Anthropic.Tool = {
  name: MAYA_TOOL_NAME,
  description:
    "Report your verdict on whether this slide's content is investor-appropriate and ready to deliver.",
  input_schema: {
    type: "object",
    required: ["verdict", "headline"],
    properties: {
      verdict: {
        type: "string",
        enum: ["ok", "advisory", "warning", "block"],
        description: "Overall verdict",
      },
      headline: {
        type: "string",
        description: "One sentence summarising the verdict",
      },
      notes: {
        type: ["string", "null"],
        description: "Optional elaboration, null when verdict is ok",
      },
    },
  },
};

export async function runMaya(
  slideNumber: SlideNumber,
  payloadV2: unknown,
  slotDrafts: Record<string, LuccaSlotDraft>,
): Promise<MayaOutput> {
  const errorBlock = (reason: string): MayaOutput => ({
    verdict: "block",
    headline: `Maya could not inspect slide ${slideNumber}: ${reason}`,
    notes: null,
  });

  let client: import("@anthropic-ai/sdk").default;
  try {
    client = getAnthropicClient();
  } catch (err: unknown) {
    logger.error(`[maya] slide ${slideNumber} — client unavailable: ${String(err)}`, "slide-factory");
    return errorBlock("Anthropic client unavailable");
  }

  try {
    const payloadJson = JSON.stringify(payloadV2).slice(0, MAYA_PAYLOAD_TRUNCATE_CHARS);
    const draftsJson = JSON.stringify(slotDrafts).slice(0, MAYA_DRAFTS_TRUNCATE_CHARS);

    const userContent = `Slide number: ${slideNumber}

Assembled payloadV2:
${payloadJson}

Slot drafts:
${draftsJson}

Review this slide content and call report_maya_verdict.`;

    const response = await client.messages.create({
      model: MAYA_MODEL,
      max_tokens: MAYA_MAX_TOKENS,
      system: MAYA_SYSTEM,
      tools: [MAYA_TOOL],
      messages: [{ role: "user", content: userContent }],
    });

    const toolUse = response.content.find(
      (b): b is import("@anthropic-ai/sdk").Anthropic.ToolUseBlock =>
        b.type === "tool_use" && b.name === MAYA_TOOL_NAME,
    );

    if (!toolUse) {
      logger.warn(`[maya] slide ${slideNumber} — no tool_use in response`, "slide-factory");
      return errorBlock("LLM did not call report_maya_verdict");
    }

    const parsed = MayaToolInputSchema.safeParse(toolUse.input);
    if (!parsed.success) {
      logger.warn(
        `[maya] slide ${slideNumber} — malformed tool input: ${parsed.error.message}`,
        "slide-factory",
      );
      return errorBlock("Maya returned malformed tool input");
    }
    return {
      verdict: parsed.data.verdict,
      headline: parsed.data.headline,
      notes: parsed.data.notes ?? null,
    };
  } catch (err: unknown) {
    logger.error(`[maya] slide ${slideNumber} — LLM error: ${String(err)}`, "slide-factory");
    return errorBlock("LLM call failed");
  }
}
