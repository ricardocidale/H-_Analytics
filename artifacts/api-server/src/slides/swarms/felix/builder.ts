/**
 * Felix-02 — Builder.
 *
 * Slide 6 (10-year USALI Income Statement) content is fully deterministic.
 * The only authored slot is `disclaimer`, which is human-only (not drafted by
 * Lucca). Felix-02 reads any existing disclaimer draft from slotDrafts and
 * emits it verbatim. If none exists, it emits null and the payload is empty.
 *
 * Felix-02 takes SlideTeamInput directly — the expanded 5-member team
 * structure exists for data processing, not editorial drafting.
 */
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient } from "../../../ai/clients";
import { logger } from "../../../logger";
import type { SlideTeamInput } from "../types";
import type { Slide6Payload } from "@shared/deck-payload-v2";
import { SLIDE6_DISCLAIMER_MAX } from "@shared/deck-payload-v2";
import {
  SWARM_BUILDER_MODEL,
  SWARM_BUILDER_MAX_TOKENS,
} from "../../deck-render-constants";

// ── Tool schema ──────────────────────────────────────────────────────────────

interface EmitSlide6Input {
  disclaimer: string | null;
}

const EMIT_SLIDE6_TOOL: Anthropic.Tool = {
  name: "emit_slide6_payload",
  description:
    "Emit the assembled Slide 6 editorial payload. " +
    "The disclaimer is human-only — emit it verbatim from the slot draft if present. " +
    "If no draft exists, pass null.",
  input_schema: {
    type: "object",
    required: ["disclaimer"],
    properties: {
      disclaimer: {
        type: ["string", "null"],
        description: `Optional disclaimer text in the callout box. Max ${SLIDE6_DISCLAIMER_MAX} chars. Null if no draft.`,
      },
    },
  },
};

// ── System prompt ────────────────────────────────────────────────────────────

const FELIX_02_SYSTEM =
  "You are Felix-02, the Slide 6 Builder for the H+ Analytics investor deck factory.\n\n" +
  "Slide 6 is the 10-year USALI income statement aggregate. Content is fully " +
  "deterministic (the income statement table rows come from the financial engine). " +
  "The only authored slot is the optional disclaimer text in the callout box " +
  "at the bottom of the Key Investor Metrics panel, and it is human-only — " +
  "never drafted by an LLM.\n\n" +
  "Your only job is to call emit_slide6_payload with the disclaimer draft, " +
  "emitting it verbatim. If a disclaimer draft exists in the slot drafts, " +
  "emit it verbatim. If none exists, emit null. " +
  "DO NOT invent, rephrase, or improve copy.";

// ── Provenance builder ───────────────────────────────────────────────────────

function makeProvenance(source: "lucca" | "admin", approvedAt: string | null) {
  return {
    source: source === "admin" ? ("user" as const) : ("llm" as const),
    updatedAt: approvedAt ?? new Date().toISOString(),
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Run Felix-02: produce a Slide6Payload from the SlideTeamInput's slotDrafts.
 * Makes a single Anthropic Sonnet call with forced tool use.
 */
export async function runFelixBuilder(input: SlideTeamInput): Promise<Slide6Payload> {
  const anthropic = getAnthropicClient();

  const disclaimerDraft = input.slotDrafts["slide6.disclaimer"] ?? null;

  const draftSummary = `slide6.disclaimer: ${
    disclaimerDraft ? JSON.stringify(disclaimerDraft.value) : "(none)"
  }`;

  logger.info("[felix-02] building slide-6 payload", "slide-factory");

  const response = await anthropic.messages.create({
    model: SWARM_BUILDER_MODEL,
    max_tokens: SWARM_BUILDER_MAX_TOKENS,
    system: FELIX_02_SYSTEM,
    tools: [EMIT_SLIDE6_TOOL],
    tool_choice: { type: "any" },
    messages: [
      {
        role: "user",
        content:
          "Assemble the Slide 6 payload from the following slot drafts:\n\n" +
          draftSummary +
          "\n\nCall emit_slide6_payload now.",
      },
    ],
  });

  const toolBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolBlock) {
    throw new Error("Felix-02: no tool call returned from Builder LLM");
  }

  const { disclaimer } = toolBlock.input as EmitSlide6Input;

  const payload: Slide6Payload = {};

  if (disclaimer && disclaimerDraft) {
    payload.disclaimer = {
      text: disclaimer.slice(0, SLIDE6_DISCLAIMER_MAX),
      provenance: makeProvenance(disclaimerDraft.source, disclaimerDraft.approvedAt),
    };
  }

  logger.info(
    `[felix-02] payload built — disclaimer: ${payload.disclaimer ? "set" : "omitted"}`,
    "slide-factory",
  );

  return payload;
}
