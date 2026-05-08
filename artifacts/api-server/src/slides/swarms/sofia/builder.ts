/**
 * Sofia-02 — Builder.
 *
 * Single Sonnet call with forced tool use: maps Lucca-authored slot drafts
 * into the Slide1Payload schema. Builder is assemble-only — it never drafts
 * new copy. If a slot has no Lucca draft, the field is omitted (graceful
 * empty state per canonical-contract architecture).
 *
 * Serialization conventions (written by Lucca, read here):
 *   visionBullets  → "• text\n• text\n• text" (split on "\n• " or "• ")
 *   headerSubtitle → plain string
 */
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient } from "../../../ai/clients";
import { logger } from "../../../logger";
import type { SofiaReaderOutput } from "./reader";
import { makeProvenance } from "../provenance";
import type { Slide1Payload } from "@shared/deck-payload-v2";
import {
  SLIDE1_HEADER_SUBTITLE_MAX,
  SLIDE1_VISION_BULLET_MAX,
  SLIDE1_VISION_BULLETS_COUNT,
} from "@shared/deck-payload-v2";
import {
  SWARM_BUILDER_MODEL,
  SWARM_BUILDER_MAX_TOKENS,
} from "../../deck-render-constants";

// ── Tool schema ──────────────────────────────────────────────────────────────

interface EmitSlide1Input {
  headerSubtitle: string | null;
  visionBullets: string[] | null;
}

const EMIT_SLIDE1_TOOL: Anthropic.Tool = {
  name: "emit_slide1_payload",
  description:
    "Emit the assembled Slide 1 editorial payload. " +
    "Use only the Lucca-drafted text provided; never invent new copy. " +
    "Omit a field (pass null) if no draft exists for that slot.",
  input_schema: {
    type: "object",
    required: ["headerSubtitle", "visionBullets"],
    properties: {
      headerSubtitle: {
        type: ["string", "null"],
        description: `One-line location/concept tagline. Max ${SLIDE1_HEADER_SUBTITLE_MAX} chars. Null if no draft.`,
      },
      visionBullets: {
        type: ["array", "null"],
        description: `Exactly ${SLIDE1_VISION_BULLETS_COUNT} strategic bullets, each ≤ ${SLIDE1_VISION_BULLET_MAX} chars. Null if no draft.`,
        items: { type: "string" },
        minItems: SLIDE1_VISION_BULLETS_COUNT,
        maxItems: SLIDE1_VISION_BULLETS_COUNT,
      },
    },
  },
};

// ── System prompt ────────────────────────────────────────────────────────────

const SOFIA_02_SYSTEM =
  "You are Sofia-02, the Slide 1 Builder for the H+ Analytics investor deck factory.\n\n" +
  "Slide 1 is the Investment Spotlight — a single-property hero slide that opens the " +
  "L+B 6-slide investor deck. It features:\n" +
  "  • A one-line header subtitle (tagline for the property)\n" +
  "  • Three vision bullets (strategic investment thesis points)\n\n" +
  "Your only job is to call emit_slide1_payload with the Lucca-drafted text, " +
  "correctly parsed from the serialized format. " +
  "DO NOT invent, rephrase, or improve copy — emit it verbatim. " +
  "If a slot has no draft, pass null for that field.";

// ── Bullet serialization parser ──────────────────────────────────────────────

/**
 * Parse Lucca's bullet serialization ("• text\n• text\n• text") into an array
 * of plain strings. Strips leading "• " marker and trims whitespace.
 * Returns null if the input string is empty or cannot be parsed.
 */
function parseBullets(raw: string): string[] | null {
  const lines = raw
    .split("\n")
    .map((l) => l.replace(/^•\s*/, "").trim())
    .filter((l) => l.length > 0);
  return lines.length > 0 ? lines : null;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Run Sofia-02: produce a Slide1Payload from the Reader's assembled context.
 * Makes a single Anthropic Sonnet call with forced tool use.
 */
export async function runSofiaBuilder(
  readerOutput: SofiaReaderOutput,
): Promise<Slide1Payload> {
  const anthropic = getAnthropicClient();

  const { allDrafts, approvedDrafts } = readerOutput;
  const headerDraft =
    approvedDrafts["slide1.headerSubtitle"] ?? allDrafts["slide1.headerSubtitle"] ?? null;
  const bulletsDraft =
    approvedDrafts["slide1.visionBullets"] ?? allDrafts["slide1.visionBullets"] ?? null;

  const draftSummary =
    `slide1.headerSubtitle: ${headerDraft ? JSON.stringify(headerDraft.value) : "(none)"}\n` +
    `slide1.visionBullets: ${bulletsDraft ? JSON.stringify(bulletsDraft.value) : "(none)"}`;

  logger.info("[sofia-02] building slide-1 payload", "slide-factory");

  const response = await anthropic.messages.create({
    model: SWARM_BUILDER_MODEL,
    max_tokens: SWARM_BUILDER_MAX_TOKENS,
    system: SOFIA_02_SYSTEM,
    tools: [EMIT_SLIDE1_TOOL],
    tool_choice: { type: "any" },
    messages: [
      {
        role: "user",
        content:
          "Assemble the Slide 1 payload from the following Lucca slot drafts:\n\n" +
          draftSummary +
          "\n\nCall emit_slide1_payload now.",
      },
    ],
  });

  const toolBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolBlock) {
    throw new Error("Sofia-02: no tool call returned from Builder LLM");
  }

  const { headerSubtitle, visionBullets } = toolBlock.input as EmitSlide1Input;

  const payload: Slide1Payload = {};

  if (headerSubtitle && headerDraft) {
    payload.headerSubtitle = {
      text: headerSubtitle.slice(0, SLIDE1_HEADER_SUBTITLE_MAX),
      provenance: makeProvenance(headerDraft.source, headerDraft.approvedAt),
    };
  }

  if (visionBullets && bulletsDraft) {
    // Use Builder's parsed bullets, but fall back to our own parser for safety
    const bullets =
      visionBullets.length > 0 ? visionBullets : (parseBullets(bulletsDraft.value) ?? []);
    const prov = makeProvenance(bulletsDraft.source, bulletsDraft.approvedAt);
    payload.visionBullets = bullets
      .slice(0, SLIDE1_VISION_BULLETS_COUNT)
      .map((text) => ({
        text: text.slice(0, SLIDE1_VISION_BULLET_MAX),
        provenance: prov,
      }));
  } else if (!visionBullets && bulletsDraft) {
    // Builder returned null but we have a draft — parse ourselves
    const parsed = parseBullets(bulletsDraft.value);
    if (parsed) {
      const prov = makeProvenance(bulletsDraft.source, bulletsDraft.approvedAt);
      payload.visionBullets = parsed
        .slice(0, SLIDE1_VISION_BULLETS_COUNT)
        .map((text) => ({ text: text.slice(0, SLIDE1_VISION_BULLET_MAX), provenance: prov }));
    }
  }

  logger.info(
    `[sofia-02] payload built — headerSubtitle: ${payload.headerSubtitle ? "set" : "omitted"}, ` +
    `visionBullets: ${payload.visionBullets?.length ?? 0}`,
    "slide-factory",
  );

  return payload;
}
