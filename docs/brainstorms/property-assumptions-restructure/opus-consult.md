# Claude Opus consult — Property Assumptions schema (2026-05-11)

# H+ Analytics — Property Assumptions Schema Design

## A) Field-Level Deltas by Transition

### 1) SFR/Estate → 6-12 Key Boutique Hotel

| Field | As Purchased | As Improved |
|---|---|---|
| use_class | single_family_residential | boutique_hotel |
| keys | 0 (bedrooms: 5-8) | 8-12 |
| suites | 0 | 2-4 |
| f&b_seats | 0 (residential kitchen) | 20-40 (guest breakfast/light dinner) |
| f&b_venues | 0 | 1 (intimate dining room) |
| commercial_kitchen | none | 1 |
| bars | 0 | 1 (often honor bar or small lounge) |
| parking_spaces | 4-8 residential | 12-15 striped |
| staff_back_of_house | none | required (laundry, BOH office, staff WC) |
| ada_keys | n/a | 1 minimum |
| seasonality | n/a | parallel field activates |
| condition_rating | meaningful | n/a |

**Carry over:** lot_acres, location, gross_sqft (mostly), stories, historic_designation, view_orientation.

---

### 2) Working Farm/Barn → Agritourism Lodge with Cabins

| Field | As Purchased | As Improved |
|---|---|---|
| use_class | working_farm | agritourism_lodge |
| keys (main lodge) | 0 | 4-8 |
| cabins | 0 (or derelict outbuildings) | 6-15 |
| glamping_pads | 0 | 0-10 |
| f&b_seats | 0 | 40-80 (farm-to-table) |
| f&b_venues | 0 | 1-2 (barn restaurant + outdoor) |
| event_sqft | 0 (or raw barn) | 2,000-5,000 (restored barn) |
| working_acres | meaningful (active) | reduced/curated for guest experience |
| livestock | present | reduced/demonstrative |
| outbuildings_count | high (functional) | repurposed inventory |
| activities_offered | none packaged | parallel field activates |

**Carry over:** lot_acres, water_rights, road_access, zoning_overlay.

---

### 3) Defunct Restaurant → Restaurant + Inn Above

| Field | As Purchased | As Improved |
|---|---|---|
| use_class | defunct_f&b | mixed_use_inn_restaurant |
| f&b_seats | existing (stale) | refreshed, possibly resized |
| f&b_venues | 1 | 1-2 (+ bar split) |
| commercial_kitchen | 1 (likely needs rebuild) | 1 (modernized) |
| keys | 0 | 4-8 (upper floors) |
| liquor_license | may exist (asset!) | parallel — confirmed/upgraded |
| grease_trap/hood | existing condition flag | spec'd |
| separate_guest_entry | n/a | required new field |
| residential_to_commercial_conversion | n/a | flag |

**Carry over:** street_frontage, location, gross_sqft, stories, parking_spaces (often).

---

### 4) Strip of Houses → Short-Stay Rental Cluster

| Field | As Purchased | As Improved |
|---|---|---|
| use_class | residential_portfolio | str_cluster |
| units_count | N houses | N units (same) |
| keys_per_unit | bedrooms (residential) | bedrooms (rental count) |
| central_check_in | none | 1 (often a converted unit or shed) |
| f&b_seats | 0 | 0 (or small communal) |
| pool_shared | rarely | often added |
| str_permit_status | parallel — current legality | parallel — target legality |
| condition_rating_per_unit | meaningful | n/a |
| parking_per_unit | residential | guest-counted |

**Carry over:** addresses, lot_acres_each, zoning per parcel.

---

### 5) Historic Mansion → Event Venue + Inn + F&B

| Field | As Purchased | As Improved |
|---|---|---|
| use_class | historic_residence | event_inn_f&b |
| keys | 0 | 6-10 |
| event_sqft_indoor | raw (formal rooms) | 3,000-6,000 programmed |
| event_sqft_outdoor | gardens | tented capacity defined |
| max_event_capacity_seated | n/a | 120-250 |
| max_event_capacity_standing | n/a | 200-400 |
| ceremony_sites | n/a | 1-3 |
| f&b_seats | 0 | 40-80 + event catering |
| commercial_kitchen | 0 (residential) | 1 (catering-grade) |
| bridal_suite | n/a | 1 (often a hero key) |
| historic_designation | parallel — restricts | parallel — preservation easement likely |
| parking_spaces | 6 | 60-100 (often offsite/valet plan) |

**Carry over:** historic_designation, lot_acres, gardens_acres, architectural_style.

---

### 6) Tired Motel → Upscale Lodge + Restaurant

| Field | As Purchased | As Improved |
|---|---|---|
| use_class | economy_motel | upscale_lodge |
| keys | e.g. 40 | e.g. 28-32 (combined for size) |
| suites | 0 | 4-8 |
| avg_key_sqft | 220 | 380-450 |
| f&b_seats | 0 (or vending) | 60-100 |
| f&b_venues | 0 | 1-2 (restaurant + bar/lounge) |
| commercial_kitchen | 0 | 1 |
| pool | tired/closed | refurbished or removed |
| spa | none | 0-1 (small treatment rooms) |
| target_adr_band | $60-90 | $250-400 |
| finish_grade | economy | upscale/luxury |
| parking_spaces | 1:1 with old keys | adjusted to new key count |

**Carry over:** lot_acres, road_visibility, total_building_footprint (mostly).

---

### 7) Bare Land + Outbuildings → Glamping + F&B

| Field | As Purchased | As Improved |
|---|---|---|
| use_class | raw_land | glamping_resort |
| glamping_pads | 0 | 10-25 |
| glamping_unit_types | n/a | parallel (safari/dome/A-frame mix) |
| cabins | 0 or derelict | 0-6 |
| f&b_seats | 0 | 30-60 (often outdoor + barn) |
| f&b_venues | 0 | 1 (+ fire-pit/bar) |
| commercial_kitchen | 0 | 1 (often modular/container) |
| central_bath_house | 0 | 1-2 |
| utilities_to_pad | none | water/power/septic spec |
| activities_offered | n/a | parallel activates |
| outbuildings_count | inventoried | repurposed (BOH, reception) |

**Carry over:** lot_acres, water_source, road_access, viewshed, zoning.

---

## B) Unified Descriptor Schema

### Identity (immutable — Basic tab only)
| Field | Scope |
|---|---|
| address | identity |
| coordinates | identity |
| parcel_ids[] | identity |
| lot_acres | identity |
| zoning_base | identity |
| historic_designation | identity |
| water_rights / water_source | identity |
| road_access_type | identity |
| viewshed_orientation | identity |

### Physical Envelope (parallel — can change with construction)
| Field | Scope |
|---|---|
| use_class | parallel |
| gross_building_sqft | parallel |
| stories | parallel |
| outbuildings_count | parallel |
| outbuildings_sqft_total | parallel |
| parking_spaces | parallel |
| ada_compliance_level | parallel |
| condition_rating | purchased-only |
| deferred_maintenance_flag | purchased-only |
| year_built | identity |
| year_last_renovated | parallel |

### Functional Inventory (parallel)
| Field | Scope |
|---|---|
| keys | parallel |
| suites | parallel |
| avg_key_sqft | parallel |
| ada_keys | parallel |
| cabins | parallel |
| glamping_pads | parallel |
| glamping_unit_types[] | parallel |
| str_units | parallel |
| f&b_venues | parallel |
| f&b_seats_total | parallel |
| bars | parallel |
| commercial_kitchens | parallel |
| event_sqft_indoor | parallel |
| event_sqft_outdoor | parallel |
| max_event_capacity_seated | parallel |
| max_event_capacity_standing | parallel |
| ceremony_sites | parallel |
| pool | parallel (count) |
| spa_treatment_rooms | parallel |
| gym_sqft | parallel |
| central_bath_house | parallel |
| working_acres | parallel |

### Quality / Positioning
| Field | Scope |
|---|---|
| finish_grade | parallel |
| market_tier | parallel |
| target_adr_band | improved-only |
| current_adr_band | purchased-only |
| stars_decorative | parallel |
| brand_affiliation | improved-only (typically) |

### Operating Posture
| Field | Scope |
|---|---|
| seasonality_pattern | parallel |
| operating_months | parallel |
| f&b_service_model | parallel |
| activities_offered[] | parallel |
| liquor_license_status | parallel |
| str_permit_status | parallel |
| event_permit_status | parallel |

**Total: ~50 fields. ~9 identity, ~5 purchased-only, ~3 improved-only, rest parallel.**

---

## C) Database Shape — Recommendation

### Evaluation

| Option | Pros | Cons |
|---|---|---|
| **Wide table** | Simple SQL, typed columns, easy indexing | 50+ columns mostly null per row, schema migration on every UI iteration, awful for varying property types |
| **JSONB blobs + catalog** | One migration, fast UI iteration, natural shape for LLM context, easy to diff purchased vs improved | Weak typing (mitigated by catalog + app-layer validation), aggregation queries need JSONB operators |
| **Fully normalized EAV** | Maximum flexibility | Painful to query, no native typing, slow for LLM hydration (N joins), hardest to lock down |

### Recommendation: **JSONB blobs per state + descriptor catalog table**

```sql
-- catalog: the locked-down field definitions (admin-only, version-controlled in code/migrations, NOT user-editable)
CREATE TABLE descriptor_catalog (
  field_key TEXT PRIMARY KEY,
  group_name TEXT NOT NULL,           -- identity|envelope|inventory|quality|posture
  scope TEXT NOT NULL,                 -- identity|parallel|purchased_only|improved_only
  data_type TEXT NOT NULL,             -- int|float|enum|bool|string|array
  enum_values JSONB,                   -- nullable
  unit TEXT,                           -- keys|sqft|seats|acres|usd
  applies_to_use_classes TEXT[],       -- gating: which use_class values render this field
  display_label TEXT NOT NULL,
  help_text TEXT,
  sort_order INT
);

CREATE TABLE properties (
  id UUID PRIMARY KEY,
  identity JSONB NOT NULL,             -- immutable fields
  descriptors_purchased JSONB NOT NULL DEFAULT '{}',
  descriptors_improved  JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_prop_use_class_purchased ON properties ((descriptors_purchased->>'use_class'));
CREATE INDEX idx_prop_use_class_improved  ON properties ((descriptors_improved->>'use_class'));
```

### Why this fits your specific situation

1. **Small N of properties** — JSONB scan cost is irrelevant. You're not running OLAP across 100k rows.
2. **Frequent UI iteration** — Adding a field = one row in `descriptor_catalog`, no `ALTER TABLE`, no migration in prod for shape changes.
3. **LLM consumption downstream** — JSONB serializes natively to the structured context the specialist agents need. `{purchased: {...}, improved: {...}}` is exactly the comparative payload your AI specialists want. Avoid EAV: hydrating 50 rows into a coherent prompt is wasteful.
4. **Locked-down storage** — `descriptor_catalog` lives in migrations (code, not admin UI). App layer validates writes against catalog. Users can't invent fields; they can only fill values. This is the "admin-edit-free" guarantee.
5. **Use-class gated rendering** — `applies_to_use_classes` on the catalog drives the form, so a glamping property never sees `commercial_kitchens` count for `as_purchased=raw_land` but sees it for `as_improved=glamping_resort`. Eliminates the "nullable garbage" problem at the UI layer.
6. **Diffing purchased vs improved** is a single JSONB operation — perfect for "what's changing?" UI badges and downstream cap-ex inference.

**Avoid EAV** unless you genuinely expect users to define custom fields. You don't — you want lockdown.

**Avoid wide table** because the field set is genuinely heterogeneous and you're still iterating.

---

## D) Fields to Push Back On Before Locking

1. **`market_tier` / `target_adr_band`** — Are these free-text bands ($X-$Y), STR competitive set tiers (economy/midscale/upscale/luxury), or both? They drive revenue modeling so the vocabulary needs to be canonical AND mappable to STR/comp data. Don't lock until you decide if this is a number, an enum, or both.

2. **`f&b_service_model`** — "Restaurant" is too coarse. Real distinctions matter for cost modeling: continental_breakfast_only, all_day_cafe, table_service_dinner, full_three_meal, bar_with_snacks, private_chef_event_only, food_truck_outdoor. Each has wildly different labor and COGS. Get a chef/F&B operator to sanity-check the taxonomy.

3. **`glamping_unit_types[]`** — The industry has no standard. Safari tent, bell tent, geo-dome, A-frame, yurt, treehouse, airstream, container cabin all have different ADR ceilings, lifespans, and capex. Lock the taxonomy with a glamping operator before it ossifies into your downstream models.

4. **`use_class`** — Your transitions imply ~10-15 values. But hybrid properties (inn + restaurant + event venue) break single-enum thinking. Consider: is `use_class` one primary + array of secondary, or a multi-select? This decision cascades into every gated field.

5. **`condition_rating`** — Single 1-5 scale is tempting but useless. Roof, mechanicals, envelope, finishes, and site/utilities deteriorate independently and drive radically different reno budgets. Either decompose into 4-5 sub-ratings or accept that this field is decorative and the real condition data lives in the cap-ex module.

**Bonus flag:** `seasonality_pattern` — enum (year_round / summer_peak / winter_peak / shoulder_dependent) is fine for v1, but downstream revenue modeling will want monthly occupancy curves. Decide now whether this field is a label or a 12-element array, because retrofitting hurts.