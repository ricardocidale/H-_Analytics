/**
 * property-deck-payload.ts
 *
 * Admin authoring surface for the L+B canonical 6-slide investor deck.
 *
 *   GET   /api/admin/properties/:id/deck-payload
 *     Read the persisted DeckPayloadV2 (or `EMPTY_DECK_PAYLOAD_V2` if the
 *     editor hasn't saved anything yet). Used by the per-property LB-Slides
 *     admin page to hydrate the editor.
 *
 *   PATCH /api/admin/properties/:id/deck-payload
 *     Shallow-merge a partial DeckPayloadV2 into the persisted row. Each
 *     slide-level key in the patch replaces only that slide's authored slots
 *     — sending `{ slide1: { propertySubtitle: {...} } }` replaces only
 *     `propertySubtitle`, leaving the rest of `slide1` (and slides 2–6)
 *     untouched. Validation rejects oversized strings per the canonical
 *     contract's per-slot character budgets.
 *
 *   POST  /api/admin/properties/:id/deck-payload/draft-slot
 *     Invoke the LLM to draft a single slot and return the suggestion. Does
 *     NOT persist — the editor shows the draft as a diff for the admin to
 *     accept (subsequent PATCH) or reject. This endpoint is the ONLY render-
 *     adjacent place the LLM is invoked; `build-payload.ts` is LLM-free.
 *
 *   GET   /api/admin/properties/:id/deck-payload/readiness
 *     Returns per-slot status (complete|stale|missing|deterministic) for all
 *     15 authored slots, comparing slot provenance timestamps against the
 *     property's updatedAt. Used by the admin editor and draft-all.
 *
 *   POST  /api/admin/properties/:id/deck-payload/draft-all
 *     Drafts all missing + stale slots in the minimum number of LLM calls by
 *     grouping into logical batches (vision, operational, investment,
 *     transformation). Returns drafts for admin review — does NOT auto-persist.
 *
 * Auth: requireAdmin on every route. The editor is admin-only.
 */

import { Router, type Request, type Response } from "express";
import { requireAdmin, getAuthUser } from "../auth";
import { logger } from "../logger";
import { storage } from "../storage";
import { parseRouteId } from "./helpers";
import {
  deckPayloadV2PatchSchema,
  parseDeckPayloadV2,
  EMPTY_DECK_PAYLOAD_V2,
  type DeckPayloadV2,
  type Slide1Payload,
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
import { generatePropertyVisionText } from "../ai/property-vision";
import { buildPropertyBrief } from "../slides/property-brief";
import { computeRenovationBudget } from "../slides/build-payload";
import type { SlideProperty } from "../slides/types";
import { validateSlotOutput } from "../slides/slot-output-validator";
import {
  getSlotReadiness,
  getStaleMissingSlots,
} from "../slides/slot-readiness";
import {
  SLOT_CONTEXT_MAP,
  getSlotsForGroup,
  type DraftSlotKey,
  type SlotBatchGroup,
} from "../slides/slot-context-map";
import { getAnthropicClient } from "../ai/clients";
import {
  HTTP_400_BAD_REQUEST,
  HTTP_404_NOT_FOUND,
  HTTP_422_UNPROCESSABLE_ENTITY,
  HTTP_500_INTERNAL_SERVER_ERROR,
  AI_DECK_SLOT_DRAFT_MAX_TOKENS,
  AI_DECK_GROUP_DRAFT_MAX_TOKENS,
} from "../constants";
import { DEFAULT_FALLBACK_OCCUPANCY } from "@shared/constants-benchmarks";

const router = Router();

const VISION_MODEL = "claude-opus-4-6";

// ── Draft slot registry ────────────────────────────────────────────────────
// All LLM-draftable slots. Adding a new slot requires:
//   (a) adding it here
//   (b) handling it in draftSlot() below
//   (c) adding a UI control in the editor (no reflection)

const DRAFT_SLOTS: readonly DraftSlotKey[] = [
  "slide1.headerSubtitle",
  "slide1.visionBullets",
  "slide2.operationalModelText",
  "slide2.revenueBullet",
  "slide2.programmingBullet",
  "slide3.conceptParagraph",
  "slide3.marketRationale",
  "slide3.reasons",
  "slide3.closingLine",
  "slide5.transformationDescription",
  "slide5.transformationRows",
] as const;

function isDraftSlot(s: unknown): s is DraftSlotKey {
  return typeof s === "string" && (DRAFT_SLOTS as readonly string[]).includes(s);
}

interface DraftResult {
  slot: DraftSlotKey;
  suggestion: unknown;
  model: string;
  generatedAt: string;
  validationErrors?: string[];
}

/**
 * Thrown by draftSlot() when the LLM output violates character-budget
 * constraints from deck-payload-v2. Caught in the route handler and
 * surfaced as a 422 rather than a 500.
 */
class SlotValidationError extends Error {
  constructor(
    readonly slot: DraftSlotKey,
    readonly validationErrors: string[],
  ) {
    super(
      `Slot output violates character budgets for ${slot}: ${validationErrors.join("; ")}`,
    );
    this.name = "SlotValidationError";
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
}

// ── Fallback copy — exported so tests can pin them against shared budgets ─

/**
 * Static fallback bullets used when the LLM call fails or is unavailable.
 * Exported for contract tests — do NOT mutate at runtime.
 * Each string must already fit within SLIDE1_VISION_BULLET_MAX so the
 * downstream `.slice()` guard is a no-op and callers get the full text.
 */
export const FALLBACK_VISION_BULLET_TEXTS: readonly string[] = [
  `Year-Round Demand: Drive-Market Leisure + Weekend Escapes + Local Events`,
  `Direct Booking Focus: 50%+ Direct Mix by Year 3, Reducing OTA Dependency`,
  `Revenue Mix: 70% Rooms, 20% F&B, 10% Events & Packages`,
];

function propertyToSlideProperty(
  property: Record<string, unknown>,
): SlideProperty {
  const p = property as Record<string, unknown>;
  return {
    id: property.id as number,
    name: property.name as string,
    city: (property.city as string) ?? "",
    stateProvince: (property.stateProvince as string) ?? "",
    county: (p.county as string) ?? "",
    country: (property.country as string) ?? "",
    purchasePrice: (property.purchasePrice as number) ?? 0,
    roomCount: (property.roomCount as number) ?? 0,
    startAdr: (property.startAdr as number) ?? 0,
    maxOccupancy: (property.maxOccupancy as number) ?? DEFAULT_FALLBACK_OCCUPANCY,
    businessModel: (property.businessModel as string) ?? "hotel",
    hospitalityType: (p.hospitalityType as string) ?? "",
    qualityTier: (p.qualityTier as string) ?? "",
    description: (property.description as string) ?? "",
    acquisitionStatus: (p.acquisitionStatus as string) ?? "pipeline",
    isHistoric: p.isHistoric as boolean | string | undefined,
    renovationScope: (p.renovationScope as string) ?? "",
  };
}

// ── Single-slot drafter ────────────────────────────────────────────────────

/**
 * Draft a single slot via the LLM. Returns the proposal; does NOT persist.
 * All output is validated through SlotOutputValidator before returning —
 * over-budget fields surface as actionable errors, never silently truncated.
 */
async function draftSlot(
  propertyId: number,
  slot: DraftSlotKey,
): Promise<DraftResult> {
  const property = await storage.getProperty(propertyId);
  if (!property) throw new Error("Property not found");

  const generatedAt = new Date().toISOString();
  const model = VISION_MODEL;

  // Vision slots (slide1.*) use generatePropertyVisionText which covers the
  // whole vision group in one LLM call. Output is validated strictly —
  // over-budget text throws SlotValidationError (surfaced as 422), never
  // silently truncated.
  if (slot === "slide1.headerSubtitle" || slot === "slide1.visionBullets") {
    const visionText = await generatePropertyVisionText({
      id: property.id,
      name: property.name,
      city: property.city,
      stateProvince: property.stateProvince,
      county: (property as Record<string, unknown>).county as string | null,
      country: property.country,
      purchasePrice: property.purchasePrice,
      roomCount: property.roomCount,
      startAdr: property.startAdr,
      maxOccupancy: property.maxOccupancy,
      businessModel: property.businessModel,
      hospitalityType: (property as Record<string, unknown>).hospitalityType as string | null,
      qualityTier: (property as Record<string, unknown>).qualityTier as string | null,
      description: property.description,
      acquisitionStatus: (property as Record<string, unknown>).acquisitionStatus as string | null,
    });

    if (slot === "slide1.headerSubtitle") {
      const suggestion = { text: visionText.descriptionParagraph ?? "" };
      const validation = validateSlotOutput(slot, suggestion);
      if (!validation.ok) throw new SlotValidationError(slot, validation.errors);
      return { slot, suggestion, model, generatedAt };
    }

    // slide1.visionBullets — filter to valid strings, cap to declared count,
    // do NOT truncate text (over-budget triggers a hard validation error).
    const suggestion = {
      bullets: [
        visionText.visionBullet1,
        visionText.visionBullet2,
        visionText.programmingBullet,
      ]
        .filter((s): s is string => typeof s === "string" && s.length > 0)
        .slice(0, SLIDE1_VISION_BULLETS_COUNT)
        .map(text => ({ text })),
    };
    const validation = validateSlotOutput(slot, suggestion);
    if (!validation.ok) throw new SlotValidationError(slot, validation.errors);
    return { slot, suggestion, model, generatedAt };
  }

  // All other slots: use the brief + targeted prompt. Wire renovation budget
  // from computeRenovationBudget so the brief is financially grounded for
  // operational, investment, and transformation slot prompts.
  const propRec = property as Record<string, unknown>;
  const renovBudget = computeRenovationBudget({
    roomCount: propRec.roomCount as number | null,
    purchasePrice: propRec.purchasePrice as number | null,
    qualityTier: propRec.qualityTier as string | null,
    hospitalityType: propRec.hospitalityType as string | null,
    renovationScope: propRec.renovationScope as string | null,
    isHistoric: propRec.isHistoric as boolean | string | null,
  });
  const brief = buildPropertyBrief(
    propertyToSlideProperty(propRec),
    { renovationBudget: renovBudget },
  );
  const contextEntry = SLOT_CONTEXT_MAP[slot];

  // Build a targeted prompt for this slot
  const contextLines = contextEntry.briefFields
    .map(f => {
      const val = brief[f];
      if (val == null) return null;
      if (typeof val === "boolean") return `${f}: ${val ? "Yes" : "No"}`;
      return `${f}: ${val}`;
    })
    .filter(Boolean)
    .join("\n");

  const slotPrompts: Record<string, string> = {
    "slide2.operationalModelText": `Write a single sentence (max ${SLIDE2_OPERATIONAL_MODEL_MAX} chars) describing the operational model for the slide "Operational Model:" italic label. Return JSON: {"text":"..."}`,
    "slide2.revenueBullet": `Write a concise revenue strategy bullet (max ${SLIDE2_REVENUE_BULLET_MAX} chars) citing specific metrics. Return JSON: {"text":"..."}`,
    "slide2.programmingBullet": `Write a concise programming/amenity strategy bullet (max ${SLIDE2_PROGRAMMING_BULLET_MAX} chars). Return JSON: {"text":"..."}`,
    "slide3.conceptParagraph": `Write a single-sentence investment concept paragraph (max ${SLIDE3_CONCEPT_PARAGRAPH_MAX} chars) for "The Concept" section. Return JSON: {"text":"..."}`,
    "slide3.marketRationale": `Write a market rationale paragraph (max ${SLIDE3_MARKET_RATIONALE_MAX} chars) for "Why This Property?". Cite market data. Return JSON: {"text":"..."}`,
    "slide3.reasons": `Write exactly ${SLIDE3_REASONS_COUNT} investment thesis reasons. Each label max ${SLIDE3_REASON_LABEL_MAX} chars, each detail max ${SLIDE3_REASON_DETAIL_MAX} chars. Return JSON: {"reasons":[{"label":"...","detail":"..."},{"label":"...","detail":"..."},{"label":"...","detail":"..."}]}`,
    "slide3.closingLine": `Write a single closing pull-quote line (max ${SLIDE3_CLOSING_LINE_MAX} chars) that references the city and property name. Return JSON: {"text":"..."}`,
    "slide5.transformationDescription": `Write an intro paragraph (max ${SLIDE5_TRANSFORMATION_DESCRIPTION_MAX} chars) describing the physical transformation plan. Return JSON: {"text":"..."}`,
    "slide5.transformationRows": `Write exactly ${SLIDE5_TRANSFORMATION_ROWS_COUNT} transformation comparison rows. Feature max ${SLIDE5_TRANSFORMATION_ROW_FEATURE_MAX} chars, Existing max ${SLIDE5_TRANSFORMATION_ROW_EXISTING_MAX} chars, Proposed max ${SLIDE5_TRANSFORMATION_ROW_PROPOSED_MAX} chars. Return JSON: {"rows":[{"feature":"...","existing":"...","proposed":"..."},...]}`,
  };

  const instruction = slotPrompts[slot];
  if (!instruction) throw new Error(`No prompt template for slot: ${slot}`);

  const prompt = `You are writing investor-grade slide copy for a boutique hospitality deck.

RULES: Cite specific numbers. No "exciting", "unique opportunity", "world-class", "strong fundamentals". Be direct and metric-driven.

PROPERTY DATA:
${contextLines}

TASK: ${instruction}

Return ONLY valid JSON — no markdown, no explanation.`;

  const anthropic = getAnthropicClient();
  const response = await anthropic.messages.create({
    model: VISION_MODEL,
    max_tokens: AI_DECK_SLOT_DRAFT_MAX_TOKENS,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find(b => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(`LLM returned no text block for slot ${slot}`);
  }

  const suggestion = JSON.parse(stripCodeFences(textBlock.text)) as unknown;
  const validation = validateSlotOutput(slot, suggestion);
  if (!validation.ok) throw new SlotValidationError(slot, validation.errors);

  return { slot, suggestion, model, generatedAt };
}

// ── Batch drafting for draft-all ──────────────────────────────────────────

async function draftGroupBatch(
  brief: ReturnType<typeof buildPropertyBrief>,
  group: SlotBatchGroup,
  slotsInGroup: DraftSlotKey[],
  generatedAt: string,
): Promise<DraftResult[]> {
  const slots = getSlotsForGroup(group).filter(s => slotsInGroup.includes(s));
  if (slots.length === 0) return [];

  const MAX_CHARS: Partial<Record<DraftSlotKey, number>> = {
    "slide2.operationalModelText": SLIDE2_OPERATIONAL_MODEL_MAX,
    "slide2.revenueBullet": SLIDE2_REVENUE_BULLET_MAX,
    "slide2.programmingBullet": SLIDE2_PROGRAMMING_BULLET_MAX,
    "slide3.conceptParagraph": SLIDE3_CONCEPT_PARAGRAPH_MAX,
    "slide3.marketRationale": SLIDE3_MARKET_RATIONALE_MAX,
    "slide3.closingLine": SLIDE3_CLOSING_LINE_MAX,
    "slide5.transformationDescription": SLIDE5_TRANSFORMATION_DESCRIPTION_MAX,
  };

  const contextLines = [
    ...new Set(slots.flatMap(s => SLOT_CONTEXT_MAP[s].briefFields)),
  ]
    .map(f => {
      const val = brief[f];
      if (val == null) return null;
      if (typeof val === "boolean") return `${f}: ${val ? "Yes" : "No"}`;
      return `${f}: ${val}`;
    })
    .filter(Boolean)
    .join("\n");

  const slotSpecs = slots.map(s => {
    if (s === "slide3.reasons") {
      return `"${s}": {"reasons":[{"label":"...","detail":"..."}×${SLIDE3_REASONS_COUNT}]} (label≤${SLIDE3_REASON_LABEL_MAX}, detail≤${SLIDE3_REASON_DETAIL_MAX} chars)`;
    }
    if (s === "slide5.transformationRows") {
      return `"${s}": {"rows":[{"feature":"...","existing":"...","proposed":"..."}×${SLIDE5_TRANSFORMATION_ROWS_COUNT}]} (feature≤${SLIDE5_TRANSFORMATION_ROW_FEATURE_MAX}, existing≤${SLIDE5_TRANSFORMATION_ROW_EXISTING_MAX}, proposed≤${SLIDE5_TRANSFORMATION_ROW_PROPOSED_MAX} chars)`;
    }
    if (s === "slide1.visionBullets") {
      return `"${s}": {"bullets":[{"text":"..."}×${SLIDE1_VISION_BULLETS_COUNT}]} (each bullet≤${SLIDE1_VISION_BULLET_MAX} chars)`;
    }
    const max = MAX_CHARS[s];
    return `"${s}": {"text":"..."} (≤${max ?? SLIDE3_REASON_DETAIL_MAX} chars)`;
  });

  const prompt = `You are writing investor-grade slide copy for a boutique hospitality deck.

RULES: Cite specific numbers. No "exciting", "unique opportunity", "world-class", "strong fundamentals". Be direct and metric-driven.

PROPERTY DATA:
${contextLines}

Return a single JSON object with all keys below. No markdown, no explanation.

${slotSpecs.join("\n")}

Return:
{
${slots.map(s => `  "${s}": ...`).join(",\n")}
}`;

  const anthropic = getAnthropicClient();
  const response = await anthropic.messages.create({
    model: VISION_MODEL,
    max_tokens: AI_DECK_GROUP_DRAFT_MAX_TOKENS,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = response.content.find(b => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(`LLM returned no text block for group ${group}`);
  }

  const parsed = JSON.parse(stripCodeFences(textBlock.text)) as Record<string, unknown>;

  return slots.map(slot => {
    const suggestion = parsed[slot];
    const validation = validateSlotOutput(slot, suggestion);
    return {
      slot,
      suggestion,
      model: VISION_MODEL,
      generatedAt,
      validationErrors: validation.ok ? undefined : validation.errors,
    };
  });
}

// ── Routes ────────────────────────────────────────────────────────────────

router.get(
  "/api/admin/properties/:id/deck-payload",
  requireAdmin,
  async (req: Request, res: Response) => {
    const propertyId = parseRouteId(req.params.id);
    if (!propertyId) {
      return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid property ID" });
    }
    const property = await storage.getProperty(propertyId);
    if (!property) {
      return res.status(HTTP_404_NOT_FOUND).json({ error: "Property not found" });
    }
    const row = await storage.getDeckPayload(propertyId);
    const payload: DeckPayloadV2 = row ? parseDeckPayloadV2(row.payload) : EMPTY_DECK_PAYLOAD_V2;
    res.setHeader("Cache-Control", "no-store");
    return res.json({
      propertyId,
      payload,
      updatedBy: row?.updatedBy ?? null,
      updatedAt: row?.updatedAt ?? null,
    });
  },
);

router.patch(
  "/api/admin/properties/:id/deck-payload",
  requireAdmin,
  async (req: Request, res: Response) => {
    const propertyId = parseRouteId(req.params.id);
    if (!propertyId) {
      return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid property ID" });
    }
    const property = await storage.getProperty(propertyId);
    if (!property) {
      return res.status(HTTP_404_NOT_FOUND).json({ error: "Property not found" });
    }

    const parsed = deckPayloadV2PatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(HTTP_400_BAD_REQUEST).json({
        error: "Invalid deck payload patch",
        issues: parsed.error.issues,
      });
    }

    // Shallow-merge per slide so a PATCH targeting only one slot does not
    // erase sibling slots in the same slide.
    const existing = await storage.getDeckPayload(propertyId);
    const current = existing ? parseDeckPayloadV2(existing.payload) : EMPTY_DECK_PAYLOAD_V2;
    const merged: DeckPayloadV2 = { ...current };
    const patch = parsed.data;
    if (patch.slide1) {
      const mergedSlide1 = { ...(current.slide1 ?? {}), ...patch.slide1 } as Slide1Payload;
      if (patch.slide1.photoCaptions) {
        mergedSlide1.photoCaptions = {
          ...(current.slide1?.photoCaptions ?? {}),
          ...patch.slide1.photoCaptions,
        } as Slide1Payload["photoCaptions"];
      }
      merged.slide1 = mergedSlide1;
    }
    if (patch.slide2) merged.slide2 = { ...(current.slide2 ?? {}), ...patch.slide2 };
    if (patch.slide3) merged.slide3 = { ...(current.slide3 ?? {}), ...patch.slide3 };
    if (patch.slide4) merged.slide4 = { ...(current.slide4 ?? {}), ...patch.slide4 };
    if (patch.slide5) merged.slide5 = { ...(current.slide5 ?? {}), ...patch.slide5 };
    if (patch.slide6) merged.slide6 = { ...(current.slide6 ?? {}), ...patch.slide6 };

    const userId = getAuthUser(req)?.id ?? null;
    const row = await storage.setDeckPayload(propertyId, merged as unknown as Record<string, unknown>, userId);
    res.setHeader("Cache-Control", "no-store");
    return res.json({
      propertyId,
      payload: parseDeckPayloadV2(row.payload),
      updatedBy: row.updatedBy,
      updatedAt: row.updatedAt,
    });
  },
);

router.post(
  "/api/admin/properties/:id/deck-payload/draft-slot",
  requireAdmin,
  async (req: Request, res: Response) => {
    const propertyId = parseRouteId(req.params.id);
    if (!propertyId) {
      return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid property ID" });
    }
    const slot = (req.body as Record<string, unknown> | undefined)?.slot;
    if (!isDraftSlot(slot)) {
      return res.status(HTTP_400_BAD_REQUEST).json({
        error: "Invalid or missing 'slot'",
        allowedSlots: DRAFT_SLOTS,
      });
    }
    const property = await storage.getProperty(propertyId);
    if (!property) {
      return res.status(HTTP_404_NOT_FOUND).json({ error: "Property not found" });
    }
    try {
      const result = await draftSlot(propertyId, slot);
      res.setHeader("Cache-Control", "no-store");
      return res.json(result);
    } catch (err: unknown) {
      if (err instanceof SlotValidationError) {
        return res.status(HTTP_422_UNPROCESSABLE_ENTITY).json({
          error: "LLM output exceeded character budget — retry or adjust the prompt",
          slot: err.slot,
          validationErrors: err.validationErrors,
        });
      }
      const message = err instanceof Error ? err.message : "Draft generation failed";
      logger.error(
        `[property-deck-payload] Draft failed for property ${propertyId} slot ${slot}: ${message}`,
        "property-deck-payload",
      );
      return res.status(HTTP_500_INTERNAL_SERVER_ERROR).json({ error: message });
    }
  },
);

router.get(
  "/api/admin/properties/:id/deck-payload/readiness",
  requireAdmin,
  async (req: Request, res: Response) => {
    const propertyId = parseRouteId(req.params.id);
    if (!propertyId) {
      return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid property ID" });
    }
    const property = await storage.getProperty(propertyId);
    if (!property) {
      return res.status(HTTP_404_NOT_FOUND).json({ error: "Property not found" });
    }

    const row = await storage.getDeckPayload(propertyId);
    const payload = row ? parseDeckPayloadV2(row.payload) : EMPTY_DECK_PAYLOAD_V2;

    // Use property updatedAt if available; otherwise treat as epoch so all
    // existing slots appear complete rather than spuriously stale.
    const propertyRec = property as Record<string, unknown>;
    const propertyUpdatedAt =
      propertyRec.updatedAt instanceof Date
        ? propertyRec.updatedAt
        : typeof propertyRec.updatedAt === "string"
          ? new Date(propertyRec.updatedAt)
          : new Date(0);

    const report = getSlotReadiness(payload, propertyUpdatedAt);
    const staleMissing = getStaleMissingSlots(report);

    res.setHeader("Cache-Control", "no-store");
    return res.json({
      propertyId,
      report,
      staleMissingSlots: staleMissing,
      staleMissingCount: staleMissing.length,
      payloadUpdatedAt: row?.updatedAt ?? null,
      propertyUpdatedAt: propertyUpdatedAt.toISOString(),
    });
  },
);

router.post(
  "/api/admin/properties/:id/deck-payload/draft-all",
  requireAdmin,
  async (req: Request, res: Response) => {
    const propertyId = parseRouteId(req.params.id);
    if (!propertyId) {
      return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid property ID" });
    }
    const property = await storage.getProperty(propertyId);
    if (!property) {
      return res.status(HTTP_404_NOT_FOUND).json({ error: "Property not found" });
    }

    const row = await storage.getDeckPayload(propertyId);
    const payload = row ? parseDeckPayloadV2(row.payload) : EMPTY_DECK_PAYLOAD_V2;

    const propertyRec = property as Record<string, unknown>;
    const propertyUpdatedAt =
      propertyRec.updatedAt instanceof Date
        ? propertyRec.updatedAt
        : typeof propertyRec.updatedAt === "string"
          ? new Date(propertyRec.updatedAt)
          : new Date(0);

    const report = getSlotReadiness(payload, propertyUpdatedAt);
    const slotsToRegen = getStaleMissingSlots(report);

    if (slotsToRegen.length === 0) {
      res.setHeader("Cache-Control", "no-store");
      return res.json({
        propertyId,
        message: "All slots are complete — nothing to draft",
        drafts: [],
        report,
      });
    }

    // For vision group slots (slide1.*), use generatePropertyVisionText so
    // we get one LLM call covering all vision fields.
    const visionSlots = slotsToRegen.filter(
      s => s === "slide1.headerSubtitle" || s === "slide1.visionBullets",
    );
    const nonVisionSlots = slotsToRegen.filter(
      s => s !== "slide1.headerSubtitle" && s !== "slide1.visionBullets",
    );

    const renovBudgetAll = computeRenovationBudget({
      roomCount: propertyRec.roomCount as number | null,
      purchasePrice: propertyRec.purchasePrice as number | null,
      qualityTier: propertyRec.qualityTier as string | null,
      hospitalityType: propertyRec.hospitalityType as string | null,
      renovationScope: propertyRec.renovationScope as string | null,
      isHistoric: propertyRec.isHistoric as boolean | string | null,
    });
    const brief = buildPropertyBrief(
      propertyToSlideProperty(propertyRec),
      { renovationBudget: renovBudgetAll },
    );
    const generatedAt = new Date().toISOString();

    const BATCH_GROUPS: SlotBatchGroup[] = ["operational", "investment", "transformation"];

    try {
      // Fire vision + each batch group in parallel.
      // Vision group uses ONE generatePropertyVisionText call regardless of
      // how many vision slots need drafting (1 or 2) — never one call per slot.
      const [visionResults, ...groupResults] = await Promise.all([
        (async (): Promise<DraftResult[]> => {
          if (visionSlots.length === 0) return [];
          const visionText = await generatePropertyVisionText({
            id: propertyRec.id as number,
            name: propertyRec.name as string,
            city: propertyRec.city as string | null,
            stateProvince: propertyRec.stateProvince as string | null,
            county: propertyRec.county as string | null,
            country: propertyRec.country as string | null,
            purchasePrice: propertyRec.purchasePrice as number | null,
            roomCount: propertyRec.roomCount as number | null,
            startAdr: propertyRec.startAdr as number | null,
            maxOccupancy: propertyRec.maxOccupancy as number | null,
            businessModel: propertyRec.businessModel as string | null,
            hospitalityType: propertyRec.hospitalityType as string | null,
            qualityTier: propertyRec.qualityTier as string | null,
            description: propertyRec.description as string | null,
            acquisitionStatus: propertyRec.acquisitionStatus as string | null,
          });
          const results: DraftResult[] = [];
          if (visionSlots.includes("slide1.headerSubtitle")) {
            const suggestion = { text: visionText.descriptionParagraph ?? "" };
            const validation = validateSlotOutput("slide1.headerSubtitle", suggestion);
            results.push({
              slot: "slide1.headerSubtitle",
              suggestion,
              model: VISION_MODEL,
              generatedAt,
              validationErrors: validation.ok ? undefined : validation.errors,
            });
          }
          if (visionSlots.includes("slide1.visionBullets")) {
            const suggestion = {
              bullets: [
                visionText.visionBullet1,
                visionText.visionBullet2,
                visionText.programmingBullet,
              ]
                .filter((s): s is string => typeof s === "string" && s.length > 0)
                .slice(0, SLIDE1_VISION_BULLETS_COUNT)
                .map(text => ({ text })),
            };
            const validation = validateSlotOutput("slide1.visionBullets", suggestion);
            results.push({
              slot: "slide1.visionBullets",
              suggestion,
              model: VISION_MODEL,
              generatedAt,
              validationErrors: validation.ok ? undefined : validation.errors,
            });
          }
          return results;
        })(),
        // Remaining groups: one LLM call per group
        ...BATCH_GROUPS.map(group =>
          draftGroupBatch(brief, group, nonVisionSlots, generatedAt),
        ),
      ]);

      const allDrafts: DraftResult[] = [...visionResults, ...groupResults.flat()];
      const errored = allDrafts.filter(d => d.validationErrors && d.validationErrors.length > 0);

      res.setHeader("Cache-Control", "no-store");
      return res.json({
        propertyId,
        drafts: allDrafts,
        draftedCount: allDrafts.length,
        errorCount: errored.length,
        report,
        note: "Drafts are not persisted — accept individual slots via PATCH to save.",
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Draft-all generation failed";
      logger.error(
        `[property-deck-payload] draft-all failed for property ${propertyId}: ${message}`,
        "property-deck-payload",
      );
      return res.status(HTTP_500_INTERNAL_SERVER_ERROR).json({ error: message });
    }
  },
);

export { router as propertyDeckPayloadRouter };
