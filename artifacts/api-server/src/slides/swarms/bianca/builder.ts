/**
 * Bianca-02 — Builder.
 *
 * Single Sonnet call with forced tool use: maps Lucca-authored slot drafts
 * into the Slide2Payload schema. Builder is assemble-only — it never drafts
 * new copy. If a slot has no Lucca draft, the field is omitted (graceful
 * empty state per canonical-contract architecture).
 *
 * Slide 2 is the Alt View / Photo Gallery slide for Loch Sheldrake /
 * Hazelnis Retreat (Sullivan County NY, Western Catskills). It features a
 * 2×2 photo grid on the left and editorial text on the right. All three
 * text slots are plain strings (no bullet serialization needed).
 */
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient } from "../../../ai/clients";
import { logger } from "../../../logger";
import type { BiancaReaderOutput } from "./reader";
import type { Slide2Payload } from "@shared/deck-payload-v2";
import {
  SLIDE2_OPERATIONAL_MODEL_MAX,
  SLIDE2_REVENUE_BULLET_MAX,
  SLIDE2_PROGRAMMING_BULLET_MAX,
} from "@shared/deck-payload-v2";
import {
  SWARM_BUILDER_MODEL,
  SWARM_BUILDER_MAX_TOKENS,
} from "../../deck-render-constants";

// ── Tool schema ──────────────────────────────────────────────────────────────

interface EmitSlide2Input {
  operationalModelText: string | null;
  revenueBullet: string | null;
  programmingBullet: string | null;
}

const EMIT_SLIDE2_TOOL: Anthropic.Tool = {
  name: "emit_slide2_payload",
  description:
    "Emit the assembled Slide 2 editorial payload. " +
    "Use only the Lucca-drafted text provided; never invent new copy. " +
    "Omit a field (pass null) if no draft exists for that slot.",
  input_schema: {
    type: "object",
    required: ["operationalModelText", "revenueBullet", "programmingBullet"],
    properties: {
      operationalModelText: {
        type: ["string", "null"],
        description: `"Operational Model: …" italic serif line. Max ${SLIDE2_OPERATIONAL_MODEL_MAX} chars. Null if no draft.`,
      },
      revenueBullet: {
        type: ["string", "null"],
        description: `Revenue / rate strategy bullet. Max ${SLIDE2_REVENUE_BULLET_MAX} chars. Null if no draft.`,
      },
      programmingBullet: {
        type: ["string", "null"],
        description: `Programming / amenity strategy bullet. Max ${SLIDE2_PROGRAMMING_BULLET_MAX} chars. Null if no draft.`,
      },
    },
  },
};

// ── System prompt ────────────────────────────────────────────────────────────

const BIANCA_02_SYSTEM =
  "You are Bianca-02, the Slide 2 Builder for the H+ Analytics investor deck factory.\n\n" +
  "Slide 2 is the Alt View / Photo Gallery — a secondary property showcase for Hazelnis " +
  "Retreat / Loch Sheldrake (Sullivan County NY, Western Catskills). It features a 2×2 " +
  "photo grid on the left and editorial text on the right. The three text slots cover:\n" +
  "  • An operational model label (italic serif intro line)\n" +
  "  • A revenue / rate strategy bullet\n" +
  "  • A programming / amenity strategy bullet\n\n" +
  "Your only job is to call emit_slide2_payload with the Lucca-drafted text. " +
  "DO NOT invent, rephrase, or improve copy — emit it verbatim. " +
  "If a slot has no draft, pass null for that field.";

// ── Provenance builder ───────────────────────────────────────────────────────

function makeProvenance(source: "lucca" | "admin", approvedAt: string | null) {
  return {
    source: source === "admin" ? ("user" as const) : ("llm" as const),
    updatedAt: approvedAt ?? new Date().toISOString(),
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Run Bianca-02: produce a Slide2Payload from the Reader's assembled context.
 * Makes a single Anthropic Sonnet call with forced tool use.
 */
export async function runBiancaBuilder(
  readerOutput: BiancaReaderOutput,
): Promise<Slide2Payload> {
  const anthropic = getAnthropicClient();

  const { allDrafts, approvedDrafts } = readerOutput;

  const opDraft =
    approvedDrafts["slide2.operationalModelText"] ??
    allDrafts["slide2.operationalModelText"] ??
    null;
  const revDraft =
    approvedDrafts["slide2.revenueBullet"] ??
    allDrafts["slide2.revenueBullet"] ??
    null;
  const progDraft =
    approvedDrafts["slide2.programmingBullet"] ??
    allDrafts["slide2.programmingBullet"] ??
    null;

  const draftSummary =
    `slide2.operationalModelText: ${opDraft ? JSON.stringify(opDraft.value) : "(none)"}\n` +
    `slide2.revenueBullet: ${revDraft ? JSON.stringify(revDraft.value) : "(none)"}\n` +
    `slide2.programmingBullet: ${progDraft ? JSON.stringify(progDraft.value) : "(none)"}`;

  logger.info("[bianca-02] building slide-2 payload", "slide-factory");

  const response = await anthropic.messages.create({
    model: SWARM_BUILDER_MODEL,
    max_tokens: SWARM_BUILDER_MAX_TOKENS,
    system: BIANCA_02_SYSTEM,
    tools: [EMIT_SLIDE2_TOOL],
    tool_choice: { type: "any" },
    messages: [
      {
        role: "user",
        content:
          "Assemble the Slide 2 payload from the following Lucca slot drafts:\n\n" +
          draftSummary +
          "\n\nCall emit_slide2_payload now.",
      },
    ],
  });

  const toolBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolBlock) {
    throw new Error("Bianca-02: no tool call returned from Builder LLM");
  }

  const { operationalModelText, revenueBullet, programmingBullet } =
    toolBlock.input as EmitSlide2Input;

  const payload: Slide2Payload = {};

  if (operationalModelText && opDraft) {
    payload.operationalModelText = {
      text: operationalModelText.slice(0, SLIDE2_OPERATIONAL_MODEL_MAX),
      provenance: makeProvenance(opDraft.source, opDraft.approvedAt),
    };
  }

  if (revenueBullet && revDraft) {
    payload.revenueBullet = {
      text: revenueBullet.slice(0, SLIDE2_REVENUE_BULLET_MAX),
      provenance: makeProvenance(revDraft.source, revDraft.approvedAt),
    };
  }

  if (programmingBullet && progDraft) {
    payload.programmingBullet = {
      text: programmingBullet.slice(0, SLIDE2_PROGRAMMING_BULLET_MAX),
      provenance: makeProvenance(progDraft.source, progDraft.approvedAt),
    };
  }

  logger.info(
    `[bianca-02] payload built — ` +
      `operationalModelText: ${payload.operationalModelText ? "set" : "omitted"}, ` +
      `revenueBullet: ${payload.revenueBullet ? "set" : "omitted"}, ` +
      `programmingBullet: ${payload.programmingBullet ? "set" : "omitted"}`,
    "slide-factory",
  );

  return payload;
}
