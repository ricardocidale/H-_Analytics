/**
 * Dario-01 — Builder.
 *
 * Slide 4 (Portfolio Overview) content is fully deterministic — property cards,
 * city/state, purchase prices, and acquisition statuses all come from live DB
 * queries. The only authored slot is `sectionSubtitle`, which is human-only
 * (not drafted by Lucca).
 *
 * Since sectionSubtitle is human-only, Dario-01 simply reads any existing
 * sectionSubtitle draft from slotDrafts and emits it verbatim. If none exists,
 * it emits null and the payload comes back empty.
 *
 * Dario-01 takes SlideTeamInput directly — no Reader step (collapsed-to-2
 * exception).
 */
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient } from "../../../ai/clients";
import { logger } from "../../../logger";
import type { SlideTeamInput } from "../types";
import { makeProvenance } from "../provenance";
import type { Slide4Payload } from "@shared/deck-payload-v2";
import { SLIDE4_SECTION_SUBTITLE_MAX } from "@shared/deck-payload-v2";
import {
  SWARM_BUILDER_MODEL,
  SWARM_BUILDER_MAX_TOKENS,
} from "../../deck-render-constants";

// ── Tool schema ──────────────────────────────────────────────────────────────

interface EmitSlide4Input {
  sectionSubtitle: string | null;
}

const EMIT_SLIDE4_TOOL: Anthropic.Tool = {
  name: "emit_slide4_payload",
  description:
    "Emit the assembled Slide 4 editorial payload. " +
    "The sectionSubtitle is human-only — emit it verbatim from the slot draft if present. " +
    "If no draft exists, pass null.",
  input_schema: {
    type: "object",
    required: ["sectionSubtitle"],
    properties: {
      sectionSubtitle: {
        type: ["string", "null"],
        description: `Optional subtitle below "H+ Portfolio Overview". Max ${SLIDE4_SECTION_SUBTITLE_MAX} chars. Null if no draft.`,
      },
    },
  },
};

// ── System prompt ────────────────────────────────────────────────────────────

const DARIO_01_SYSTEM =
  "You are Dario-01, the Slide 4 Builder for the H+ Analytics investor deck factory.\n\n" +
  "Slide 4 is the Portfolio Overview — a grid of property cards. Content is fully " +
  "deterministic (property name, city/state, purchase price, acquisition status " +
  "come from live DB queries). The only authored slot is the optional sectionSubtitle " +
  "below the heading, and it is human-only — never drafted by an LLM.\n\n" +
  "Your only job is to call emit_slide4_payload with the sectionSubtitle draft, " +
  "emitting it verbatim. If a sectionSubtitle draft exists in the slot drafts, " +
  "emit it verbatim. If none exists, emit null. " +
  "DO NOT invent, rephrase, or improve copy.";

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Run Dario-01: produce a Slide4Payload from the SlideTeamInput's slotDrafts.
 * Makes a single Anthropic Sonnet call with forced tool use.
 */
export async function runDarioBuilder(input: SlideTeamInput): Promise<Slide4Payload> {
  const anthropic = getAnthropicClient();

  const subtitleDraft = input.slotDrafts["slide4.sectionSubtitle"] ?? null;

  const draftSummary = `slide4.sectionSubtitle: ${
    subtitleDraft ? JSON.stringify(subtitleDraft.value) : "(none)"
  }`;

  logger.info("[dario-01] building slide-4 payload", "slide-factory");

  const response = await anthropic.messages.create({
    model: SWARM_BUILDER_MODEL,
    max_tokens: SWARM_BUILDER_MAX_TOKENS,
    system: DARIO_01_SYSTEM,
    tools: [EMIT_SLIDE4_TOOL],
    tool_choice: { type: "any" },
    messages: [
      {
        role: "user",
        content:
          "Assemble the Slide 4 payload from the following slot drafts:\n\n" +
          draftSummary +
          "\n\nCall emit_slide4_payload now.",
      },
    ],
  });

  const toolBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolBlock) {
    throw new Error("Dario-01: no tool call returned from Builder LLM");
  }

  const { sectionSubtitle } = toolBlock.input as EmitSlide4Input;

  const payload: Slide4Payload = {};

  if (sectionSubtitle && subtitleDraft) {
    payload.sectionSubtitle = {
      text: sectionSubtitle.slice(0, SLIDE4_SECTION_SUBTITLE_MAX),
      provenance: makeProvenance(subtitleDraft.source, subtitleDraft.approvedAt),
    };
  }

  logger.info(
    `[dario-01] payload built — sectionSubtitle: ${payload.sectionSubtitle ? "set" : "omitted"}`,
    "slide-factory",
  );

  return payload;
}
