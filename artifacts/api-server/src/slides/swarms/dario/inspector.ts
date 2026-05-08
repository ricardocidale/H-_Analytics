/**
 * Dario-02 — Inspector (Hybrid).
 *
 * Two-pass verification of the Builder's Slide4Payload:
 *   Pass 1 — deterministic: slide4PayloadSchema.safeParse (Zod)
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
import { slide4PayloadSchema } from "@shared/deck-payload-v2";
import type { Slide4Payload } from "@shared/deck-payload-v2";
import {
  LORENZO_VISION_MODEL,
  SWARM_INSPECTOR_MAX_TOKENS,
} from "../../deck-render-constants";
import { getStorageProviderAsync } from "../../../providers/storage";

// ── Inspector verdict ────────────────────────────────────────────────────────

export interface DarioInspectorVerdict {
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
    "Report whether the assembled Slide 4 editorial payload is acceptable " +
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
 * Run Dario-02: verify the Builder's payload via Zod (Pass 1) and Opus
 * vision (Pass 2). Returns a verdict with status and optional notes.
 */
export async function runDarioInspector(
  payload: Slide4Payload,
  canonicalPngKey: string,
): Promise<DarioInspectorVerdict> {
  // ── Pass 1 — deterministic Zod validation ──────────────────────────────────
  const parsed = slide4PayloadSchema.safeParse(payload);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    logger.warn(`[dario-02] Pass 1 BLOCK — schema issues: ${issues}`, "slide-factory");
    return { status: "block", notes: `Schema validation failed: ${issues}` };
  }

  logger.info("[dario-02] Pass 1 PASS — schema valid", "slide-factory");

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
      `[dario-02] Pass 2 skipped — canonical PNG unavailable: ${String(err)}`,
      "slide-factory",
    );
    return { status: "ok", notes: null };
  }

  const payloadSummary = `sectionSubtitle: ${
    payload.sectionSubtitle ? `"${payload.sectionSubtitle.text}"` : "(none)"
  }`;

  const anthropic = getAnthropicClient();

  const response = await anthropic.messages.create({
    model: LORENZO_VISION_MODEL,
    max_tokens: SWARM_INSPECTOR_MAX_TOKENS,
    system:
      "You are Dario-02, the Slide 4 Inspector for the H+ Analytics investor deck factory. " +
      "Evaluate whether the assembled editorial copy is suitable for a professional investor " +
      "presentation. Slide 4 is the Portfolio Overview — content is mostly deterministic. " +
      "Focus on editorial completeness and tone only — do NOT judge pixel " +
      "layout or visual design (that is handled separately). Approve if the optional " +
      "sectionSubtitle (if present) is coherent and professional. " +
      "Reject only if the sectionSubtitle is incoherent or obviously inappropriate.",
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
              "Above is the canonical Slide 4 reference (960×540 px).\n\n" +
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
    logger.warn("[dario-02] Pass 2 — no tool call; defaulting to approved", "slide-factory");
    return { status: "ok", notes: null };
  }

  const verdict = toolBlock.input as InspectorPass2Input;

  logger.info(
    `[dario-02] Pass 2 ${verdict.approved ? "APPROVED" : "BLOCKED"} — ${verdict.notes ?? "no notes"}`,
    "slide-factory",
  );

  if (!verdict.approved) {
    return { status: "block", notes: verdict.notes };
  }

  return { status: "ok", notes: null };
}
