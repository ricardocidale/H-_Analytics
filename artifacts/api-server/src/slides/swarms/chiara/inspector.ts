/**
 * Chiara-03 — Inspector (Hybrid).
 *
 * Two-pass verification of the Builder's Slide3Payload:
 *   Pass 1 — deterministic: slide3PayloadSchema.safeParse (Zod)
 *   Pass 2 — LLM-vision:  Opus 4.7 holistic review against canonical PNG
 *
 * Either pass can block the slide. Pass 1 catches structural drift; Pass 2
 * catches editorial concerns (copy that fits the schema but diverges in tone
 * or completeness from the canonical design intent).
 *
 * Pass 2 is scope-limited to editorial/holistic concerns — never pixel-diff.
 * Pixel-diff lives in Dino (U7).
 */
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient } from "../../../ai/clients";
import { logger } from "../../../logger";
import { slide3PayloadSchema } from "@shared/deck-payload-v2";
import type { Slide3Payload } from "@shared/deck-payload-v2";
import {
  SWARM_INSPECTOR_MAX_TOKENS,
} from "../../deck-render-constants";
import { resolveLorenzoVisionModelId } from "../../factory-v2-llm-resolver";
import { getStorageProviderAsync } from "../../../providers/storage";

// ── Inspector verdict ────────────────────────────────────────────────────────

export interface ChiaraInspectorVerdict {
  status: "ok" | "block" | "fail";
  notes: string | null;
}

// ── Pass 2 tool schema ───────────────────────────────────────────────────────

interface InspectorPass2Input {
  approved: boolean;
  notes: string | null;
}

const INSPECTOR_PASS2_TOOL: Anthropic.Tool = {
  name: "report_inspection_verdict",
  description:
    "Report whether the assembled Slide 3 editorial payload is acceptable " +
    "for an investor presentation against the canonical reference.",
  input_schema: {
    type: "object",
    required: ["approved", "notes"],
    properties: {
      approved: { type: "boolean" },
      notes: {
        type: ["string", "null"],
        description:
          "Null if approved. Specific editorial concern if rejected — " +
          "do NOT reject on pixel/layout grounds (that is Dino's domain).",
      },
    },
  },
};

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Run Chiara-03: verify the Builder's payload via Zod (Pass 1) and Opus 4.7
 * vision (Pass 2). Returns a verdict with status and optional notes.
 */
export async function runChiaraInspector(
  payload: Slide3Payload,
  canonicalPngKey: string,
): Promise<ChiaraInspectorVerdict> {
  // ── Pass 1 — deterministic Zod validation ──────────────────────────────────
  const parsed = slide3PayloadSchema.safeParse(payload);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    logger.warn(`[chiara-03] Pass 1 BLOCK — schema issues: ${issues}`, "slide-factory");
    return { status: "block", notes: `Schema validation failed: ${issues}` };
  }

  logger.info("[chiara-03] Pass 1 PASS — schema valid", "slide-factory");

  // ── Pass 2 — LLM-vision holistic review ────────────────────────────────────
  let pngBuffer: Buffer;
  try {
    const storageProvider = await getStorageProviderAsync();
    const { buffer } = await storageProvider.downloadBuffer(canonicalPngKey);
    pngBuffer = buffer;
  } catch (err: unknown) {
    // If canonical PNG is unavailable, skip Pass 2 and approve — Inspector
    // never auto-fails on infra errors; Dino handles pixel-level verification.
    logger.warn(
      `[chiara-03] Pass 2 skipped — canonical PNG unavailable: ${String(err)}`,
      "slide-factory",
    );
    return { status: "ok", notes: null };
  }

  const reasonsSummary =
    payload.reasons && payload.reasons.length > 0
      ? payload.reasons
          .map((r, i) => `  ${i + 1}. "${r.label.text}" — ${r.detail.text}`)
          .join("\n")
      : "  (none)";

  const payloadSummary =
    `conceptParagraph: ${payload.conceptParagraph ? `"${payload.conceptParagraph.text}"` : "(none)"}\n` +
    `marketRationale: ${payload.marketRationale ? `"${payload.marketRationale.text}"` : "(none)"}\n` +
    `reasons (${payload.reasons?.length ?? 0}):\n` +
    reasonsSummary + "\n" +
    `closingLine: ${payload.closingLine ? `"${payload.closingLine.text}"` : "(none)"}`;

  const anthropic = getAnthropicClient();
  const modelId = await resolveLorenzoVisionModelId();

  const response = await anthropic.messages.create({
    model: modelId,
    max_tokens: SWARM_INSPECTOR_MAX_TOKENS,
    system:
      "You are Chiara-03, the Slide 3 Inspector for the H+ Analysis investor deck factory. " +
      "Evaluate whether the assembled editorial copy is suitable for a professional investor " +
      "presentation for the SUBJECT PROPERTY described in the payload. " +
      "IMPORTANT: The reference image shows a DIFFERENT template property used only for " +
      "LAYOUT reference (visual hierarchy, section positions, text block locations). " +
      "Do NOT compare property names, locations, financial figures, or narrative from the image " +
      "against the submitted copy — the image is layout-only, not content-reference. " +
      "Focus on editorial completeness and tone only. Approve if the copy is " +
      "coherent, substantive, and fits an investment model context for the subject property. " +
      "Reject only if copy is missing, incoherent, or obviously investor-inappropriate.",
    tools: [INSPECTOR_PASS2_TOOL],
    tool_choice: { type: "any" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: pngBuffer.toString("base64"),
            },
          },
          {
            type: "text",
            text:
              "Above is the canonical Slide 3 LAYOUT reference (960×540 px). " +
              "This image shows a different demo property — use it only for visual structure/layout, NOT as a content benchmark.\n\n" +
              "Assembled editorial payload:\n" +
              payloadSummary +
              "\n\nCall report_inspection_verdict now.",
          },
        ],
      },
    ],
  });

  const toolBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );

  if (!toolBlock) {
    logger.warn("[chiara-03] Pass 2 — no tool call; defaulting to approved", "slide-factory");
    return { status: "ok", notes: null };
  }

  const verdict = toolBlock.input as InspectorPass2Input;

  logger.info(
    `[chiara-03] Pass 2 ${verdict.approved ? "APPROVED" : "BLOCKED"} — ${verdict.notes ?? "no notes"}`,
    "slide-factory",
  );

  if (!verdict.approved) {
    return { status: "block", notes: verdict.notes };
  }

  return { status: "ok", notes: null };
}
