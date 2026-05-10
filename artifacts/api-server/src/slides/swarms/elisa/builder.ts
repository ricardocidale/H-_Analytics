/**
 * Elisa-02 — Builder.
 *
 * Single Sonnet call with forced tool use: maps Lucca-authored slot drafts
 * into the Slide5Payload schema. Builder is assemble-only — it never drafts
 * new copy. If a slot has no Lucca draft, the field is omitted (graceful
 * empty state per canonical-contract architecture).
 *
 * Serialization conventions (written by Lucca, read here):
 *   transformationDescription → plain string
 *   transformationRows        → JSON array: '[{"feature":"...","existing":"...","proposed":"..."},...]'
 */
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient } from "../../../ai/clients";
import { logger } from "../../../logger";
import type { ElisaReaderOutput } from "./reader";
import { makeProvenance } from "../provenance";
import type { Slide5Payload } from "@shared/deck-payload-v2";
import {
  SLIDE5_TRANSFORMATION_DESCRIPTION_MAX,
  SLIDE5_TRANSFORMATION_ROW_FEATURE_MAX,
  SLIDE5_TRANSFORMATION_ROW_EXISTING_MAX,
  SLIDE5_TRANSFORMATION_ROW_PROPOSED_MAX,
  SLIDE5_TRANSFORMATION_ROWS_COUNT,
} from "@shared/deck-payload-v2";
import {
  SWARM_BUILDER_MODEL,
  SWARM_BUILDER_MAX_TOKENS,
} from "../../deck-render-constants";

// ── Tool schema ──────────────────────────────────────────────────────────────

interface TransformationRow {
  feature: string;
  existing: string;
  proposed: string;
}

interface EmitSlide5Input {
  transformationDescription: string | null;
  transformationRows: TransformationRow[] | null;
}

const EMIT_SLIDE5_TOOL: Anthropic.Tool = {
  name: "emit_slide5_payload",
  description:
    "Emit the assembled Slide 5 editorial payload. " +
    "Use only the Lucca-drafted text provided; never invent new copy. " +
    "Omit a field (pass null) if no draft exists for that slot.",
  input_schema: {
    type: "object",
    required: ["transformationDescription", "transformationRows"],
    properties: {
      transformationDescription: {
        type: ["string", "null"],
        description: `Intro paragraph above the comparison table. Max ${SLIDE5_TRANSFORMATION_DESCRIPTION_MAX} chars. Null if no draft.`,
      },
      transformationRows: {
        type: ["array", "null"],
        description:
          `Up to ${SLIDE5_TRANSFORMATION_ROWS_COUNT} before/after comparison rows. ` +
          `Each row has feature (max ${SLIDE5_TRANSFORMATION_ROW_FEATURE_MAX} chars), ` +
          `existing (max ${SLIDE5_TRANSFORMATION_ROW_EXISTING_MAX} chars), ` +
          `proposed (max ${SLIDE5_TRANSFORMATION_ROW_PROPOSED_MAX} chars). Null if no draft.`,
        items: {
          type: "object",
          required: ["feature", "existing", "proposed"],
          properties: {
            feature: { type: "string" },
            existing: { type: "string" },
            proposed: { type: "string" },
          },
        },
        maxItems: SLIDE5_TRANSFORMATION_ROWS_COUNT,
      },
    },
  },
};

// ── System prompt ────────────────────────────────────────────────────────────

const ELISA_02_SYSTEM =
  "You are Elisa-02, the Slide 5 Builder for the H+ Analysis investor deck factory.\n\n" +
  "Slide 5 is the Transformation Plan slide — it features an intro paragraph describing " +
  "the investment thesis and a 4-row before/after comparison table " +
  "(Feature | Existing | Proposed). Content is portfolio-level transformation " +
  "narrative, not property-specific.\n\n" +
  "Your only job is to call emit_slide5_payload with the Lucca-drafted text, " +
  "correctly parsed from the serialized format. " +
  "DO NOT invent, rephrase, or improve copy — emit it verbatim. " +
  "If a slot has no draft, pass null for that field.";

// ── Row serialization parser ─────────────────────────────────────────────────

/**
 * Parse Lucca's transformationRows serialization (JSON array string) into an
 * array of row objects. Returns null if the input is empty or cannot be parsed.
 */
function parseRows(raw: string): TransformationRow[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return null;
    }
    const rows: TransformationRow[] = [];
    for (const item of parsed) {
      if (
        item !== null &&
        typeof item === "object" &&
        typeof (item as Record<string, unknown>).feature === "string" &&
        typeof (item as Record<string, unknown>).existing === "string" &&
        typeof (item as Record<string, unknown>).proposed === "string"
      ) {
        rows.push({
          feature: (item as TransformationRow).feature,
          existing: (item as TransformationRow).existing,
          proposed: (item as TransformationRow).proposed,
        });
      }
    }
    return rows.length > 0 ? rows : null;
  } catch {
    return null;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Run Elisa-02: produce a Slide5Payload from the Reader's assembled context.
 * Makes a single Anthropic Sonnet call with forced tool use.
 */
export async function runElisaBuilder(
  readerOutput: ElisaReaderOutput,
): Promise<Slide5Payload> {
  const anthropic = getAnthropicClient();

  const { allDrafts, approvedDrafts } = readerOutput;
  const descriptionDraft =
    approvedDrafts["slide5.transformationDescription"] ??
    allDrafts["slide5.transformationDescription"] ??
    null;
  const rowsDraft =
    approvedDrafts["slide5.transformationRows"] ??
    allDrafts["slide5.transformationRows"] ??
    null;

  const draftSummary =
    `slide5.transformationDescription: ${descriptionDraft ? JSON.stringify(descriptionDraft.value) : "(none)"}\n` +
    `slide5.transformationRows: ${rowsDraft ? JSON.stringify(rowsDraft.value) : "(none)"}`;

  logger.info("[elisa-02] building slide-5 payload", "slide-factory");

  const response = await anthropic.messages.create({
    model: SWARM_BUILDER_MODEL,
    max_tokens: SWARM_BUILDER_MAX_TOKENS,
    system: ELISA_02_SYSTEM,
    tools: [EMIT_SLIDE5_TOOL],
    tool_choice: { type: "any" },
    messages: [
      {
        role: "user",
        content:
          "Assemble the Slide 5 payload from the following Lucca slot drafts:\n\n" +
          draftSummary +
          "\n\nCall emit_slide5_payload now.",
      },
    ],
  });

  const toolBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolBlock) {
    throw new Error("Elisa-02: no tool call returned from Builder LLM");
  }

  const { transformationDescription, transformationRows } =
    toolBlock.input as EmitSlide5Input;

  const payload: Slide5Payload = {};

  if (transformationDescription && descriptionDraft) {
    payload.transformationDescription = {
      text: transformationDescription.slice(0, SLIDE5_TRANSFORMATION_DESCRIPTION_MAX),
      provenance: makeProvenance(descriptionDraft.source, descriptionDraft.approvedAt),
    };
  }

  if (transformationRows && transformationRows.length > 0 && rowsDraft) {
    const prov = makeProvenance(rowsDraft.source, rowsDraft.approvedAt);
    payload.transformationRows = transformationRows
      .slice(0, SLIDE5_TRANSFORMATION_ROWS_COUNT)
      .map((row) => ({
        feature: {
          text: row.feature.slice(0, SLIDE5_TRANSFORMATION_ROW_FEATURE_MAX),
          provenance: prov,
        },
        existing: {
          text: row.existing.slice(0, SLIDE5_TRANSFORMATION_ROW_EXISTING_MAX),
          provenance: prov,
        },
        proposed: {
          text: row.proposed.slice(0, SLIDE5_TRANSFORMATION_ROW_PROPOSED_MAX),
          provenance: prov,
        },
      }));
  } else if (!transformationRows && rowsDraft) {
    // Builder returned null but we have a draft — parse ourselves
    const parsed = parseRows(rowsDraft.value);
    if (parsed) {
      const prov = makeProvenance(rowsDraft.source, rowsDraft.approvedAt);
      payload.transformationRows = parsed
        .slice(0, SLIDE5_TRANSFORMATION_ROWS_COUNT)
        .map((row) => ({
          feature: {
            text: row.feature.slice(0, SLIDE5_TRANSFORMATION_ROW_FEATURE_MAX),
            provenance: prov,
          },
          existing: {
            text: row.existing.slice(0, SLIDE5_TRANSFORMATION_ROW_EXISTING_MAX),
            provenance: prov,
          },
          proposed: {
            text: row.proposed.slice(0, SLIDE5_TRANSFORMATION_ROW_PROPOSED_MAX),
            provenance: prov,
          },
        }));
    }
  }

  logger.info(
    `[elisa-02] payload built — transformationDescription: ${payload.transformationDescription ? "set" : "omitted"}, ` +
    `transformationRows: ${payload.transformationRows?.length ?? 0}`,
    "slide-factory",
  );

  return payload;
}
