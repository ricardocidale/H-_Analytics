# F&B Revenue & Costs Skill

This skill documents the rules, formulas, and constraints governing Food & Beverage (F&B) revenue and cost calculations in the financial model.

## Core Principle

All revenue categories in this model are expressed as **percentages of Total Revenue**. The engine derives total revenue algebraically: `totalRevenue = roomRevenue / (1 - eventsShare - fbShare - otherShare)`. This is critical for AI research, financial engine calculations, and data entry.

## Revenue Architecture

### Revenue Categories (all as % of Total Revenue)

| Category | Schema Field | Default | Description |
|----------|-------------|---------|-------------|
| Room Revenue | (remainder) | ~49% | ADR x Occupancy x 30.5 days. Equals totalRevenue minus all shares |
| F&B Revenue | `revShareFB` | 30% | Food & beverage share of total revenue |
| Event Revenue | `revShareEvents` | 18% | Events, conferences, retreats |
| Other Revenue | `revShareOther` | 3% | Spa, parking, sundries |

### Catering Boost (DEPRECATED)

The **catering boost** field (`cateringBoostPercent`) is retained in the schema for backward compatibility but is **no longer used in revenue calculations**. It defaults to 0.

Previously, catering boost was an uplift multiplier applied to base F&B revenue. In the current model, the F&B share directly represents the target percentage of total revenue, making a separate catering boost unnecessary.

## Formulas

### Revenue Calculation (Current Model)

```
totalRevenue = roomRevenue / (1 - revShareEvents - revShareFB - revShareOther)
F&B Revenue = totalRevenue x revShareFB
Event Revenue = totalRevenue x revShareEvents
Other Revenue = totalRevenue x revShareOther
```

**Example:**
- roomRevenue = $100,000/month
- revShareFB = 30%, revShareEvents = 18%, revShareOther = 3%
- totalRevenue = $100,000 / (1 - 0.18 - 0.30 - 0.03) = $100,000 / 0.49 = $204,082
- F&B Revenue = $204,082 x 0.30 = $61,224
- Event Revenue = $204,082 x 0.18 = $36,735
- Other Revenue = $204,082 x 0.03 = $6,122

### F&B Cost Calculation

```
F&B Expense = F&B Revenue x costRateFB
```

**Schema field:** `costRateFB` (per property)
**Default:** 32% (of F&B revenue) -- USALI standard 28-35% for full-service boutique
**Constant:** `DEFAULT_COST_RATE_FB` in `shared/constants.ts` (re-exported via `client/src/lib/constants.ts`)

### Total Revenue Composition

```
Total Revenue = Room Revenue + F&B Revenue + Event Revenue + Other Revenue
             = roomRevenue / (1 - revShareEvents - revShareFB - revShareOther)
```

**Constraint:** revShareEvents + revShareFB + revShareOther must be < 1.0 (the remainder is the implicit room revenue share).

## Financial Engine Implementation

Located in `engine/property/property-engine.ts`:

The engine calculates total revenue from room revenue and the revenue shares, then derives each ancillary stream as its share of total revenue. Catering boost is not used.

## Rules & Constraints

### 1. Revenue Shares Sum < 100%
The sum of all revenue shares (events + F&B + other) must be strictly less than 100%. The remainder is the implicit room revenue share.

### 2. Research-Driven Values
Revenue share values should come from AI market research for each property. Research tools analyze local market conditions to recommend appropriate share targets.

### 3. Percentage-of-Total-Revenue Convention
When AI research or market data provides revenue breakdowns (e.g., "F&B is 30% of total revenue"), the value maps directly to `revShareFB = 0.30`. No conversion is needed.

### 4. Typical Ranges

| Revenue Stream | Range | Notes |
|---------------|-------|-------|
| F&B Share | 25% - 35% | Higher for destination dining, resort properties |
| Events Share | 15% - 20% | Higher for wedding venues, retreat centers |
| Other Share | 2% - 5% | Spa, parking, retail, experiences |
| Room Revenue (implicit) | 40% - 58% | Remainder after all shares |

### 5. Cost Rate Independence
The `costRateFB` (default 32%) applies to F&B Revenue. It does not change based on the revenue share percentage. The cost rate represents the blended cost-of-goods for all F&B operations.

## Data Flow

```
AI Research (revenue mix analysis)
  -> Recommended revenue shares in research output
  -> User reviews on Property Market Research page
  -> User adjusts revShareFB, revShareEvents, revShareOther in Property Edit page
  -> Financial Engine uses values for monthly projections
  -> Income Statement, Cash Flow, Balance Sheet reflect revenue streams
```

## Schema Reference

### Properties Table (`shared/schema.ts`)
```typescript
revShareFB: real("rev_share_fb").notNull().default(0.30)
revShareEvents: real("rev_share_events").notNull().default(0.18)
revShareOther: real("rev_share_other").notNull().default(0.03)
cateringBoostPercent: real("catering_boost_percent").notNull().default(0.00)  // DEPRECATED
```

### Constants (`shared/constants.ts`)
```typescript
DEFAULT_REV_SHARE_FB = 0.30       // F&B as % of total revenue
DEFAULT_REV_SHARE_EVENTS = 0.18   // Events as % of total revenue
DEFAULT_REV_SHARE_OTHER = 0.03    // Other as % of total revenue
DEFAULT_CATERING_BOOST_PCT = 0.00 // DEPRECATED - retained for backward compat
DEFAULT_COST_RATE_FB = 0.32       // F&B cost rate (USALI: 28-35% for full-service boutique)
```

## Files That Use F&B Logic

| File | Role |
|------|------|
| `engine/property/property-engine.ts` | Property pro-forma engine (revenue calculation) |
| `shared/constants.ts` | Default values |
| `client/src/pages/PropertyEdit.tsx` | User edits revenue shares |
| `client/src/pages/Portfolio.tsx` | Displays property revenue shares |
| `server/calculationChecker.ts` | Validates calculations |
| `server/aiResearch.ts` | AI research tool handler |

## Anti-Patterns to Avoid

1. **Never use catering boost in revenue calculations** -- it is deprecated (set to 0)
2. **Never use systemwide revenue share assumptions** -- always per-property
3. **Never confuse revShareFB with costRateFB** -- one is revenue share, the other is cost rate
4. **Revenue shares are % of total revenue**, not % of room revenue
5. **Revenue shares must sum to < 100%** -- the remainder is the implicit room revenue share
6. **Housekeeping expense IS based on room revenue** -- do not change expense base references
