"""
renovation_budget.py — Deterministic renovation budget estimator for H+ Analytics.

Source: hplus-renovation-benchmarks skill.
All values are mid-point estimates. Guardrails applied per skill spec.
No network calls. No LLM.
"""

from __future__ import annotations

# Cost per key by renovation tier (NY rural, 2024-2025 adjusted)
_COST_PER_KEY: dict[str, int] = {
    "soft":          33_500,    # midpoint $17k–$50k
    "upscale":      110_000,    # midpoint $70k–$150k
    "upper_upscale": 195_000,   # midpoint $140k–$250k
    "luxury":        415_000,   # midpoint $230k–$600k
}

_HISTORIC_PREMIUM = 0.20       # +20% for historic preservation
_CONTINGENCY      = 0.18       # 18% contingency
_ADU_MIDPOINT     = 130_000    # per ADU unit (midpoint $80k–$180k)
_GLAMPING_MIDPOINT = 45_000    # per glamping unit (midpoint $25k–$65k)


def select_tier(
    quality_tier: str | None,
    hospitality_type: str | None,
    renovation_scope: str | None,
) -> str:
    """Deterministically pick a renovation tier from property fields."""
    qt = (quality_tier or "").lower()
    ht = (hospitality_type or "").lower()
    rs = (renovation_scope or "").lower()

    if rs == "light" or rs == "cosmetic":
        return "soft"
    if "luxury" in qt or "luxury" in ht:
        return "luxury"
    if "upper" in qt or "upper" in ht:
        return "upper_upscale"
    if "upscale" in qt or "boutique" in ht or "hotel" in ht:
        return "upscale"
    return "upscale"  # safe default


def get_renovation_budget(
    room_count: int,
    quality_tier: str | None = None,
    hospitality_type: str | None = None,
    renovation_scope: str | None = None,
    is_historic: bool = False,
    adu_count: int = 0,
    glamping_count: int = 0,
) -> int:
    """
    Returns a deterministic mid-point renovation budget in USD.
    Applies guardrails: min $25k/key, max passed via clamp_to_purchase_price().
    """
    tier = select_tier(quality_tier, hospitality_type, renovation_scope)
    per_key = _COST_PER_KEY[tier]

    if is_historic:
        per_key = int(per_key * (1 + _HISTORIC_PREMIUM))

    base = room_count * per_key
    adu_cost = adu_count * _ADU_MIDPOINT
    glamping_cost = glamping_count * _GLAMPING_MIDPOINT
    subtotal = base + adu_cost + glamping_cost
    contingency = int(subtotal * _CONTINGENCY)

    return subtotal + contingency


def clamp_renovation_budget(budget: int, purchase_price: float, room_count: int) -> int:
    """
    Guardrails from hplus-renovation-benchmarks:
    - Max: 80% of purchase price
    - Min: $25,000 × room_count
    """
    max_b = int(purchase_price * 0.80) if purchase_price else budget
    min_b = int(25_000 * max(1, room_count))
    return max(min_b, min(max_b, budget))


def describe_renovation_scope(tier: str, is_historic: bool) -> str:
    """Short human-readable scope description for slide text."""
    descriptions = {
        "soft":          "Design refresh, FF&E upgrade, OTA optimization",
        "upscale":       "Full guestroom reno, common area upgrade, F&B infrastructure",
        "upper_upscale": "Full reno + MEP replacement + spa amenities",
        "luxury":        "Historic preservation-grade gut renovation + condo-finish keys",
    }
    base = descriptions.get(tier, descriptions["upscale"])
    if is_historic:
        base += " (historic preservation compliance included)"
    return base


def get_stable_year_label(year_index: int, acquisition_year: int = 0) -> str:
    """Human-readable label for the stable year (e.g. '2028')."""
    from datetime import datetime
    current_year = datetime.now().year
    return str(current_year + year_index + 1)


def compute_gross_margin(revenue: float, opex: float) -> float:
    """Gross margin as 0–1 fraction."""
    if not revenue:
        return 0.0
    return max(0.0, min(1.0, (revenue - opex) / revenue))


def compute_ebitda_pct(noi: float, revenue: float) -> float:
    """EBITDA % as 0–1 fraction (using NOI as proxy)."""
    if not revenue:
        return 0.0
    return max(0.0, min(1.0, noi / revenue))
