/**
 * shared/price-history.ts
 *
 * Acquisition price-history domain — types, Zod validators, and a single
 * pure roll-up function used by both client and server. The PropertyFinder
 * "Acquisition Pricing" panel reads from these helpers so the timeline,
 * summary line, stale-inventory badge, and motivation-tier hint all derive
 * from the same logic the server uses when persisting roll-ups.
 *
 * A "price event" is a discrete movement on a target's listing — original
 * list, reduction, delist, relist, contract, or a prior arms-length sale.
 * The event types map to the canonical industry vocabulary used by listing
 * services (Zillow / Redfin / LoopNet / Crexi) so analyst exports and
 * Specialist prompts can quote them verbatim.
 *
 * Out of scope here: scraping any portal — that's a separate task. This
 * file just defines the shape, the validation, and the deterministic math
 * over a list of user/Analyst-supplied events.
 */
import { z } from "zod";

export const PRICE_EVENT_KINDS = [
  "list",
  "reduction",
  "delist",
  "relist",
  "contract",
  "prior_sale",
] as const;
export type PriceEventKind = (typeof PRICE_EVENT_KINDS)[number];

/** Human label for a price-event kind, used in timeline rows and exports. */
export const PRICE_EVENT_KIND_LABEL: Record<PriceEventKind, string> = {
  list: "Original list",
  reduction: "Price reduction",
  delist: "Delisted",
  relist: "Re-listed",
  contract: "Under contract",
  prior_sale: "Prior sale",
};

/**
 * Single immutable event on the timeline. `id` is a client-generated UUID
 * so the React list can key on it without round-tripping through the DB.
 */
export interface PriceEvent {
  id: string;
  kind: PriceEventKind;
  /** ISO date string (YYYY-MM-DD). Time-of-day is irrelevant for DOM math. */
  date: string;
  /** Listing price BEFORE the event (only meaningful for reductions). */
  oldPrice?: number | null;
  /** Listing price AFTER the event (e.g. the new asking price). */
  newPrice?: number | null;
  /** Free-text source attribution (Zillow / Redfin / broker email). */
  source?: string | null;
  /** Optional note from the user/Analyst. */
  note?: string | null;
}

export const priceEventSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.enum(PRICE_EVENT_KINDS),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  oldPrice: z.number().finite().nonnegative().nullable().optional(),
  newPrice: z.number().finite().nonnegative().nullable().optional(),
  source: z.string().max(200).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

export const priceEventListSchema = z.array(priceEventSchema).max(200);

/** Input shape for POST `/price-events` — id is generated server-side if absent. */
export const priceEventInputSchema = priceEventSchema.partial({ id: true });
export type PriceEventInput = z.infer<typeof priceEventInputSchema>;

/** Patch shape for PATCH `/price-events/:eventId`. */
export const priceEventPatchSchema = priceEventSchema
  .partial()
  .omit({ id: true });
export type PriceEventPatch = z.infer<typeof priceEventPatchSchema>;

export type MotivationTier = "firm" | "soft" | "motivated" | "distressed";

export const MOTIVATION_TIER_LABEL: Record<MotivationTier, string> = {
  firm: "Firm",
  soft: "Soft",
  motivated: "Motivated",
  distressed: "Distressed",
};

/**
 * Plain-English description of the rule used for each tier — surfaced in
 * the panel's tooltip so the team can see why a target was classified.
 */
export const MOTIVATION_TIER_RULE: Record<MotivationTier, string> = {
  firm: "No meaningful cuts; days-on-market still inside a typical window.",
  soft: "Either a small cut (5–15%) or a long shelf (180+ DOM) without major price action.",
  motivated:
    "A material cut (15–25%) or a long shelf (270+ DOM) with at least one cut, or a delist-then-relist with a reduction.",
  distressed:
    "Deep cumulative cut (≥25%), or multiple relists combined with cuts ≥15% — seller is under pressure.",
};

export interface PriceHistoryRollups {
  originalListPrice: number | null;
  originalListDate: string | null;
  currentPrice: number | null;
  /** Most-recent contract price if known, else null. */
  contractPrice: number | null;
  /** Most-recent prior arms-length sale price/date if known. */
  priorSalePrice: number | null;
  priorSaleDate: string | null;
  /** Dollar drop from original list to current ask (positive = drop). */
  cumulativeDropAmount: number | null;
  /** Percent drop, expressed 0–1 (e.g. 0.169 for a 16.9% drop). */
  cumulativeDropPct: number | null;
  /** Days from the most-recent (re)list to today / contract. */
  currentDom: number | null;
  /** Count of distinct delist→relist cycles. */
  relistCount: number;
  /** Number of price reductions over the life of the listing. */
  reductionCount: number;
  /** True when the listing has been delisted-then-relisted at least once. */
  isStale: boolean;
  motivationTier: MotivationTier;
  /** ISO timestamp of the most-recent event, used as a "last update" hint. */
  lastEventAt: string | null;
}

const DAYS_PER_MS = 1 / (1000 * 60 * 60 * 24);
const DOM_SOFT_THRESHOLD = 180;
const DOM_MOTIVATED_THRESHOLD = 270;
const DROP_PCT_SOFT = 0.05;
const DROP_PCT_MOTIVATED = 0.15;
const DROP_PCT_DISTRESSED = 0.25;

function daysBetween(fromIso: string, toIso: string): number {
  const fromMs = Date.parse(fromIso);
  const toMs = Date.parse(toIso);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return 0;
  return Math.max(0, Math.round((toMs - fromMs) * DAYS_PER_MS));
}

/**
 * Sort events oldest → newest. Events on the same day fall back to the
 * canonical kind order so a "list" precedes a same-day "reduction".
 */
function sortChronological(events: readonly PriceEvent[]): PriceEvent[] {
  const kindOrder: Record<PriceEventKind, number> = {
    prior_sale: 0,
    list: 1,
    reduction: 2,
    delist: 3,
    relist: 4,
    contract: 5,
  };
  return [...events].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return kindOrder[a.kind] - kindOrder[b.kind];
  });
}

/**
 * Compute roll-ups from an unsorted event list. Pure: same input always
 * yields the same output, so server and client agree on what the panel
 * should render.
 *
 * `nowIso` is injected to keep the function deterministic for tests; in
 * production callers pass `new Date().toISOString()`.
 */
export function computePriceHistoryRollups(
  events: readonly PriceEvent[],
  nowIso: string = new Date().toISOString(),
): PriceHistoryRollups {
  const sorted = sortChronological(events);
  const today = nowIso.slice(0, 10);

  let originalListPrice: number | null = null;
  let originalListDate: string | null = null;
  let currentPrice: number | null = null;
  let contractPrice: number | null = null;
  let priorSalePrice: number | null = null;
  let priorSaleDate: string | null = null;
  let lastListDate: string | null = null;
  let lastDelistDate: string | null = null;
  let contractDate: string | null = null;
  let relistCount = 0;
  let reductionCount = 0;
  let lastEventAt: string | null = null;

  for (const ev of sorted) {
    lastEventAt = ev.date;
    switch (ev.kind) {
      case "prior_sale":
        if (ev.newPrice != null) priorSalePrice = ev.newPrice;
        priorSaleDate = ev.date;
        break;
      case "list":
        if (originalListPrice == null && ev.newPrice != null) {
          originalListPrice = ev.newPrice;
          originalListDate = ev.date;
        }
        if (ev.newPrice != null) currentPrice = ev.newPrice;
        lastListDate = ev.date;
        break;
      case "reduction":
        if (ev.newPrice != null) currentPrice = ev.newPrice;
        reductionCount += 1;
        break;
      case "delist":
        lastDelistDate = ev.date;
        break;
      case "relist":
        relistCount += 1;
        if (ev.newPrice != null) currentPrice = ev.newPrice;
        lastListDate = ev.date;
        lastDelistDate = null;
        break;
      case "contract":
        if (ev.newPrice != null) contractPrice = ev.newPrice;
        contractDate = ev.date;
        break;
    }
  }

  let cumulativeDropAmount: number | null = null;
  let cumulativeDropPct: number | null = null;
  if (originalListPrice != null && currentPrice != null && originalListPrice > 0) {
    cumulativeDropAmount = originalListPrice - currentPrice;
    cumulativeDropPct = cumulativeDropAmount / originalListPrice;
  }

  let currentDom: number | null = null;
  if (lastListDate && !lastDelistDate) {
    const endIso = contractDate ?? today;
    currentDom = daysBetween(lastListDate, endIso);
  }

  const isStale = relistCount > 0;

  // Motivation tier. Walk from strictest to loosest so the highest-pressure
  // rule that fires wins.
  let motivationTier: MotivationTier = "firm";
  const dropPct = cumulativeDropPct ?? 0;
  const dom = currentDom ?? 0;
  if (
    dropPct >= DROP_PCT_DISTRESSED ||
    (relistCount >= 2 && dropPct >= DROP_PCT_MOTIVATED)
  ) {
    motivationTier = "distressed";
  } else if (
    dropPct >= DROP_PCT_MOTIVATED ||
    (dom >= DOM_MOTIVATED_THRESHOLD && reductionCount >= 1) ||
    (relistCount >= 1 && reductionCount >= 1)
  ) {
    motivationTier = "motivated";
  } else if (dropPct >= DROP_PCT_SOFT || dom >= DOM_SOFT_THRESHOLD) {
    motivationTier = "soft";
  }

  return {
    originalListPrice,
    originalListDate,
    currentPrice,
    contractPrice,
    priorSalePrice,
    priorSaleDate,
    cumulativeDropAmount,
    cumulativeDropPct,
    currentDom,
    relistCount,
    reductionCount,
    isStale,
    motivationTier,
    lastEventAt,
  };
}

/** Format the rollups into the headline summary sentence. */
export function formatPriceHistorySummary(r: PriceHistoryRollups): string | null {
  if (
    r.originalListPrice == null ||
    r.currentPrice == null ||
    r.cumulativeDropPct == null
  ) {
    return null;
  }
  const fmtMoney = (n: number) => {
    if (Math.abs(n) >= 1_000_000) {
      return `$${(n / 1_000_000).toFixed(1)}M`;
    }
    if (Math.abs(n) >= 1_000) {
      return `$${(n / 1_000).toFixed(0)}K`;
    }
    return `$${n.toFixed(0)}`;
  };
  const pct = (r.cumulativeDropPct * 100).toFixed(1);
  const sign = r.cumulativeDropPct >= 0 ? "-" : "+";
  const cuts = r.reductionCount;
  const cutsLabel = cuts === 1 ? "1 cut" : `${cuts} cuts`;
  let monthsLabel = "";
  if (r.currentDom != null) {
    const months = Math.round(r.currentDom / 30);
    monthsLabel = months <= 1 ? `${r.currentDom}d` : `${months}mo`;
  }
  const orig = fmtMoney(r.originalListPrice);
  const cur = fmtMoney(r.currentPrice);
  const tail = monthsLabel ? ` over ${monthsLabel}` : "";
  return `Listed ${orig} → currently ${cur}, ${sign}${pct}% across ${cutsLabel}${tail}.`;
}

/** Compact chip text for list/grid rows: "-16.9% / 7mo". */
export function formatPriceHistoryChip(r: PriceHistoryRollups): string | null {
  if (r.cumulativeDropPct == null && r.currentDom == null) return null;
  const parts: string[] = [];
  if (r.cumulativeDropPct != null) {
    const sign = r.cumulativeDropPct >= 0 ? "-" : "+";
    parts.push(`${sign}${(r.cumulativeDropPct * 100).toFixed(1)}%`);
  }
  if (r.currentDom != null) {
    const months = Math.round(r.currentDom / 30);
    parts.push(months <= 1 ? `${r.currentDom}d` : `${months}mo`);
  }
  return parts.join(" / ");
}
