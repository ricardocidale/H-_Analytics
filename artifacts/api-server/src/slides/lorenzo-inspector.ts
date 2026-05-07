/**
 * Lorenzo-05 — Canonical Inspector.
 *
 * Holistic Opus 4.7 review after Lorenzo-03 enrichment and Carlo validation.
 * Loads all 6 canonical PNGs and the enriched blocksBySlide, then asks:
 * "Could a developer rebuild this deck from this spec alone?"
 *
 * Returns inspectorApproved (bool) and inspectorNotes (gap summary or null).
 * A rejection gates the run at "error" status rather than "ingested".
 */
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient } from "../ai/clients";
import { logger } from "../logger";
import type { LorenzoTextBlock } from "./canonical-spec-types";
import { CANONICAL_ASSETS } from "./canonical-assets";
import {
  LORENZO_VISION_MODEL,
  LORENZO_05_MAX_TOKENS,
  TOTAL_SLIDES,
} from "./deck-render-constants";
import { getStorageProviderAsync } from "../providers/storage";

// ── Tool schema ──────────────────────────────────────────────────────────────

interface InspectorVerdict {
  approved: boolean;
  notes: string | null;
}

const INSPECTOR_TOOL: Anthropic.Tool = {
  name: "report_inspection_verdict",
  description: "Report whether the canonical spec is complete enough to rebuild the deck.",
  input_schema: {
    type: "object",
    required: ["approved", "notes"],
    properties: {
      approved: { type: "boolean" },
      notes: {
        type: "string",
        nullable: true,
        description: "Null if approved. Gap description if rejected.",
      },
    },
  },
};

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Run Lorenzo-05 with all 6 slide PNGs and the enriched blocksBySlide.
 * Downloads PNGs from R2, assembles a single multi-image Opus call.
 */
export async function runLorenzoInspector(
  blocksBySlide: LorenzoTextBlock[][],
): Promise<InspectorVerdict> {
  const anthropic = getAnthropicClient();
  const storageProvider = await getStorageProviderAsync();

  logger.info("[lorenzo-05] starting holistic inspection", "slide-factory");

  // Build image content blocks for all slides
  const imageBlocks: Anthropic.Base64ImageSource[] = [];
  for (let i = 0; i < TOTAL_SLIDES; i++) {
    const { buffer } = await storageProvider.downloadBuffer(
      CANONICAL_ASSETS.slide(i + 1, "png"),
    );
    imageBlocks.push({
      type: "base64",
      media_type: "image/png",
      data: buffer.toString("base64"),
    });
  }

  // Compact spec summary — variable-binding slots only (inspecting coverage)
  const bindingSummary = blocksBySlide.flatMap((slide, si) =>
    slide
      .filter((b) => b.variableBinding !== null)
      .map((b) => `slide${si + 1} ${b.variableBinding}: "${b.text.slice(0, 40)}" ${b.fontName} ${b.fontSize}px`),
  ).join("\n");

  const content: Anthropic.MessageParam["content"] = [
    ...imageBlocks.map((src, i) => ({
      type: "image" as const,
      source: src,
    })),
    {
      type: "text" as const,
      text:
        "Above are slides 1–6 of a 6-slide investor deck (960×540 canvas).\n\n" +
        "Enriched spec — variable slots:\n" + bindingSummary + "\n\n" +
        "Question: Could a developer use only this spec to rebuild these slides " +
        "accurately (correct text, positions, fonts, colors)? " +
        "Approve if yes. Reject with specific gaps if critical information is missing.",
    },
  ];

  const response = await anthropic.messages.create({
    model: LORENZO_VISION_MODEL,
    max_tokens: LORENZO_05_MAX_TOKENS,
    system: "You are Lorenzo-05, a canonical spec inspector. Your only job is to decide if the spec is complete enough for rebuild.",
    messages: [{ role: "user", content }],
    tools: [INSPECTOR_TOOL],
    tool_choice: { type: "any" },
  });

  const toolBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );

  if (!toolBlock) {
    logger.warn("[lorenzo-05] no tool call — defaulting to approved", "slide-factory");
    return { approved: true, notes: null };
  }

  const verdict = toolBlock.input as InspectorVerdict;

  logger.info(
    `[lorenzo-05] verdict: ${verdict.approved ? "APPROVED" : "REJECTED"} — ${verdict.notes ?? "no notes"}`,
    "slide-factory",
  );

  return verdict;
}
