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
 *     adjacent place the LLM is invoked; `build-payload.ts` is now LLM-free.
 *     A property → property-deck-payload.payload is now reproducible: the
 *     same property ID renders the same PDF on every call.
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
} from "@shared/deck-payload-v2";
import { getAnthropicClient } from "../ai/clients";
import {
  HTTP_400_BAD_REQUEST,
  HTTP_404_NOT_FOUND,
  HTTP_500_INTERNAL_SERVER_ERROR,
} from "../constants";

const router = Router();

const DRAFT_MODEL = "claude-opus-4-6";

// Fallback property values used when the DB row has no value for a field.
const DEFAULT_ROOM_COUNT = 10;
const DEFAULT_START_ADR = 350;
const DEFAULT_OCCUPANCY_RATE = 0.7;

// Token budgets for each slot's LLM call — sized to the slot's character cap.
const SUBTITLE_DRAFT_MAX_TOKENS = 120;
const BULLETS_DRAFT_MAX_TOKENS = 300;

// Slots the draft endpoint knows how to fill. Each maps to a sub-path of the
// DeckPayloadV2 tree. Adding a new draftable slot requires (a) adding it
// here, (b) handling it in `draftSlot()` below, (c) adding a UI control in
// the editor — there is no reflection.
const DRAFT_SLOTS = ["slide1.headerSubtitle", "slide1.visionBullets"] as const;
type DraftSlot = typeof DRAFT_SLOTS[number];

function isDraftSlot(s: unknown): s is DraftSlot {
  return typeof s === "string" && (DRAFT_SLOTS as readonly string[]).includes(s);
}

interface DraftResult {
  slot: DraftSlot;
  suggestion: unknown; // shape depends on the slot — see draftSlot()
  model: string;
  generatedAt: string;
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
}

// ── Slot-specific LLM drafters ────────────────────────────────────────────

/**
 * Draft a single description sentence for slide1.headerSubtitle.
 * Returns a plain string (truncated to SLIDE1_HEADER_SUBTITLE_MAX).
 */
async function draftHeaderSubtitle(property: {
  name: string;
  city?: string | null;
  stateProvince?: string | null;
  roomCount?: number | null;
  startAdr?: number | null;
  businessModel?: string | null;
  description?: string | null;
}): Promise<string> {
  const location = [property.city, property.stateProvince].filter(Boolean).join(", ");
  const rooms = property.roomCount ?? DEFAULT_ROOM_COUNT;
  const adr = property.startAdr ?? DEFAULT_START_ADR;

  const fallback = (
    property.description?.slice(0, SLIDE1_HEADER_SUBTITLE_MAX) ??
    `A repositioned boutique property in ${location || "an emerging market"} targeting $${adr} ADR across ${rooms} keys.`.slice(0, SLIDE1_HEADER_SUBTITLE_MAX)
  );

  try {
    const anthropic = getAnthropicClient();
    const response = await anthropic.messages.create({
      model: DRAFT_MODEL,
      max_tokens: SUBTITLE_DRAFT_MAX_TOKENS,
      messages: [
        {
          role: "user",
          content: `Write one investor-grade description sentence for a boutique hospitality property.

Property: "${property.name}"
Location: ${location || "Not specified"}
Type: ${property.businessModel ?? "Boutique Hotel"}
Rooms: ${rooms}
ADR: $${adr}

Rules:
- Max ${SLIDE1_HEADER_SUBTITLE_MAX} characters
- One sentence, direct, metric-driven
- No adjectives like "unique", "exciting", "world-class"
- Return ONLY the sentence — no quotes, no explanation`,
        },
      ],
    });

    const textBlock = response.content.find(b => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return fallback;

    return textBlock.text.trim().slice(0, SLIDE1_HEADER_SUBTITLE_MAX);
  } catch (err: unknown) {
    logger.warn(
      `[property-deck-payload] headerSubtitle LLM failed (using fallback): ${err instanceof Error ? err.message : String(err)}`,
      "property-deck-payload",
    );
    return fallback;
  }
}

/**
 * Draft vision bullets for slide1.visionBullets.
 * Returns an array of { text } objects, length = SLIDE1_VISION_BULLETS_COUNT.
 */
async function draftVisionBullets(property: {
  name: string;
  city?: string | null;
  stateProvince?: string | null;
  roomCount?: number | null;
  startAdr?: number | null;
  maxOccupancy?: number | null;
  businessModel?: string | null;
}): Promise<Array<{ text: string }>> {
  const location = [property.city, property.stateProvince].filter(Boolean).join(", ");
  const rooms = property.roomCount ?? DEFAULT_ROOM_COUNT;
  const adr = property.startAdr ?? DEFAULT_START_ADR;
  const occ = Math.round((property.maxOccupancy ?? DEFAULT_OCCUPANCY_RATE) * 100);

  const fallbackBullets: Array<{ text: string }> = [
    { text: `Year-Round Demand: Drive-Market Leisure + Weekend Escapes + Local Events`.slice(0, SLIDE1_VISION_BULLET_MAX) },
    { text: `Direct Booking Focus: 50%+ Direct Mix by Year 3, Reducing OTA Dependency`.slice(0, SLIDE1_VISION_BULLET_MAX) },
    { text: `Revenue Mix: 70% Rooms, 20% F&B, 10% Events & Packages`.slice(0, SLIDE1_VISION_BULLET_MAX) },
  ].slice(0, SLIDE1_VISION_BULLETS_COUNT);

  try {
    const anthropic = getAnthropicClient();
    const response = await anthropic.messages.create({
      model: DRAFT_MODEL,
      max_tokens: BULLETS_DRAFT_MAX_TOKENS,
      messages: [
        {
          role: "user",
          content: `Write exactly ${SLIDE1_VISION_BULLETS_COUNT} investor-grade bullet points for a boutique hospitality property vision slide.

Property: "${property.name}"
Location: ${location || "Not specified"}
Type: ${property.businessModel ?? "Boutique Hotel"}
Rooms: ${rooms}
ADR: $${adr}
Stabilized Occupancy: ${occ}%

Rules:
- Each bullet max ${SLIDE1_VISION_BULLET_MAX} characters
- Punchy, metric-driven
- No adjectives like "unique", "exciting", "world-class"
- Return ONLY valid JSON array: [{"text":"..."},{"text":"..."},{"text":"..."}]`,
        },
      ],
    });

    const textBlock = response.content.find(b => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return fallbackBullets;

    const parsed = JSON.parse(stripCodeFences(textBlock.text)) as Array<{ text: string }>;
    if (!Array.isArray(parsed)) return fallbackBullets;

    return parsed
      .filter((b): b is { text: string } => typeof b?.text === "string" && b.text.length > 0)
      .slice(0, SLIDE1_VISION_BULLETS_COUNT)
      .map(b => ({ text: b.text.slice(0, SLIDE1_VISION_BULLET_MAX) }));
  } catch (err: unknown) {
    logger.warn(
      `[property-deck-payload] visionBullets LLM failed (using fallback): ${err instanceof Error ? err.message : String(err)}`,
      "property-deck-payload",
    );
    return fallbackBullets;
  }
}

// ── Draft orchestrator ────────────────────────────────────────────────────

/**
 * Draft a single slot via the LLM. Returns the proposal; does NOT persist.
 * The editor decides whether to accept (then PATCH the slot with
 * provenance.source="llm") or reject.
 */
async function draftSlot(propertyId: number, slot: DraftSlot): Promise<DraftResult> {
  const property = await storage.getProperty(propertyId);
  if (!property) throw new Error("Property not found");

  const generatedAt = new Date().toISOString();
  const model = DRAFT_MODEL;

  if (slot === "slide1.headerSubtitle") {
    const text = await draftHeaderSubtitle(property);
    return { slot, suggestion: { text }, model, generatedAt };
  }

  if (slot === "slide1.visionBullets") {
    const bullets = await draftVisionBullets(property);
    return { slot, suggestion: { bullets }, model, generatedAt };
  }

  throw new Error(`Unsupported draft slot: ${slot}`);
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
      // slide1.photoCaptions is the only nested sub-object on slide 1 — its
      // {hero, secondary, inset} children are independently authored slots.
      // Deep-merge so a PATCH targeting only one caption (e.g. {hero}) does
      // not erase the sibling captions.
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
    const slot = (req.body as { slot?: unknown } | undefined)?.slot;
    if (!isDraftSlot(slot)) {
      return res.status(HTTP_400_BAD_REQUEST).json({
        error: "Invalid or missing 'slot'",
        allowedSlots: DRAFT_SLOTS,
      });
    }
    // Surface a missing property as 404 instead of letting draftSlot's
    // internal Error bubble out as a generic 500.
    const property = await storage.getProperty(propertyId);
    if (!property) {
      return res.status(HTTP_404_NOT_FOUND).json({ error: "Property not found" });
    }
    try {
      const result = await draftSlot(propertyId, slot);
      res.setHeader("Cache-Control", "no-store");
      return res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Draft generation failed";
      logger.error(
        `[property-deck-payload] Draft failed for property ${propertyId} slot ${slot}: ${message}`,
        "property-deck-payload",
      );
      return res.status(HTTP_500_INTERNAL_SERVER_ERROR).json({ error: message });
    }
  },
);

export { router as propertyDeckPayloadRouter };
