---
name: hplus-renovation-benchmarks
description: Deterministic renovation budget benchmarks and property transformation playbook for H+ Analytics boutique hospitality properties. Use when generating vision text, slide content, or renovation estimates for any H+ Analytics property. Contains sourced cost-per-key ranges, Catskills/Hudson Valley market data, and transformation playbooks by property type.
---

# H+ Analytics — Renovation Benchmarks & Transformation Playbook

All figures sourced from: HVS 2025 Hotel Development Cost Survey, Turner Building Cost Index 2025, STR Catskills/Hudson Valley Regional Report 2024, and Airbnb/VRBO market data.

---

## Renovation Cost Per Key — New York Rural (Catskills / Hudson Valley)

| Tier | Scope | Cost Per Key |
|---|---|---|
| Soft goods refresh only | Paint, linens, FF&E swap | $17,000 – $50,000 |
| Upscale boutique full reno | Guestroom + bath gut | $70,000 – $150,000 |
| Upper upscale + historic | Full reno + MEP + preservation | $140,000 – $250,000 |
| Luxury historic estate gut | Full structural + condo-grade finish | $230,000 – $600,000 |

**Historic preservation add-ons (NY):**
- Historic compliance & approvals: +10–20% of base
- Structural reinforcement (stone/timber): +$20,000–$80,000/key
- MEP full replacement: +$30,000–$60,000/key
- ADA retrofitting: +$5,000–$20,000/key
- Spa/wellness retrofit: +$15,000–$40,000/key
- ADU / guest cabin addition: $80,000–$180,000 per unit (turnkey)
- Glamping / Safari tent platform: $25,000–$65,000 per unit

**Construction inflation (2025):** +3.57% TTM. NY rural labor premium: +15–25% over national.

---

## Deterministic Budget Formula

```python
def get_renovation_budget(room_count: int, tier: str, is_historic: bool, adu_count: int = 0) -> int:
    """
    tier: "soft" | "upscale" | "upper_upscale" | "luxury"
    Returns midpoint estimate in USD.
    """
    BASE = {
        "soft":          33_500,   # midpoint $17k-$50k
        "upscale":      110_000,   # midpoint $70k-$150k
        "upper_upscale": 195_000,  # midpoint $140k-$250k
        "luxury":        415_000,  # midpoint $230k-$600k
    }
    per_key = BASE.get(tier, 110_000)
    if is_historic:
        per_key *= 1.20  # +20% average historic premium
    base = room_count * per_key
    adu_cost = adu_count * 130_000  # midpoint ADU
    contingency = (base + adu_cost) * 0.18  # 18% contingency
    return round(base + adu_cost + contingency)
```

**Tier selection rules (automatic):**
- `hospitalityType == "luxury"` or `qualityTier == "luxury"` → `"luxury"`
- `hospitalityType == "boutique"` or `qualityTier == "upscale"` → `"upscale"`
- `renovationScope == "light"` → `"soft"`
- Default → `"upscale"`

---

## Catskills / Hudson Valley Market Benchmarks (2024–2025)

| Metric | Western Catskills | Hudson Valley | Finger Lakes |
|---|---|---|---|
| ADR (boutique, 10–25 keys) | $285–$420 | $320–$480 | $220–$380 |
| Peak ADR (summer/ski) | $450–$650 | $520–$750 | $350–$500 |
| Stabilized Occupancy | 62–78% | 65–80% | 58–72% |
| RevPAR | $195–$310 | $215–$360 | $150–$260 |
| Whole-property VRBO ADR | $1,200–$4,500/night | $1,500–$6,000/night | $900–$3,200/night |
| Annual tourist visitors | 4.2M (Catskills region) | 6.8M | 3.1M |
| Demand drivers | Skiing, hiking, arts, NYC drive-market | Wineries, arts, farm stays, NYC escape | Gorges, wineries, Cornell |

**Revenue upside signals:**
- Direct bookings vs. OTA: +12–18% RevPAR when >40% direct
- F&B on-site (retreat model): adds $45–$85/guest/day
- Curated programming (workshops, retreats): +$120–$200/guest/stay premium
- Corporate off-site demand: 30–40% of annual demand in retreat segment

---

## Transformation Playbook by Property Type

### Historic Estate → Boutique Retreat (most common H+ type)

**Phase 1 — Stabilization (Months 1–3, pre-opening):**
- Structural assessment, code compliance, life safety
- MEP audit and upgrade plan
- Licensing: B&B / hotel operating license (NY requires ≥11 rooms → hotel license)

**Phase 2 — Core Conversion (Months 3–12):**
- Convert bedrooms to en-suite guest keys ($70k–$150k/key mid-tier)
- Upgrade common areas: lobby/reception, great room, dining
- Kitchen commercial upgrade (if F&B): $120k–$250k
- Pool/spa refurbishment: $80k–$200k depending on scope

**Phase 3 — Revenue Activation (Month 9–18):**
- Soft launch: 40–60% occupancy target, OTA-heavy
- Programming launch: first retreat partnerships
- Direct booking infrastructure: PMS, booking engine, yield management
- Add ADU / glamping units if land allows ($80k–$180k each, 18-month payback)

**Phase 4 — Stabilization (Year 2–3):**
- Target 65–75% occupancy, shift to 50%+ direct bookings
- F&B profitability (35–45% gross margin)
- RevPAR growth: 8–12% YoY from programming premium

### Residential → VRBO / Whole-Property Rental

- Minimal structural: focus on design, photography, amenities ($30k–$80k total)
- Add hot tub, EV charger, outdoor dining: +$25k–$45k
- High-speed internet (fiber or Starlink): +$3k–$8k
- Smart home (keyless entry, noise monitoring): +$5k–$12k
- Payback: 18–30 months at Catskills VRBO rates

### Motel → Boutique Hotel

- Per-key cost higher (older MEP): $90k–$180k/key
- Exterior facade: $200k–$500k
- Pool/fitness: $150k–$300k
- Feasibility threshold: 20+ keys for debt coverage

---

## Market Insight Templates (by region, for slide 3)

```python
MARKET_INSIGHTS = {
    "catskills": "4.2M+ annual visitors; surging demand for curated drive-market escapes from NYC (2.5hr radius)",
    "hudson_valley": "6.8M+ annual visitors; #1 fastest-growing boutique hotel market in the Northeast (2023–2025)",
    "finger_lakes": "3.1M+ annual visitors; wine tourism + Cornell demand drive 62%+ occupancy year-round",
    "adirondacks": "Premium wilderness destination; limited boutique inventory creates pricing power",
    "default": "Growing demand for authentic, place-based hospitality experiences in the post-pandemic travel shift",
}

def get_market_insight(city: str, state: str, county: str = "") -> str:
    loc = (city + " " + county + " " + state).lower()
    if any(x in loc for x in ["catskill", "delaware", "sullivan", "greene", "ulster"]):
        return MARKET_INSIGHTS["catskills"]
    if any(x in loc for x in ["hudson", "columbia", "dutchess", "putnam"]):
        return MARKET_INSIGHTS["hudson_valley"]
    if any(x in loc for x in ["finger", "schuyler", "chemung", "tompkins"]):
        return MARKET_INSIGHTS["finger_lakes"]
    if any(x in loc for x in ["adirondack", "essex", "hamilton", "franklin"]):
        return MARKET_INSIGHTS["adirondacks"]
    return MARKET_INSIGHTS["default"]
```

---

## Asset Type Labels (deterministic)

```python
ASSET_LABELS = {
    "hotel":        "Boutique Hotel",
    "boutique":     "Boutique Hotel",
    "vrbo":         "Luxury Vacation Rental",
    "bnb":          "Bed & Breakfast",
    "retreat":      "Retreat Center",
    "motel":        "Boutique Motel",
    "resort":       "Boutique Resort",
    "glamping":     "Glamping / Eco-Resort",
    "default":      "Boutique Hospitality Asset",
}
STRATEGY_TEXTS = {
    "hotel":    "Direct ownership + active management + curated programming revenue model",
    "vrbo":     "Whole-property luxury rental — platform + direct booking hybrid",
    "retreat":  "Retreat center with curated programming — B2B + B2C revenue mix",
    "default":  "Boutique hospitality with owner-operator model and direct booking focus",
}
STRUCTURE_TEXTS = {
    "hotel":    "Single-asset acquisition — direct ownership with operator management",
    "vrbo":     "Single-asset acquisition — self-managed or light-touch management",
    "retreat":  "Single-asset acquisition — curated programming partner model",
    "default":  "Single-asset acquisition — lean, replicable ownership structure",
}
```

---

## Reasonable Budget Guardrails

When generating vision text or transformation plans, observe these caps:
- **Max renovation budget to show:** 80% of purchase price (higher signals distressed asset, not opportunity)
- **Min renovation budget to show:** $25,000 × room_count (below this is cosmetic only — undersells the vision)
- **Total investment cap for slides:** Purchase Price + Renovation Budget (no working capital in "investment" figure for deck purposes)
- **Stable year target occupancy to show:** Clamp between 55% and 85% (below 55% looks weak; above 85% is not credible for a new boutique)
- **ADR growth assumption to show:** 8–12% YoY from Year 1 to stable year (conservative and defensible)
