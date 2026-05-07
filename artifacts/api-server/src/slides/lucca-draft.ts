/**
 * Lucca draft pipeline — Unit 4b real implementation.
 *
 * Status flow: drafting → draft_review (or error).
 *
 * Makes four Opus calls (one per batch group — vision, operational,
 * investment, transformation), validates each structured tool output
 * against character-limit constants BEFORE serializing to string,
 * then writes all 15 luccaDraft slot keys to the run row.
 *
 * Serialization conventions (readable, parseable by downstream agents):
 *   bullets   → "• text\n• text\n• text"
 *   reasons   → "Label: detail\n\nLabel: detail"
 *   rows      → "feature | existing | proposed\n..."
 */
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../logger";
import { getSlideFactoryRunById, updateSlideFactoryRun } from "../storage/slide-factory-runs";
import type { LuccaSlotDraft } from "../storage/slide-factory-runs";
import { storage } from "../storage";
import { getAnthropicClient } from "../ai/clients";
import { buildPropertyBrief, briefToPromptLines } from "./property-brief";
import { getGroupBriefFields } from "./slot-context-map";
import type { SlotBatchGroup } from "./slot-context-map";
import { validateSlotOutput } from "./slot-output-validator";
import type { SlideProperty } from "./types";
import { DEFAULT_FALLBACK_OCCUPANCY } from "@shared/constants-benchmarks";
import { LUCCA_DRAFT_MODEL, LUCCA_MAX_TOKENS } from "./deck-render-constants";
import {
  SLIDE1_HEADER_SUBTITLE_MAX,
  SLIDE1_VISION_BULLET_MAX,
  SLIDE1_VISION_BULLETS_COUNT,
  SLIDE2_OPERATIONAL_MODEL_MAX,
  SLIDE2_REVENUE_BULLET_MAX,
  SLIDE2_PROGRAMMING_BULLET_MAX,
  SLIDE3_CONCEPT_PARAGRAPH_MAX,
  SLIDE3_MARKET_RATIONALE_MAX,
  SLIDE3_REASON_LABEL_MAX,
  SLIDE3_REASON_DETAIL_MAX,
  SLIDE3_REASONS_COUNT,
  SLIDE3_CLOSING_LINE_MAX,
  SLIDE5_TRANSFORMATION_DESCRIPTION_MAX,
  SLIDE5_TRANSFORMATION_ROW_FEATURE_MAX,
  SLIDE5_TRANSFORMATION_ROW_EXISTING_MAX,
  SLIDE5_TRANSFORMATION_ROW_PROPOSED_MAX,
  SLIDE5_TRANSFORMATION_ROWS_COUNT,
} from "@shared/deck-payload-v2";

// ── Tool schemas ─────────────────────────────────────────────────────────────

const VISION_TOOL: Anthropic.Tool = {
  name: "draft_vision",
  description: "Draft Slide 1 vision copy: a header subtitle and three vision bullets.",
  input_schema: {
    type: "object",
    required: ["headerSubtitle", "visionBullets"],
    properties: {
      headerSubtitle: {
        type: "object",
        required: ["text"],
        properties: {
          text: {
            type: "string",
            maxLength: SLIDE1_HEADER_SUBTITLE_MAX,
            description: `One-line location/concept tagline. Max ${SLIDE1_HEADER_SUBTITLE_MAX} chars.`,
          },
        },
      },
      visionBullets: {
        type: "object",
        required: ["bullets"],
        properties: {
          bullets: {
            type: "array",
            minItems: SLIDE1_VISION_BULLETS_COUNT,
            maxItems: SLIDE1_VISION_BULLETS_COUNT,
            items: {
              type: "object",
              required: ["text"],
              properties: {
                text: {
                  type: "string",
                  maxLength: SLIDE1_VISION_BULLET_MAX,
                  description: `Single investor-facing vision bullet. Max ${SLIDE1_VISION_BULLET_MAX} chars.`,
                },
              },
            },
          },
        },
      },
    },
  },
};

const OPERATIONAL_TOOL: Anthropic.Tool = {
  name: "draft_operational",
  description: "Draft Slide 2 operational copy: operational model text, revenue bullet, programming bullet.",
  input_schema: {
    type: "object",
    required: ["operationalModelText", "revenueBullet", "programmingBullet"],
    properties: {
      operationalModelText: {
        type: "object",
        required: ["text"],
        properties: {
          text: {
            type: "string",
            maxLength: SLIDE2_OPERATIONAL_MODEL_MAX,
            description: `Operational model overview. Max ${SLIDE2_OPERATIONAL_MODEL_MAX} chars.`,
          },
        },
      },
      revenueBullet: {
        type: "object",
        required: ["text"],
        properties: {
          text: {
            type: "string",
            maxLength: SLIDE2_REVENUE_BULLET_MAX,
            description: `Revenue performance bullet. Max ${SLIDE2_REVENUE_BULLET_MAX} chars.`,
          },
        },
      },
      programmingBullet: {
        type: "object",
        required: ["text"],
        properties: {
          text: {
            type: "string",
            maxLength: SLIDE2_PROGRAMMING_BULLET_MAX,
            description: `Programming/experience bullet. Max ${SLIDE2_PROGRAMMING_BULLET_MAX} chars.`,
          },
        },
      },
    },
  },
};

const INVESTMENT_TOOL: Anthropic.Tool = {
  name: "draft_investment",
  description: "Draft Slide 3 investment copy: concept paragraph, market rationale, three investment reasons, closing line.",
  input_schema: {
    type: "object",
    required: ["conceptParagraph", "marketRationale", "reasons", "closingLine"],
    properties: {
      conceptParagraph: {
        type: "object",
        required: ["text"],
        properties: {
          text: {
            type: "string",
            maxLength: SLIDE3_CONCEPT_PARAGRAPH_MAX,
            description: `Investment concept overview. Max ${SLIDE3_CONCEPT_PARAGRAPH_MAX} chars.`,
          },
        },
      },
      marketRationale: {
        type: "object",
        required: ["text"],
        properties: {
          text: {
            type: "string",
            maxLength: SLIDE3_MARKET_RATIONALE_MAX,
            description: `Why this market. Max ${SLIDE3_MARKET_RATIONALE_MAX} chars.`,
          },
        },
      },
      reasons: {
        type: "object",
        required: ["reasons"],
        properties: {
          reasons: {
            type: "array",
            minItems: SLIDE3_REASONS_COUNT,
            maxItems: SLIDE3_REASONS_COUNT,
            items: {
              type: "object",
              required: ["label", "detail"],
              properties: {
                label: {
                  type: "string",
                  maxLength: SLIDE3_REASON_LABEL_MAX,
                  description: `Short reason heading. Max ${SLIDE3_REASON_LABEL_MAX} chars.`,
                },
                detail: {
                  type: "string",
                  maxLength: SLIDE3_REASON_DETAIL_MAX,
                  description: `Supporting detail for this reason. Max ${SLIDE3_REASON_DETAIL_MAX} chars.`,
                },
              },
            },
          },
        },
      },
      closingLine: {
        type: "object",
        required: ["text"],
        properties: {
          text: {
            type: "string",
            maxLength: SLIDE3_CLOSING_LINE_MAX,
            description: `Closing investor call-to-action line. Max ${SLIDE3_CLOSING_LINE_MAX} chars.`,
          },
        },
      },
    },
  },
};

const TRANSFORMATION_TOOL: Anthropic.Tool = {
  name: "draft_transformation",
  description: "Draft Slide 5 transformation copy: description and comparison table rows.",
  input_schema: {
    type: "object",
    required: ["transformationDescription", "transformationRows"],
    properties: {
      transformationDescription: {
        type: "object",
        required: ["text"],
        properties: {
          text: {
            type: "string",
            maxLength: SLIDE5_TRANSFORMATION_DESCRIPTION_MAX,
            description: `Renovation/transformation narrative. Max ${SLIDE5_TRANSFORMATION_DESCRIPTION_MAX} chars.`,
          },
        },
      },
      transformationRows: {
        type: "object",
        required: ["rows"],
        properties: {
          rows: {
            type: "array",
            minItems: SLIDE5_TRANSFORMATION_ROWS_COUNT,
            maxItems: SLIDE5_TRANSFORMATION_ROWS_COUNT,
            items: {
              type: "object",
              required: ["feature", "existing", "proposed"],
              properties: {
                feature: {
                  type: "string",
                  maxLength: SLIDE5_TRANSFORMATION_ROW_FEATURE_MAX,
                  description: `Feature name. Max ${SLIDE5_TRANSFORMATION_ROW_FEATURE_MAX} chars.`,
                },
                existing: {
                  type: "string",
                  maxLength: SLIDE5_TRANSFORMATION_ROW_EXISTING_MAX,
                  description: `Current state. Max ${SLIDE5_TRANSFORMATION_ROW_EXISTING_MAX} chars.`,
                },
                proposed: {
                  type: "string",
                  maxLength: SLIDE5_TRANSFORMATION_ROW_PROPOSED_MAX,
                  description: `Proposed state. Max ${SLIDE5_TRANSFORMATION_ROW_PROPOSED_MAX} chars.`,
                },
              },
            },
          },
        },
      },
    },
  },
};

// ── Serializers ──────────────────────────────────────────────────────────────

function serializeBullets(v: { bullets: Array<{ text: string }> }): string {
  return v.bullets.map(b => `• ${b.text}`).join("\n");
}

function serializeReasons(v: { reasons: Array<{ label: string; detail: string }> }): string {
  return v.reasons.map(r => `${r.label}: ${r.detail}`).join("\n\n");
}

function serializeRows(v: { rows: Array<{ feature: string; existing: string; proposed: string }> }): string {
  return v.rows.map(r => `${r.feature} | ${r.existing} | ${r.proposed}`).join("\n");
}

function serializeRow(r: { feature: string; existing: string; proposed: string }): string {
  return `${r.feature} | ${r.existing} | ${r.proposed}`;
}

// ── Property adapter ─────────────────────────────────────────────────────────

function toSlideProperty(p: Record<string, unknown>): SlideProperty {
  return {
    id: p.id as number,
    name: (p.name as string) ?? "",
    city: (p.city as string) ?? "",
    stateProvince: (p.stateProvince as string) ?? "",
    county: (p.county as string) ?? "",
    country: (p.country as string) ?? "",
    purchasePrice: (p.purchasePrice as number) ?? 0,
    roomCount: (p.roomCount as number) ?? 0,
    startAdr: (p.startAdr as number) ?? 0,
    maxOccupancy: (p.maxOccupancy as number) ?? DEFAULT_FALLBACK_OCCUPANCY,
    businessModel: (p.businessModel as string) ?? "hotel",
    hospitalityType: (p.hospitalityType as string) ?? "",
    qualityTier: (p.qualityTier as string) ?? "",
    description: (p.description as string) ?? "",
    acquisitionStatus: (p.acquisitionStatus as string) ?? "pipeline",
    isHistoric: p.isHistoric as boolean | string | undefined,
    renovationScope: (p.renovationScope as string) ?? "",
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function emptyDraft(): LuccaSlotDraft {
  return { value: "", approved: false, approvedAt: null, source: "lucca" };
}

function makeDraft(value: string): LuccaSlotDraft {
  return { value, approved: false, approvedAt: null, source: "lucca" };
}

// ── Group drafters ────────────────────────────────────────────────────────────

async function draftVision(
  anthropic: Anthropic,
  propertyId: number,
): Promise<Record<string, LuccaSlotDraft>> {
  const prop = await storage.getProperty(propertyId);
  if (!prop) {
    logger.warn(`[lucca] vision: property ${propertyId} not found — empty stubs`, "slide-factory");
    return {
      "slide1.headerSubtitle": emptyDraft(),
      "slide1.visionBullets": emptyDraft(),
    };
  }

  const brief = buildPropertyBrief(toSlideProperty(prop as Record<string, unknown>));
  const fields = getGroupBriefFields("vision");
  const context = briefToPromptLines(brief, fields);

  const response = await anthropic.messages.create({
    model: LUCCA_DRAFT_MODEL,
    max_tokens: LUCCA_MAX_TOKENS,
    system: LUCCA_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildVisionPrompt(context) }],
    tools: [VISION_TOOL],
    tool_choice: { type: "any" },
  });

  const toolBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolBlock) {
    logger.warn("[lucca] vision: no tool call — empty stubs", "slide-factory");
    return {
      "slide1.headerSubtitle": emptyDraft(),
      "slide1.visionBullets": emptyDraft(),
    };
  }

  const out = toolBlock.input as {
    headerSubtitle: { text: string };
    visionBullets: { bullets: Array<{ text: string }> };
  };

  const subtitleResult = validateSlotOutput("slide1.headerSubtitle", out.headerSubtitle);
  const bulletsResult = validateSlotOutput("slide1.visionBullets", out.visionBullets);

  if (!subtitleResult.ok) {
    logger.warn(`[lucca] slide1.headerSubtitle validation: ${subtitleResult.errors.join("; ")}`, "slide-factory");
  }
  if (!bulletsResult.ok) {
    logger.warn(`[lucca] slide1.visionBullets validation: ${bulletsResult.errors.join("; ")}`, "slide-factory");
  }

  return {
    "slide1.headerSubtitle": makeDraft(subtitleResult.ok ? subtitleResult.value.text : ""),
    "slide1.visionBullets": makeDraft(bulletsResult.ok ? serializeBullets(bulletsResult.value) : ""),
  };
}

async function draftOperational(
  anthropic: Anthropic,
  propertyId: number,
): Promise<Record<string, LuccaSlotDraft>> {
  const prop = await storage.getProperty(propertyId);
  if (!prop) {
    logger.warn(`[lucca] operational: property ${propertyId} not found — empty stubs`, "slide-factory");
    return {
      "slide2.operationalModelText": emptyDraft(),
      "slide2.revenueBullet": emptyDraft(),
      "slide2.programmingBullet": emptyDraft(),
    };
  }

  const brief = buildPropertyBrief(toSlideProperty(prop as Record<string, unknown>));
  const fields = getGroupBriefFields("operational");
  const context = briefToPromptLines(brief, fields);

  const response = await anthropic.messages.create({
    model: LUCCA_DRAFT_MODEL,
    max_tokens: LUCCA_MAX_TOKENS,
    system: LUCCA_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildOperationalPrompt(context) }],
    tools: [OPERATIONAL_TOOL],
    tool_choice: { type: "any" },
  });

  const toolBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolBlock) {
    logger.warn("[lucca] operational: no tool call — empty stubs", "slide-factory");
    return {
      "slide2.operationalModelText": emptyDraft(),
      "slide2.revenueBullet": emptyDraft(),
      "slide2.programmingBullet": emptyDraft(),
    };
  }

  const out = toolBlock.input as {
    operationalModelText: { text: string };
    revenueBullet: { text: string };
    programmingBullet: { text: string };
  };

  const fields3 = [
    { key: "slide2.operationalModelText" as const, raw: out.operationalModelText },
    { key: "slide2.revenueBullet" as const, raw: out.revenueBullet },
    { key: "slide2.programmingBullet" as const, raw: out.programmingBullet },
  ];

  const result: Record<string, LuccaSlotDraft> = {};
  for (const { key, raw } of fields3) {
    const v = validateSlotOutput(key, raw);
    if (!v.ok) {
      logger.warn(`[lucca] ${key} validation: ${v.errors.join("; ")}`, "slide-factory");
    }
    result[key] = makeDraft(v.ok ? (v.value as { text: string }).text : "");
  }
  return result;
}

async function draftInvestment(
  anthropic: Anthropic,
  propertyId: number,
): Promise<Record<string, LuccaSlotDraft>> {
  const prop = await storage.getProperty(propertyId);
  if (!prop) {
    logger.warn(`[lucca] investment: property ${propertyId} not found — empty stubs`, "slide-factory");
    return {
      "slide3.conceptParagraph": emptyDraft(),
      "slide3.marketRationale": emptyDraft(),
      "slide3.reasons": emptyDraft(),
      "slide3.closingLine": emptyDraft(),
    };
  }

  const brief = buildPropertyBrief(toSlideProperty(prop as Record<string, unknown>));
  const fields = getGroupBriefFields("investment");
  const context = briefToPromptLines(brief, fields);

  const response = await anthropic.messages.create({
    model: LUCCA_DRAFT_MODEL,
    max_tokens: LUCCA_MAX_TOKENS,
    system: LUCCA_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildInvestmentPrompt(context) }],
    tools: [INVESTMENT_TOOL],
    tool_choice: { type: "any" },
  });

  const toolBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolBlock) {
    logger.warn("[lucca] investment: no tool call — empty stubs", "slide-factory");
    return {
      "slide3.conceptParagraph": emptyDraft(),
      "slide3.marketRationale": emptyDraft(),
      "slide3.reasons": emptyDraft(),
      "slide3.closingLine": emptyDraft(),
    };
  }

  const out = toolBlock.input as {
    conceptParagraph: { text: string };
    marketRationale: { text: string };
    reasons: { reasons: Array<{ label: string; detail: string }> };
    closingLine: { text: string };
  };

  const textFields = [
    { key: "slide3.conceptParagraph" as const, raw: out.conceptParagraph },
    { key: "slide3.marketRationale" as const, raw: out.marketRationale },
    { key: "slide3.closingLine" as const, raw: out.closingLine },
  ];

  const result: Record<string, LuccaSlotDraft> = {};
  for (const { key, raw } of textFields) {
    const v = validateSlotOutput(key, raw);
    if (!v.ok) {
      logger.warn(`[lucca] ${key} validation: ${v.errors.join("; ")}`, "slide-factory");
    }
    result[key] = makeDraft(v.ok ? (v.value as { text: string }).text : "");
  }

  const reasonsResult = validateSlotOutput("slide3.reasons", out.reasons);
  if (!reasonsResult.ok) {
    logger.warn(`[lucca] slide3.reasons validation: ${reasonsResult.errors.join("; ")}`, "slide-factory");
  }
  result["slide3.reasons"] = makeDraft(reasonsResult.ok ? serializeReasons(reasonsResult.value) : "");

  return result;
}

async function draftTransformation(
  anthropic: Anthropic,
  propertyId: number,
): Promise<Record<string, LuccaSlotDraft>> {
  const prop = await storage.getProperty(propertyId);
  if (!prop) {
    logger.warn(`[lucca] transformation: property ${propertyId} not found — empty stubs`, "slide-factory");
    return buildEmptyTransformationDrafts();
  }

  const brief = buildPropertyBrief(toSlideProperty(prop as Record<string, unknown>));
  const fields = getGroupBriefFields("transformation");
  const context = briefToPromptLines(brief, fields);

  const response = await anthropic.messages.create({
    model: LUCCA_DRAFT_MODEL,
    max_tokens: LUCCA_MAX_TOKENS,
    system: LUCCA_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildTransformationPrompt(context) }],
    tools: [TRANSFORMATION_TOOL],
    tool_choice: { type: "any" },
  });

  const toolBlock = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (!toolBlock) {
    logger.warn("[lucca] transformation: no tool call — empty stubs", "slide-factory");
    return buildEmptyTransformationDrafts();
  }

  const out = toolBlock.input as {
    transformationDescription: { text: string };
    transformationRows: { rows: Array<{ feature: string; existing: string; proposed: string }> };
  };

  const descResult = validateSlotOutput("slide5.transformationDescription", out.transformationDescription);
  if (!descResult.ok) {
    logger.warn(`[lucca] slide5.transformationDescription validation: ${descResult.errors.join("; ")}`, "slide-factory");
  }

  const rowsResult = validateSlotOutput("slide5.transformationRows", out.transformationRows);
  if (!rowsResult.ok) {
    logger.warn(`[lucca] slide5.transformationRows validation: ${rowsResult.errors.join("; ")}`, "slide-factory");
  }

  const result: Record<string, LuccaSlotDraft> = {
    "slide5.transformationDescription": makeDraft(
      descResult.ok ? (descResult.value as { text: string }).text : "",
    ),
    "slide5.transformationRows": makeDraft(
      rowsResult.ok ? serializeRows(rowsResult.value as { rows: Array<{ feature: string; existing: string; proposed: string }> }) : "",
    ),
  };

  // Populate individual row keys from the same tool output — synchronized with aggregate.
  const rows = rowsResult.ok
    ? (rowsResult.value as { rows: Array<{ feature: string; existing: string; proposed: string }> }).rows
    : [];

  const ROW_KEYS = [
    "slide5.transformationRows[0]",
    "slide5.transformationRows[1]",
    "slide5.transformationRows[2]",
    "slide5.transformationRows[3]",
  ] as const;

  for (let i = 0; i < ROW_KEYS.length; i++) {
    const row = rows[i];
    if (!row) {
      result[ROW_KEYS[i]] = emptyDraft();
      continue;
    }
    const rowResult = validateSlotOutput(ROW_KEYS[i], row);
    if (!rowResult.ok) {
      logger.warn(`[lucca] ${ROW_KEYS[i]} validation: ${rowResult.errors.join("; ")}`, "slide-factory");
    }
    result[ROW_KEYS[i]] = makeDraft(
      rowResult.ok ? serializeRow(rowResult.value as { feature: string; existing: string; proposed: string }) : "",
    );
  }

  return result;
}

function buildEmptyTransformationDrafts(): Record<string, LuccaSlotDraft> {
  return {
    "slide5.transformationDescription": emptyDraft(),
    "slide5.transformationRows": emptyDraft(),
    "slide5.transformationRows[0]": emptyDraft(),
    "slide5.transformationRows[1]": emptyDraft(),
    "slide5.transformationRows[2]": emptyDraft(),
    "slide5.transformationRows[3]": emptyDraft(),
  };
}

// ── Prompts ───────────────────────────────────────────────────────────────────

const LUCCA_SYSTEM_PROMPT =
  "You are Lucca, an investor-deck copy specialist for LB hospitality acquisitions. " +
  "Draft concise, compelling investor copy for each slot provided. " +
  "Stay strictly within character budgets. " +
  "Use only the property data provided — do not invent facts. " +
  "Tone: confident, professional, investor-grade.";

function buildVisionPrompt(context: string): string {
  return (
    `Property context:\n${context}\n\n` +
    "Draft Slide 1 vision copy:\n" +
    `• headerSubtitle — one-line tagline capturing location/concept (max ${SLIDE1_HEADER_SUBTITLE_MAX} chars)\n` +
    `• visionBullets — exactly ${SLIDE1_VISION_BULLETS_COUNT} distinct investor-grade bullets, each max ${SLIDE1_VISION_BULLET_MAX} chars`
  );
}

function buildOperationalPrompt(context: string): string {
  return (
    `Property context:\n${context}\n\n` +
    "Draft Slide 2 operational copy:\n" +
    `• operationalModelText — operational model overview (max ${SLIDE2_OPERATIONAL_MODEL_MAX} chars)\n` +
    `• revenueBullet — single revenue performance bullet (max ${SLIDE2_REVENUE_BULLET_MAX} chars)\n` +
    `• programmingBullet — single programming/experience bullet (max ${SLIDE2_PROGRAMMING_BULLET_MAX} chars)`
  );
}

function buildInvestmentPrompt(context: string): string {
  return (
    `Property context:\n${context}\n\n` +
    "Draft Slide 3 investment copy:\n" +
    `• conceptParagraph — investment concept overview (max ${SLIDE3_CONCEPT_PARAGRAPH_MAX} chars)\n` +
    `• marketRationale — why this market (max ${SLIDE3_MARKET_RATIONALE_MAX} chars)\n` +
    `• reasons — exactly ${SLIDE3_REASONS_COUNT} investment reasons, each with a label (max ${SLIDE3_REASON_LABEL_MAX} chars) and detail (max ${SLIDE3_REASON_DETAIL_MAX} chars)\n` +
    `• closingLine — investor call-to-action closing line (max ${SLIDE3_CLOSING_LINE_MAX} chars)`
  );
}

function buildTransformationPrompt(context: string): string {
  return (
    `Property context:\n${context}\n\n` +
    "Draft Slide 5 transformation copy:\n" +
    `• transformationDescription — renovation/transformation narrative (max ${SLIDE5_TRANSFORMATION_DESCRIPTION_MAX} chars)\n` +
    `• transformationRows — exactly ${SLIDE5_TRANSFORMATION_ROWS_COUNT} comparison table rows, each with feature (max ${SLIDE5_TRANSFORMATION_ROW_FEATURE_MAX}), existing (max ${SLIDE5_TRANSFORMATION_ROW_EXISTING_MAX}), proposed (max ${SLIDE5_TRANSFORMATION_ROW_PROPOSED_MAX})`
  );
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function runLuccaDraft(runId: number): Promise<void> {
  try {
    const run = await getSlideFactoryRunById(runId);
    if (!run) {
      throw new Error(`run ${runId} not found`);
    }

    const anthropic = getAnthropicClient();

    const GROUP_PROPERTY_MAP: Array<{
      group: SlotBatchGroup;
      propertyId: number | null;
      drafter: (anthropic: Anthropic, propId: number) => Promise<Record<string, LuccaSlotDraft>>;
      emptyFn: () => Record<string, LuccaSlotDraft>;
    }> = [
      {
        group: "vision",
        propertyId: run.slide1PropertyId,
        drafter: draftVision,
        emptyFn: () => ({
          "slide1.headerSubtitle": emptyDraft(),
          "slide1.visionBullets": emptyDraft(),
        }),
      },
      {
        group: "operational",
        propertyId: run.slide2PropertyId,
        drafter: draftOperational,
        emptyFn: () => ({
          "slide2.operationalModelText": emptyDraft(),
          "slide2.revenueBullet": emptyDraft(),
          "slide2.programmingBullet": emptyDraft(),
        }),
      },
      {
        group: "investment",
        propertyId: run.slide3PropertyId,
        drafter: draftInvestment,
        emptyFn: () => ({
          "slide3.conceptParagraph": emptyDraft(),
          "slide3.marketRationale": emptyDraft(),
          "slide3.reasons": emptyDraft(),
          "slide3.closingLine": emptyDraft(),
        }),
      },
      {
        group: "transformation",
        propertyId: run.slide5PropertyId,
        drafter: draftTransformation,
        emptyFn: buildEmptyTransformationDrafts,
      },
    ];

    const draft: Record<string, LuccaSlotDraft> = {};

    for (const { group, propertyId, drafter, emptyFn } of GROUP_PROPERTY_MAP) {
      if (propertyId == null) {
        logger.info(`[lucca] ${group}: no property assigned — empty stubs`, "slide-factory");
        Object.assign(draft, emptyFn());
        continue;
      }

      logger.info(`[lucca] drafting ${group} group (property ${propertyId})`, "slide-factory");
      const groupDraft = await drafter(anthropic, propertyId);
      Object.assign(draft, groupDraft);
      logger.info(`[lucca] ${group} group done`, "slide-factory");
    }

    await updateSlideFactoryRun(runId, {
      luccaDraft: draft,
      status: "draft_review",
    });

    logger.info(`[lucca] run ${runId} draft complete — ${Object.keys(draft).length} slots`, "slide-factory");
  } catch (err: unknown) {
    logger.error(`[lucca] run ${runId} draft failed: ${String(err)}`, "slide-factory");
    try {
      await updateSlideFactoryRun(runId, { status: "error" });
    } catch {
      // best-effort
    }
  }
}
