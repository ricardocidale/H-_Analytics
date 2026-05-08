/**
 * Chiara-02 — Builder.
 *
 * Single Sonnet call with forced tool use: maps Lucca-authored slot drafts
 * into the Slide3Payload schema. Builder is assemble-only — it never drafts
 * new copy. If a slot has no Lucca draft, the field is omitted (graceful
 * empty state per canonical-contract architecture).
 *
 * Serialization conventions (written by Lucca, read here):
 *   conceptParagraph  → plain string
 *   marketRationale   → plain string
 *   reasons           → JSON array: '[{"label":"...","detail":"..."},...]'
 *   closingLine       → plain string
 *
 * interiorPhotoUrl is human-only — Chiara never processes it.
 */
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient } from "../../../ai/clients";
import { logger } from "../../../logger";
import type { ChiaraReaderOutput } from "./reader";
import { makeProvenance } from "../provenance";
import type { Slide3Payload } from "@shared/deck-payload-v2";
import {
  SLIDE3_CONCEPT_PARAGRAPH_MAX,
  SLIDE3_MARKET_RATIONALE_MAX,
  SLIDE3_REASON_LABEL_MAX,
  SLIDE3_REASON_DETAIL_MAX,
  SLIDE3_REASONS_COUNT,
  SLIDE3_CLOSING_LINE_MAX,
} from "@shared/deck-payload-v2";
import {
  SWARM_BUILDER_MODEL,
  SWARM_BUILDER_MAX_TOKENS,
} from "../../deck-render-constants";

// ── Tool schema ──────────────────────────────────────────────────────────────

interface ReasonInput {
  label: string;
  detail: string;
}

interface EmitSlide3Input {
  conceptParagraph: string | null;
  marketRationale: string | null;
  reasons: ReasonInput[] | null;
  closingLine: string | null;
}

const EMIT_SLIDE3_TOOL: Anthropic.Tool = {
  name: "emit_slide3_payload",
  description:
    "Emit the assembled Slide 3 editorial payload. " +
    "Use only the Lucca-drafted text provided; never invent new copy. " +
    "Omit a field (pass null) if no draft exists for that slot.",
  input_schema: {
    type: "object",
    required: ["conceptParagraph", "marketRationale", "reasons", "closingLine"],
    properties: {
      conceptParagraph: {
        type: ["string", "null"],
        description: `"The Concept" narrative paragraph. Max ${SLIDE3_CONCEPT_PARAGRAPH_MAX} chars. Null if no draft.`,
      },
      marketRationale: {
        type: ["string", "null"],
        description: `"Why This Property?" narrative paragraph. Max ${SLIDE3_MARKET_RATIONALE_MAX} chars. Null if no draft.`,
      },
      reasons: {
        type: ["array", "null"],
        description: `Up to ${SLIDE3_REASONS_COUNT} strategic reason/detail pairs. Null if no draft.`,
        items: {
          type: "object",
          required: ["label", "detail"],
          properties: {
            label: {
              type: "string",
              description: `Bold label for the reason. Max ${SLIDE3_REASON_LABEL_MAX} chars.`,
            },
            detail: {
              type: "string",
              description: `Detail text for the reason. Max ${SLIDE3_REASON_DETAIL_MAX} chars.`,
            },
          },
        },
        maxItems: SLIDE3_REASONS_COUNT,
      },
      closingLine: {
        type: ["string", "null"],
        description: `Closing pull quote in the accent block. Max ${SLIDE3_CLOSING_LINE_MAX} chars. Null if no draft.`,
      },
    },
  },
};

// ── System prompt ────────────────────────────────────────────────────────────

const CHIARA_02_SYSTEM =
  "You are Chiara-02, the Slide 3 Builder for the H+ Analytics investor deck factory.\n\n" +
  "Slide 3 is the Investment Model slide for the San Diego / Cartagena Duplex property " +
  "(Barrio San Diego, Cartagena, Colombia). It features a 4-zone horizontal layout with:\n" +
  "  • A concept card — 'The Concept' narrative paragraph\n" +
  "  • A strategic details card — 'Why This Property?' narrative paragraph\n" +
  "  • A 'Why This Model?' card — three reason/detail pairs (bold label + detail text)\n" +
  "  • A closing pull quote in the accent block\n\n" +
  "Your only job is to call emit_slide3_payload with the Lucca-drafted text, " +
  "correctly parsed from the serialized format. " +
  "DO NOT invent, rephrase, or improve copy — emit it verbatim. " +
  "If a slot has no draft, pass null for that field. " +
  "For reasons: parse the JSON array from the Lucca draft and emit each label/detail pair.";

// ── Reasons serialization parser ─────────────────────────────────────────────

/**
 * Parse Lucca's reasons serialization ('[{"label":"...","detail":"..."},...]')
 * into an array of {label, detail} objects.
 * Returns null if the input string is empty, invalid JSON, or wrong shape.
 */
function parseReasons(raw: string): ReasonInput[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const result: ReasonInput[] = [];
    for (const item of parsed) {
      if (
        item !== null &&
        typeof item === "object" &&
        typeof (item as Record<string, unknown>)["label"] === "string" &&
        typeof (item as Record<string, unknown>)["detail"] === "string"
      ) {
        result.push({
          label: (item as Record<string, unknown>)["label"] as string,
          detail: (item as Record<string, unknown>)["detail"] as string,
        });
      }
    }
    return result.length > 0 ? result : null;
  } catch {
    return null;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Run Chiara-02: produce a Slide3Payload from the Reader's assembled context.
 * Makes a single Anthropic Sonnet call with forced tool use.
 */
export async function runChiaraBuilder(
  readerOutput: ChiaraReaderOutput,
): Promise<Slide3Payload> {
  const anthropic = getAnthropicClient();

  const { allDrafts, approvedDrafts } = readerOutput;
  const conceptDraft =
    approvedDrafts["slide3.conceptParagraph"] ?? allDrafts["slide3.conceptParagraph"] ?? null;
  const rationaleDraft =
    approvedDrafts["slide3.marketRationale"] ?? allDrafts["slide3.marketRationale"] ?? null;
  const reasonsDraft =
    approvedDrafts["slide3.reasons"] ?? allDrafts["slide3.reasons"] ?? null;
  const closingDraft =
    approvedDrafts["slide3.closingLine"] ?? allDrafts["slide3.closingLine"] ?? null;

  const draftSummary =
    `slide3.conceptParagraph: ${conceptDraft ? JSON.stringify(conceptDraft.value) : "(none)"}\n` +
    `slide3.marketRationale: ${rationaleDraft ? JSON.stringify(rationaleDraft.value) : "(none)"}\n` +
    `slide3.reasons: ${reasonsDraft ? reasonsDraft.value : "(none)"}\n` +
    `slide3.closingLine: ${closingDraft ? JSON.stringify(closingDraft.value) : "(none)"}`;

  logger.info("[chiara-02] building slide-3 payload", "slide-factory");

  const response = await anthropic.messages.create({
    model: SWARM_BUILDER_MODEL,
    max_tokens: SWARM_BUILDER_MAX_TOKENS,
    system: CHIARA_02_SYSTEM,
    tools: [EMIT_SLIDE3_TOOL],
    tool_choice: { type: "any" },
    messages: [
      {
        role: "user",
        content:
          "Assemble the Slide 3 payload from the following Lucca slot drafts:\n\n" +
          draftSummary +
          "\n\nCall emit_slide3_payload now.",
      },
    ],
  });

  const toolBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolBlock) {
    throw new Error("Chiara-02: no tool call returned from Builder LLM");
  }

  const { conceptParagraph, marketRationale, reasons, closingLine } =
    toolBlock.input as EmitSlide3Input;

  const payload: Slide3Payload = {};

  if (conceptParagraph && conceptDraft) {
    payload.conceptParagraph = {
      text: conceptParagraph.slice(0, SLIDE3_CONCEPT_PARAGRAPH_MAX),
      provenance: makeProvenance(conceptDraft.source, conceptDraft.approvedAt),
    };
  }

  if (marketRationale && rationaleDraft) {
    payload.marketRationale = {
      text: marketRationale.slice(0, SLIDE3_MARKET_RATIONALE_MAX),
      provenance: makeProvenance(rationaleDraft.source, rationaleDraft.approvedAt),
    };
  }

  if (reasons && reasonsDraft) {
    // Use Builder's parsed reasons
    const prov = makeProvenance(reasonsDraft.source, reasonsDraft.approvedAt);
    payload.reasons = reasons
      .slice(0, SLIDE3_REASONS_COUNT)
      .map((r) => ({
        label: {
          text: r.label.slice(0, SLIDE3_REASON_LABEL_MAX),
          provenance: prov,
        },
        detail: {
          text: r.detail.slice(0, SLIDE3_REASON_DETAIL_MAX),
          provenance: prov,
        },
      }));
  } else if (!reasons && reasonsDraft) {
    // Builder returned null but we have a draft — parse ourselves
    const parsed = parseReasons(reasonsDraft.value);
    if (parsed) {
      const prov = makeProvenance(reasonsDraft.source, reasonsDraft.approvedAt);
      payload.reasons = parsed
        .slice(0, SLIDE3_REASONS_COUNT)
        .map((r) => ({
          label: {
            text: r.label.slice(0, SLIDE3_REASON_LABEL_MAX),
            provenance: prov,
          },
          detail: {
            text: r.detail.slice(0, SLIDE3_REASON_DETAIL_MAX),
            provenance: prov,
          },
        }));
    }
  }

  if (closingLine && closingDraft) {
    payload.closingLine = {
      text: closingLine.slice(0, SLIDE3_CLOSING_LINE_MAX),
      provenance: makeProvenance(closingDraft.source, closingDraft.approvedAt),
    };
  }

  logger.info(
    `[chiara-02] payload built — conceptParagraph: ${payload.conceptParagraph ? "set" : "omitted"}, ` +
    `marketRationale: ${payload.marketRationale ? "set" : "omitted"}, ` +
    `reasons: ${payload.reasons?.length ?? 0}, ` +
    `closingLine: ${payload.closingLine ? "set" : "omitted"}`,
    "slide-factory",
  );

  return payload;
}
