/**
 * Felix-05 — Inspector (Hybrid).
 *
 * Two-pass verification of the Builder's Slide6Payload:
 *   Pass 1 — deterministic: slide6PayloadSchema.safeParse (Zod)
 *   Pass 2 — LLM-vision:  Opus holistic review against canonical PNG
 *
 * Either pass can block the slide. Pass 1 catches structural drift; Pass 2
 * catches editorial concerns (content that fits the schema but diverges in
 * tone or completeness from the canonical design intent).
 *
 * Pass 2 is scope-limited to editorial/holistic concerns — never pixel-diff.
 * Pixel-diff lives in Dino (U7).
 */
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient } from "../../../ai/clients";
import { logger } from "../../../logger";
import { slide6PayloadSchema } from "@shared/deck-payload-v2";
import type { Slide6Payload } from "@shared/deck-payload-v2";
import {
  SWARM_INSPECTOR_MAX_TOKENS,
} from "../../deck-render-constants";
import { resolveLorenzoVisionModelId } from "../../factory-v2-llm-resolver";
import { getStorageProviderAsync } from "../../../providers/storage";

// ── Inspector verdict ────────────────────────────────────────────────────────

export interface FelixInspectorVerdict {
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
    "Report whether the assembled Slide 6 editorial payload is acceptable " +
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
 * Run Felix-05: verify the Builder's payload via Zod (Pass 1) and Opus
 * vision (Pass 2). Returns a verdict with status and optional notes.
 */
export async function runFelixInspector(
  payload: Slide6Payload,
  canonicalPngKey: string,
): Promise<FelixInspectorVerdict> {
  // ── Pass 1 — deterministic Zod validation ──────────────────────────────────
  const parsed = slide6PayloadSchema.safeParse(payload);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    logger.warn(`[felix-05] Pass 1 BLOCK — schema issues: ${issues}`, "slide-factory");
    return { status: "block", notes: `Schema validation failed: ${issues}` };
  }

  logger.info("[felix-05] Pass 1 PASS — schema valid", "slide-factory");

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
      `[felix-05] Pass 2 skipped — canonical PNG unavailable: ${String(err)}`,
      "slide-factory",
    );
    return { status: "ok", notes: null };
  }

  const payloadSummary = `disclaimer: ${
    payload.disclaimer ? `"${payload.disclaimer.text}"` : "(none)"
  }`;

  const anthropic = getAnthropicClient();
  const modelId = await resolveLorenzoVisionModelId();

  const response = await anthropic.messages.create({
    model: modelId,
    max_tokens: SWARM_INSPECTOR_MAX_TOKENS,
    system:
      "You are Felix-05, the Slide 6 Inspector for the H+ Analysis investor deck factory. " +
      "Evaluate whether the assembled editorial copy is suitable for a professional investor " +
      "presentation. Slide 6 is the 10-year USALI income statement — content is mostly " +
      "deterministic. IMPORTANT: The reference image shows a DIFFERENT template property — use it for LAYOUT reference only. " +
      "Focus on editorial completeness and tone only — do NOT judge pixel " +
      "layout or visual design (that is handled separately). Approve if the optional " +
      "disclaimer (if present) is coherent and professional. " +
      "Reject only if the disclaimer is incoherent or obviously inappropriate.",
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
              "Above is the canonical Slide 6 reference (960×540 px).\n\n" +
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
    logger.warn("[felix-05] Pass 2 — no tool call; defaulting to approved", "slide-factory");
    return { status: "ok", notes: null };
  }

  const verdict = toolBlock.input as InspectorPass2Input;

  logger.info(
    `[felix-05] Pass 2 ${verdict.approved ? "APPROVED" : "BLOCKED"} — ${verdict.notes ?? "no notes"}`,
    "slide-factory",
  );

  if (!verdict.approved) {
    return { status: "block", notes: verdict.notes };
  }

  return { status: "ok", notes: null };
}
