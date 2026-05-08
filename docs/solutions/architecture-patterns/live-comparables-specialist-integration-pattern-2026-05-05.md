---
title: "Live-Comparables Specialist Integration Pattern: Fault-Tolerant External API Fetching with Canned Fallback"
date: 2026-05-05
category: architecture-patterns
module: specialists-live-comparables
problem_type: architecture_pattern
component: service_object
severity: medium
applies_when:
  - "Implementing specialist comparable functions that require live external data with a reliable canned fallback"
  - "Wiring heterogeneous data sources (free public APIs, paid RapidAPI, Apify scrapers) into specialist runners"
  - "Deriving financial rates from observable market proxies (e.g., OTA commission from ADR-based booking-mix)"
  - "Adding new external integrations to the seed registry (seed-external-integrations.ts)"
tags:
  - live-comparables
  - fault-tolerance
  - ota-commission
  - canned-fallback
  - specialists
  - rapidapi
  - stale-while-revalidate
  - named-constants
related_components:
  - assistant
  - database
  - tooling
---

# Live-Comparables Specialist Integration Pattern: Fault-Tolerant External API Fetching with Canned Fallback

## Context

NAI-33, NAI-34, and NAI-35 required wiring live external data into the Revenue, Overhead, and PropertyDefaults specialist comparable functions. Before this work, all three functions were single-line stubs:

```typescript
// Before — stub returning only static data
export async function getRevenueComparables(): Promise<readonly RevenueComparableRow[]> {
  return getCannedRevenueComparables();
}
```

The canned datasets are reliable but static — they cannot reflect live market shifts such as daily-changing OTA commission rates or breaking industry news. The goal was to replace the stubs with live, fault-tolerant fetchers while preserving the canned dataset as an always-available fallback.

This is the second instance of this pattern in the codebase. The first is `getLpComparables` (Funding specialist), which fetches live EDGAR Form D filings and appends the canned set for depth. That implementation served as the reference template.

## Guidance

### 1. Fault-Tolerant Parallelism + Minimum-Row Fallback Guard

Run all live sources concurrently with `Promise.allSettled`. Never use `Promise.all` — a single API timeout cannot be allowed to cascade-fail the entire comparable set. After collecting results, count qualifying rows against a named minimum threshold constant. If the count falls below the threshold, return the full canned set unchanged.

```typescript
// Reusable type guard — avoids repetitive .status === "fulfilled" checks
function isFulfilled<T>(r: PromiseSettledResult<T>): r is PromiseFulfilledResult<T> {
  return r.status === "fulfilled";
}

export async function getRevenueComparables(): Promise<readonly RevenueComparableRow[]> {
  const canned = getCannedRevenueComparables();
  const today  = new Date().toISOString().slice(0, 10);

  const [wikiHotelFnB, wikiRevMgmt, cnbc] = await Promise.allSettled([
    fetchWikipediaSummary("Hotel_food_and_beverage"),   // 8 s AbortSignal.timeout inside
    fetchWikipediaSummary("Revenue_management"),
    fetchCNBCHeadlines("boutique hotel food beverage revenue mix percentage"),
  ]);

  const liveSources = [
    isFulfilled(wikiHotelFnB) && wikiHotelFnB.value
      ? "Wikipedia: Hotel food and beverage (en.wikipedia.org/wiki/Hotel_food_and_beverage)"
      : null,
    isFulfilled(wikiRevMgmt) && wikiRevMgmt.value
      ? "Wikipedia: Revenue management (en.wikipedia.org/wiki/Revenue_management)"
      : null,
    isFulfilled(cnbc) && cnbc.value.length > 0
      ? `CNBC News: "${cnbc.value[0]}"`
      : null,
  ].filter((s): s is string => s !== null);

  if (liveSources.length < LIVE_MIN_REVENUE_LIVE_ROWS) {
    return canned; // Fallback — fewer live sources than minimum threshold
  }

  const liveRow: RevenueComparableRow = {
    // Values = canonical benchmark MIDs from @shared/constants-revenue-benchmarks
    source: `Live (${today}) | ${liveSources.join(" | ")}`,
    // ...
  };

  return [liveRow, ...canned]; // Live row first, canned appended for depth
}
```

**Key**: every individual fetch helper wraps the network call in `AbortSignal.timeout(FETCH_TIMEOUT_MS)` (8 s) so slow responses never stall `Promise.allSettled`:

```typescript
async function fetchWikipediaSummary(pageTitle: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), // fires if no response in 8 s
      headers: { "User-Agent": WIKIPEDIA_UA },
    });
    if (!res.ok) return null;
    const data = await res.json() as { extract?: string };
    return data.extract ?? null;
  } catch {
    return null; // AbortError, NetworkError, etc. all become null — never throws
  }
}
```

**Threshold calibration:** Set minimum thresholds deliberately low (1 for Revenue and Overhead, 2 for PropertyDefaults). Even a single Wikipedia page hit is enough to promote live mode — the goal is to surface provenance and recency, not to replace the canned dataset entirely.

### 2. OTA Commission Derivation Pattern (PropertyDefaults — NAI-35)

When a financial rate is not directly exposed by an API, derive it from an observable market proxy. Booking.com hotel search returns room pricing (ADR). ADR is used to infer the guest price-sensitivity segment, which determines the OTA booking-mix fraction, which in turn drives the commission rate:

```
salesCommissionRate = adjustedOtaMixFraction × LIVE_OTA_COMMISSION_BOOKING_COM_FRACTION
```

ADR-based mix selection:

```typescript
const adjustedMix = avgAdr < LIVE_BOOKING_ADR_BUDGET_THRESHOLD_USD
  ? LIVE_OTA_MIX_HEAVY_FRACTION      // 0.45 — budget hotels skew OTA-heavy
  : otaMixFraction;                   // city default (0.30 standard, 0.45 urban)

const salesCommissionRate = parseFloat(
  (adjustedMix * LIVE_OTA_COMMISSION_BOOKING_COM_FRACTION).toFixed(4),
);
```

The row's `source` string must document the full derivation chain:

```
"Booking.com live search (New York, 2026-05-05, avg $312/night, n=8) | OTA mix 30% × 20% commission = 6.0% blended"
```

This makes every PropertyDefaults row self-auditable: a financial analyst can reconstruct the commission without reading the code.

### 3. Stale-While-Revalidate Cache for Daily-Change Data

OTA room rates change daily. Cache them for 12 hours — long enough to avoid redundant actor runs, short enough to stay meaningful. Wrap the inner fetch in `cache.staleWhileRevalidate`:

```typescript
export async function getPropertyDefaultsComparables(): Promise<
  readonly PropertyDefaultsComparableRow[]
> {
  const canned = getCannedPropertyDefaultsComparables();

  const liveRows = await cache.staleWhileRevalidate<PropertyDefaultsComparableRow[]>(
    "live-comparables:property-defaults:booking-com",
    LIVE_OTA_CACHE_TTL_SECONDS,   // 12 * 60 * 60 — named constant
    () => fetchPropertyDefaultsLive(),
  );

  if (liveRows.length < LIVE_MIN_PROPERTY_DEFAULTS_LIVE_ROWS) {
    return canned;
  }

  const liveLocales = new Set(liveRows.map((r) => r.locale));
  const cannedFill  = canned.filter((r) => !liveLocales.has(r.locale));
  return [...liveRows, ...cannedFill]; // Canned fills locales not covered by live
}
```

Cache intervals by data freshness:
- **12 h** — OTA nightly rates (Booking.com), STR pricing
- **24 h** — Business intelligence (LinkedIn, Crunchbase), EDGAR filings
- **Static** — Wikipedia article summaries, REST Countries data (fetched fresh on each call; low cost, no rate limit)

### 4. Multi-Tiered Source Hierarchy

Organise live integrations into cost/stability tiers to choose the right source for each use case:

| Tier | Examples | Auth | Cost | Use case |
|------|----------|------|------|----------|
| **Free public** | Wikipedia REST, REST Countries | None | Free | Context/provenance rows; always on |
| **Paid RapidAPI** | Booking.com (KEY_2), Alpha Vantage (KEY_3), CNBC (KEY_3) | `RAPIDAPI_KEY_2 / KEY_3` | Per-call | Live rates, financial overviews, news |
| **Apify actors** | LinkedIn, Crunchbase, Bloomberg, WSJ | `APIFY_API_TOKEN` | Per run | Deep biz-intel; 24 h cache |

Every function must gate on key presence before calling paid sources:

```typescript
async function fetchCNBCHeadlines(topic: string): Promise<string[]> {
  const key = process.env.RAPIDAPI_KEY_3;
  if (!key) return [];   // Graceful no-op when key is absent
  // ...
}
```

### 5. Named Constants with Source Citations

Every numeric literal — commission rate, ADR threshold, lead days, mix fraction — must be a named constant in `constants.ts` with an inline JSDoc citing the authority. This creates an audit trail for the financial model.

```typescript
/** Booking.com host-side commission on confirmed reservations. Standard bracket 15–25%
 *  of room revenue; median used. Source: Booking.com Partner Hub 2024. */
export const LIVE_OTA_COMMISSION_BOOKING_COM_FRACTION = 0.20;

/** OTA booking-mix fraction for OTA-heavy urban boutique hotels (~45% of bookings via
 *  OTA channels). Source: AHLA Distribution Cost Study 2024. */
export const LIVE_OTA_MIX_HEAVY_FRACTION = 0.45;

/** ADR threshold (USD/night): hotels below this rate are assumed OTA-heavy. */
export const LIVE_BOOKING_ADR_BUDGET_THRESHOLD_USD = 200;
```

The magic-numbers ratchet (`check:magic-numbers`) enforces this automatically — any raw literal in business logic triggers a CI failure.

### 6. Seed Registry Upsert (onConflictDoNothing Loop)

New external integrations must be registered in `seed-external-integrations.ts`. The seed function must use `onConflictDoNothing()` per-row iteration — **not** an early-return guard — so it is safe to re-run and will always insert newly added sources:

```typescript
// WRONG — blocks all new entries after first successful seed run:
export async function seedExternalIntegrations() {
  const existing = await db.select().from(externalIntegrations).limit(1);
  if (existing.length > 0) return;  // ← Early-return guard prevents new entries
  // ...
}

// CORRECT — idempotent per-row upsert:
export async function seedExternalIntegrations() {
  let inserted = 0;
  for (const row of DEFAULTS) {
    const result = await db
      .insert(externalIntegrations)
      .values({ ...row })
      .onConflictDoNothing();          // serviceKey UNIQUE constraint makes this safe
    if ((result.rowCount ?? 0) > 0) inserted++;
  }
  log(`Seeded ${inserted} new external integrations (${DEFAULTS.length} total)`, "migration");
}
```

The `serviceKey` column has a `.unique()` Drizzle constraint. `onConflictDoNothing()` is a safe no-op for existing rows.

## Why This Matters

**Without the fallback guard:** A single API outage (Wikipedia 503, RapidAPI rate limit) crashes the entire specialist report generation pipeline. `Promise.allSettled` + the minimum-row threshold ensures the specialist always has data.

**Without named constants + source citations:** Financial rates become unauditable. An LP or auditor cannot verify where "20% OTA commission" came from without reading the implementation. The magic-numbers ratchet also fails CI, blocking the PR.

**Without the seed upsert fix:** New integrations added to `DEFAULTS` are silently swallowed after the first seed run. The admin Sources panel never shows the new entries. The team discovers this only when live fetching silently returns no data.

**Without stale-while-revalidate:** Every specialist run triggers a fresh Booking.com actor run, burning API credits and adding 8–10 s of latency per city per request.

## When to Apply

- Implementing any new specialist comparable function (`getXxxComparables`) that has a live external source, even a free one.
- Adding a new data source to the seed registry (`seed-external-integrations.ts`).
- Deriving a financial rate that is not directly exposed by any API (use the ADR → mix fraction → commission derivation pattern as a template).
- Wiring a new Apify actor into `ApifyBizIntelService` or `ApifyService`.

## Examples

### Before: Canned stub

```typescript
/** Property-defaults comparables. Canned until Kalibri Labs / AHLA credentials land. */
export async function getPropertyDefaultsComparables(): Promise<readonly PropertyDefaultsComparableRow[]> {
  return getCannedPropertyDefaultsComparables();
}
```

### After: Basic structure (cache + threshold + locale merge)

This is the minimum viable live implementation shape — the same skeleton applies to Revenue, Overhead, and PropertyDefaults:

```typescript
export async function getPropertyDefaultsComparables(): Promise<
  readonly PropertyDefaultsComparableRow[]
> {
  const canned = getCannedPropertyDefaultsComparables();

  // staleWhileRevalidate: returns cached value if still fresh; otherwise fetches
  // in background and returns the stale value until the refresh settles.
  const liveRows = await cache.staleWhileRevalidate<PropertyDefaultsComparableRow[]>(
    "live-comparables:property-defaults:booking-com",
    LIVE_OTA_CACHE_TTL_SECONDS,   // 12 h — OTA rates change daily, not hourly
    () => fetchPropertyDefaultsLive(),
  );

  if (liveRows.length < LIVE_MIN_PROPERTY_DEFAULTS_LIVE_ROWS) {
    return canned; // Fallback: insufficient live rows
  }

  // Canned fills locales not already covered by live rows
  const liveLocales = new Set(liveRows.map((r) => r.locale));
  return [...liveRows, ...canned.filter((r) => !liveLocales.has(r.locale))];
}
```

### After: Full derivation helper (ADR → OTA mix → commission)

The inner fetch helper uses explicit city-result pairing (not index-based) to keep the ADR derivation safe if cities are added or reordered:

```typescript
async function fetchPropertyDefaultsLive(): Promise<PropertyDefaultsComparableRow[]> {
  const cities = [
    { city: "New York", otaMixFraction: LIVE_OTA_MIX_HEAVY_FRACTION    },
    { city: "Miami",    otaMixFraction: LIVE_OTA_MIX_STANDARD_FRACTION },
  ];

  const settled = await Promise.allSettled<BookingComHotel[]>(
    cities.map((c) => fetchBookingComBoutiqueHotels(c.city)),
  );

  // Zip inputs with results explicitly — avoids silent index misalignment
  return cities
    .map((city, i) => ({ city, result: settled[i] }))
    .flatMap(({ city, result }) => {
      if (result.status !== "fulfilled" || !result.value.length) return [];

      const avgAdr = avg(result.value.map((h) => h.avgPricePerNightUsd));

      // ADR < $200/night → budget segment → OTA-heavy booking mix
      const adjustedMix = avgAdr < LIVE_BOOKING_ADR_BUDGET_THRESHOLD_USD
        ? LIVE_OTA_MIX_HEAVY_FRACTION
        : city.otaMixFraction;

      const salesCommissionRate = parseFloat(
        (adjustedMix * LIVE_OTA_COMMISSION_BOOKING_COM_FRACTION).toFixed(4),
      );

      return [{
        salesCommissionRate,
        source: `Booking.com live (${city.city}, avg $${Math.round(avgAdr)}/night, n=${result.value.length})`,
        // ...
      }];
    });
}
```

**Why explicit zip, not `results.flatMap((r, i) => cities[i]`)?** If the `cities` array is extended or reordered, index-based correlation silently applies the wrong `otaMixFraction` to each city without any type error or test failure. The explicit `.map((city, i) => ({ city, result: settled[i] }))` makes the pairing auditable at code review time.

### Incidental fixes included in this session

**Seed upsert (session history):** The original early-return guard in `seed-external-integrations.ts` silently blocked the 7 new sources (Skyscanner, Apify LinkedIn/Crunchbase/Bloomberg/WSJ, Wikipedia, REST Countries, CIA Factbook) from ever being inserted. Switching to `onConflictDoNothing()` fixed this. *(session history)*

**Admin.tsx exhaustive type check:** `SPECIALIST_SUBTITLES: Record<SpecialistSection, string>` was missing `"specialist-portfolio-capital-raise"` — a pre-existing TypeScript error that blocked the full typecheck. Added the missing entry. This is a pattern to watch: when a new `SpecialistSection` value is added to `AdminSidebar.tsx`, all exhaustive Records in `Admin.tsx` and `Intelligence.tsx` must be updated in the same PR.

## Related

- `docs/solutions/database-issues/seed-insert-no-conflict-financial-assumptions-lost-2026-05-02.md` — idempotent seed upsert pattern (established for financial assumptions; this doc extends it to external integrations)
- `docs/solutions/architecture-patterns/reference-brands-ai-pipeline-wiring-2026-05-02.md` — dependency injection pattern for live DB data into specialist pipeline (same DI discipline applied here to external APIs)
- `docs/solutions/integration-issues/openai-sdk-env-base-url-overrides-embedding-client-2026-05-02.md` — Replit environment injection gotchas; always pass API config explicitly rather than relying on env inference
- `docs/solutions/integration-issues/railway-prod-secrets-task-983-disposition.md` — RAPIDAPI_KEY_2 and RAPIDAPI_KEY_3 must be provisioned as Railway secrets for live comparables to activate in production
