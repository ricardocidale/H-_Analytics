---
title: "Portfolio investor deck with per-slide property assignment: composite payload over multi-pass rendering"
date: 2026-05-04
last_updated: 2026-05-06
category: architecture-patterns
module: slides
problem_type: architecture_pattern
component: service_object
severity: high
applies_when:
  - "A single investor deck must render 6 slides where each slide references a DIFFERENT property chosen by an admin"
  - "The existing render pipeline is per-entity (one payload per property) and you need to reuse it for a portfolio-level deck"
  - "The temptation is to run N separate Playwright passes and merge the resulting PDFs"
  - "You need to extend a per-property financial table (e.g. 5-year pro forma) to a portfolio aggregate (10-year) without breaking existing per-property renders"
related_components:
  - database
  - background_job
  - documentation
tags:
  - slides
  - playwright
  - composite-payload
  - lb-slide-deck
  - portfolio
  - architecture
  - pdf-generation
---

# Portfolio investor deck with per-slide property assignment: composite payload over multi-pass rendering

> **Update (2026-05-06):** The composite payload described here is now produced by per-slide specialist team Builders (Sofia / Bianca / Chiara / Dario / Elisa / Felix) rather than by a single rendering route. The Option B / single-Playwright-pass / one R2 key / one cache manifest decisions all stand; what changed is the producer side. See [Agent-Native Precision Pipeline Pattern](./agent-native-precision-pipeline-pattern-2026-05-06.md) for the per-team factory line and Marco orchestrator that now drive composite-payload assembly.

## Context

The H+ Analytics platform has a per-property 6-slide investor deck pipeline:
`buildSlidePayload(propertyId)` → `SlidePayload` → Playwright navigates
`/internal/deck/:propertyId` → one `page.pdf()` call → PDF cached in R2.

The LB Slide Deck requirement changed the shape of the problem: instead of
6 slides all about one property, the new deck is one portfolio presentation
where **each slide may reference a different property** (admin-selected via
`lb_slides_config`), and two slides (4 and 6) are always auto-generated
from the full portfolio.

The instinctive solution — Option A — is to run each slide as a separate
Playwright render and merge the 6 PDFs. The chosen solution — Option B —
is to build one composite payload containing all 6 per-slide sub-payloads
and render the whole deck in a single Playwright pass.

## Guidance

### Pick Option B (composite payload, single Playwright pass) over Option A (multi-pass + PDF merge)

**Option A — Multi-pass rendering:**
- 6 separate Playwright page launches
- 6 R2 uploads (one per slide PDF)
- PDF merge step (pdf-lib or similar) to combine into one download
- Up to 6 separate cache manifests to track
- On partial failure: hard to produce a partial deck cleanly

**Option B — Composite payload, single Playwright pass (recommended):**
- One new payload shape: `LbSlidePayload { slides: SlidePayload[6] }`
- One new React route: `/internal/lb-deck` receives the composite payload via short-TTL token
- One Playwright `page.pdf()` call with `format: "A4"` or landscape 16:9
- One R2 upload: `lb-slides/pdf/{DECK_LOGIC_VERSION}/lb-deck.pdf`
- One cache manifest entry

The decisive advantage: the existing `Slide1`…`Slide6` components already
accept a `SlidePayload` prop. A new `LbInternalDeck.tsx` simply passes each
slide its own slice:

```tsx
// LbInternalDeck.tsx — one render, six different payloads
export function LbInternalDeck({ lb }: { lb: LbSlidePayload }) {
  return (
    <>
      <Slide1 p={lb.slides[0]} />  {/* admin-picked property */}
      <Slide2 p={lb.slides[1]} />  {/* admin-picked property */}
      <Slide3 p={lb.slides[2]} />  {/* admin-picked property */}
      <Slide4 p={lb.slides[3]} />  {/* auto — portfolio grid */}
      <Slide5 p={lb.slides[4]} />  {/* admin-picked property */}
      <Slide6 p={lb.slides[5]} />  {/* auto — 10-yr aggregated */}
    </>
  );
}
```

No PDF merge library required. No partial-failure coordination logic.
One Playwright render budget instead of six.

### Keep the new LB pipeline completely parallel to the existing per-property pipeline

Do **not** modify the existing routes, components, or storage methods.
The guard rails:

| Concern | Per-property pipeline | LB pipeline |
|---------|----------------------|-------------|
| Token format | `propertyId.expiresAt.sig` | `"lb".expiresAt.sig` |
| JWT kind claim | `kind: "property"` | `kind: "lb"` |
| React route | `/internal/deck/:propertyId` | `/internal/lb-deck` |
| API payload route | `/api/properties/:id/deck-payload` | `/api/lb-slides/deck-payload` |
| API PDF route | `/api/properties/:id/deck.pdf` | `/api/lb-slides/render` |
| R2 key | `slides/pdf/{v}/property-{id}.pdf` | `lb-slides/pdf/{v}/lb-deck.pdf` |
| DB table | `property_deck_payloads` | `lb_slides_config` (single row) |
| Storage class | `PropertyDecksStorageImpl` | `LbSlidesStorageImpl` |

Verifiers must reject cross-namespace tokens:

```ts
// verifyLbDeckToken rejects any token where kind !== "lb"
function verifyLbDeckToken(token: string): VerifyLbResult {
  const { kind } = parseToken(token);
  if (kind !== "lb") return { ok: false, reason: "wrong-kind" };
  // ...
}
```

### Extend per-slide financial tables backwards-safely with optional payload fields

The LB Slide 6 needs a 10-year aggregated income statement instead of the
existing 5-year per-property pro forma. **Do not change the global constant.**
Instead, add an optional override field to `SlidePayload`:

```ts
// In SlidePayload type — additive, backwards-safe
projYears?: number;      // undefined → falls back to PROFORMA_YEARS (5)
usaliMode?: boolean;     // undefined → false (compact non-USALI layout)
```

In the `Slide6` component:

```tsx
const projYears = p.projYears ?? PROFORMA_YEARS; // 5 for per-property, 10 for LB
const years = financials.yearlyIS.slice(0, projYears);
const title = `${projYears}-YEAR CONSOLIDATED PRO FORMA INCOME STATEMENT`;
```

The `buildLbPayload` function sets `projYears: 10, usaliMode: true` on slide
6's payload. Per-property payloads never set these fields, so `Slide6`
continues to render the 5-year compact layout unchanged.

### Portfolio financial aggregation for Slide 6

Use `aggregateUnifiedByYear` (from `@engine/aggregation/yearlyAggregator`,
already used in `routes/finance.ts`) across all user properties at 10 years.
Construct a synthetic `SlidePayload` for slide 6:

```ts
const agg = await aggregateUnifiedByYear(allPropertyResults, 10);
const slide6Payload: SlidePayload = {
  property: { name: "Portfolio — Combined Properties", ...emptyPropertyFields },
  financials: {
    yearlyIS: agg.yearlyIS,
    yearlyCF: agg.yearlyCF,
    loan: agg.loan,
    irr: agg.portfolioIrr,
    exitValue: agg.exitValue,
    equityMultiple: agg.equityMultiple,
  },
  photos: [],
  siblings: [],
  projYears: 10,
  usaliMode: true,
};
```

The USALI accordion rows in Slide 6 are **decorative in PDF context** (no
interactivity). Render them closed with a `▶` prefix. The row set:
Revenue, Departmental Expenses, Undistributed Expenses, GOP, Management
Fees, Fixed Charges, NOI, FF&E Reserve, ANOI, Debt Service, Net Cash Flow,
Cumulative CF.

### DB config table: single-row upsert pattern

The LB Slide Deck has exactly ONE configuration (no per-user, no per-property
variant). Store it in a single-row table always upserted at `id = 1`:

```ts
export const lbSlidesConfig = pgTable("lb_slides_config", {
  id: integer("id").primaryKey().default(1),
  slide1PropertyId: integer("slide1_property_id").references(() => properties.id),
  slide2PropertyId: integer("slide2_property_id").references(() => properties.id),
  slide3PropertyId: integer("slide3_property_id").references(() => properties.id),
  slide5PropertyId: integer("slide5_property_id").references(() => properties.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`NOW()`),
});
```

Storage methods:

```ts
getLbSlidesConfig(): Promise<LbSlidesConfig | null>
upsertLbSlidesConfig(patch: Partial<LbSlidesConfigInsert>): Promise<LbSlidesConfig>
```

## Why This Matters

- **Performance:** One Playwright launch vs six. Playwright startup + navigation
  is the dominant cost (~1–2 s per launch). Six launches = 6–12 s overhead
  before any rendering work.
- **Reliability:** PDF merge libraries introduce a dependency and a failure mode
  that does not exist in the single-pass approach. Partial decks are hard to
  detect and surface to the user cleanly.
- **Simplicity:** No pdf-lib, no buffer concatenation, no page-count tracking.
  The composite payload is a plain TypeScript object; no new infrastructure.
- **Isolation:** The existing per-property pipeline remains completely untouched.
  A bug in the LB pipeline cannot affect per-property renders and vice versa.
- **Cache coherence:** One R2 key, one manifest entry, one invalidation event.
  With six keys you need to decide whether "all 6 ready" or "any 1 ready" is
  the readiness signal, and handle partial staleness.

## When to Apply

Apply when:
1. A document renderer accepts a single entity payload per render, and you
   need a composite document that mixes data from N different entities.
2. The component tree already takes the payload as a prop — composition is
   free.
3. The number of sections (slides, pages, chapters) is small and bounded at
   build time.
4. You control both the payload builder and the render route.

Prefer multi-pass (Option A) when:
- The sections are user-dynamic (the user picks any subset in any order from
  a large set), making a single composite payload too large or variable.
- Each section needs its own downloadable artifact independently of the
  combined document.
- The render route is a third-party service you do not control.

## Examples

**Composite payload builder sketch:**

```ts
// build-lb-payload.ts
export async function buildLbPayload(
  config: LbSlidesConfig,
  userId: number,
  db: Db
): Promise<LbSlidePayload> {
  const [s1, s2, s3, s5] = await Promise.all([
    buildSlidePayload(config.slide1PropertyId, userId, 5),
    buildSlidePayload(config.slide2PropertyId, userId, 5),
    buildSlidePayload(config.slide3PropertyId, userId, 5),
    buildSlidePayload(config.slide5PropertyId, userId, 5),
  ]);
  const allProperties = await db.query.properties.findMany({ where: ... });
  const slide4 = await buildPortfolioGridPayload(allProperties);
  const slide6 = await buildAggregatedSlide6Payload(allProperties, 10);
  return { slides: [s1, s2, s3, slide4, s5, slide6], config };
}
```

**Token namespace separation:**

```ts
// signLbDeckToken — LB-specific, no propertyId
function signLb(expiresAtMs: number): string {
  const h = crypto.createHmac("sha256", getKey());
  h.update(`lb:${expiresAtMs}`);  // "lb:" prefix distinguishes namespace
  return h.digest("base64url");
}

export function signLbDeckToken(ttlMs = DECK_TOKEN_TTL_MS): SignedLbDeckToken {
  const expiresAtMs = Date.now() + ttlMs;
  return { token: `lb.${expiresAtMs}.${signLb(expiresAtMs)}`, expiresAtMs };
}
```

## Related

- `docs/solutions/architecture-patterns/agent-native-precision-pipeline-pattern-2026-05-06.md` —
  agent-native overlay that produces the composite payload via per-slide specialist team
  Builders + Marco orchestrator + tabbed admin UX, with hallucination defenses on every LLM stage.
- `docs/solutions/architecture-patterns/slide-deck-generation-decision-reversal-2026-05-03.md` —
  decision record: Playwright HTML→PDF replaced the two-format PPTX pipeline; orthogonal to the composite payload pattern.
- `docs/solutions/architecture-patterns/slide-payload-slot-specific-schema-2026-05-03.md` —
  related: per-slot semantics inside `SlidePayload`; this doc is about how
  to compose multiple payloads across slides, not the internal shape of each.
- `docs/plans/lb-slide-deck-plan.md` — full implementation plan (U1–U8).
- `docs/handoffs/lb-slides-replit-handoff.md` — original 6-part spec.
- `artifacts/api-server/src/slides/build-payload.ts` — the per-property builder reused in `buildLbPayload`.
- `artifacts/api-server/src/slides/internal-token.ts` — the per-property token pattern being extended.
