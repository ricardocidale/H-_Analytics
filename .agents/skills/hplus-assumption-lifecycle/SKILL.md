---
name: hplus-assumption-lifecycle
description: >
  Default → Assumption → Confirmed lifecycle for H+ Analytics. Defines where
  numbers come from when a new entity is created, how they flow to user-editable
  fields, what the Save button must always do, and how confirmed values are
  protected from admin-side default changes. Load for any work touching
  property edit, company assumptions, Steady State admin, seeding, or any
  page with a Save button.
---

# H+ Analytics — Assumption Lifecycle

---

## The three states of a financial field

Every financial field on a property or company record moves through three states:

```
[ UNSET ]  →  [ DEFAULT-POPULATED ]  →  [ CONFIRMED ]
```

### UNSET
The DB column is NULL. Nothing has been set for this entity. The engine uses
`property.field ?? DEFAULT_FIELD` and the engine fallback produces a value,
but nothing is stored for this entity specifically.

### DEFAULT-POPULATED
The entity was just created (seeded from Steady State defaults). The field
has the admin's current default value. The user has not yet confirmed it.
Admin changes to the default will update this field the next time it is
displayed (it has not been locked).

### CONFIRMED
The user opened the page, reviewed the value, and pressed **Save**. The value
is now stored as the entity's own value. Admin changes to the default do NOT
change this field. It belongs to the entity.

---

## The seeding pipeline

When a new property is created:

```
Admin has set DEFAULT_BASE_MANAGEMENT_FEE_RATE = 0.085 in Steady State
          ↓
POST /api/properties  (create property)
          ↓
Server calls buildPropertyDefaultsFromRegistry(country)
  → returns all DEFAULT_* values + getFactoryNumber() for country-specific rates
          ↓
New row inserted with baseManagementFeeRate = 0.085
(and costRateTaxes = getFactoryNumber('costRateTaxes', country), etc.)
          ↓
User sees 8.5% in Property Edit
```

**Rule:** Seeds must use the same `DEFAULT_*` constants and `getFactoryNumber()`
calls that the engine uses as fallbacks. A seed that hardcodes `0.085` and an
engine that falls back to `DEFAULT_BASE_MANAGEMENT_FEE_RATE = 0.085` are
technically consistent today but will silently diverge the moment anyone
changes the constant. Seeds must import the constant.

---

## Inviolable UX rules

### 1. The Save button is never disabled or grayed out

On any page or tab that contains assumption variables, the Save button must
always be enabled. There is no "nothing has changed" state that disables Save.

**Rationale:** The admin confirmed (in session, 2026-05-05) that the user must
actively press Save to confirm the values on a page. Disabling the button
assumes the values are already confirmed when they may not be. The button
being enabled is how the user signals "I have reviewed and accepted these
values."

**Save must not trigger navigation.** After a successful save the user stays
on the page and sees a brief success toast (e.g. "Changes saved"). A separate
affordance — the breadcrumb, sidebar, or a distinct "Close" action — handles
leaving the page. Never conflate Save with Close.

### 2. Navigate-away triggers a "Confirm your values" prompt

If a user starts to navigate away from an assumption page without having
pressed Save, the app must show an **in-app dialog warning** — not a browser
`beforeunload` popup (which cannot be styled and only fires on tab-close, not
on React Router navigation).

The canonical implementation is the `useUnsavedExitGuard` hook plus the
`UnsavedExitDialog` component. Callers wrap navigation triggers with
`confirmLeave(callback)`: the callback fires only after the user confirms they
want to leave. The hook also registers a `window.beforeunload` listener as a
secondary safety net for browser tab-close.

Scope — the prompt fires for:
- Leaving the page via React Router navigation (sidebar, breadcrumb, links)
- Switching between sections within the same page group (e.g. admin sidebar
  section switches, tab switches within Model Defaults)
- Browser tab close / reload (via `beforeunload`)

The warning copy should be factual, not scolding:
> "You have unsaved changes. Save before leaving or your edits will be lost."

Two buttons: **Save** (primary) and **Leave without saving** (destructive/ghost).

This applies to: `PropertyEdit`, `CompanyAssumptions`, `ModelDefaultsTab`,
`CompanyBracketMix` / ICP.

### 3. Confirmed values are immutable from admin defaults

Once a user has pressed Save on a field, that field's DB value is the
authority. If the admin later changes `DEFAULT_BASE_MANAGEMENT_FEE_RATE`
in Steady State from 8.5% to 9.5%, properties that already confirmed 8.5%
continue showing 8.5%. Only new entities (or fields that were never
confirmed) pick up the new default.

### 4. Unconfirmed fields show the current default as placeholder

When a field has never been confirmed (DB = NULL), the UI should display
the current Default Variable value as the placeholder/pre-filled value.
It should be visually distinct (e.g., lighter text, "default" badge) so
the user knows they are seeing a default, not their own confirmed value.

---

## Code patterns

### Engine and route handler fallbacks

```ts
// CORRECT — named constant as the fallback
property.costRateRooms    ?? DEFAULT_COST_RATE_ROOMS,
property.revShareFB       ?? DEFAULT_REV_SHARE_FB,
property.baseManagementFeeRate ?? DEFAULT_BASE_MANAGEMENT_FEE_RATE,
property.acquisitionLTV   ?? DEFAULT_LTV,
property.acquisitionInterestRate ?? DEFAULT_INTEREST_RATE,

// Country-specific rates:
ga.inflationRate ?? getFactoryNumber('inflationRate', country),

// VIOLATION — raw literal fallback (even if the literal matches the constant)
property.costRateRooms ?? 0.20,
ga.inflationRate       ?? 0.03,
dbDebt?.interestRate   ?? 0.065,
```

### Wrong constant is as bad as a literal

```ts
// VIOLATION — semantic error: DEFAULT_COST_RATE_MARKETING = 0.01 (property S&M)
//             but marketingRate in GlobalInput is the COMPANY marketing rate
marketingRate: ga.marketingRate ?? DEFAULT_COST_RATE_MARKETING  // wrong: 1%

// CORRECT
marketingRate: ga.marketingRate ?? DEFAULT_MARKETING_RATE       // correct: 5%
```

The `DEFAULT_COST_RATE_MARKETING` (1%) is the property-level Sales & Marketing
departmental cost rate under USALI. `DEFAULT_MARKETING_RATE` (5%) is the
management company's marketing overhead rate. These are different things.
Using the wrong one silently underestimates company marketing costs by 4×.

### Seeding a new property

```ts
import {
  DEFAULT_COST_RATE_ROOMS,
  DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  // ... all needed defaults
} from '@shared/constants';
import { getFactoryNumber } from '@shared/model-constants-registry';

const seed = {
  costRateRooms:          DEFAULT_COST_RATE_ROOMS,
  baseManagementFeeRate:  DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  costRateTaxes:          getFactoryNumber('costRateTaxes', country),
  inflationRate:          getFactoryNumber('inflationRate', country),
  // ...
};
// NEVER: costRateRooms: 0.20
```

---

## The Steady State → Seed → Assumption flow

```
Admin → Steady State (Admin UI)
  Sets DEFAULT_BASE_MANAGEMENT_FEE_RATE = 0.085
    ↓
constants.ts (or admin DB override)
  Stores 0.085 as the current default
    ↓
POST /api/properties  (new property)
  buildPropertyDefaultsFromRegistry() reads DEFAULT_BASE_MANAGEMENT_FEE_RATE
  Inserts property row with baseManagementFeeRate = 0.085
    ↓
GET /api/properties/:id  (property detail)
  Returns baseManagementFeeRate = 0.085 from DB
    ↓
Property Edit UI  (user sees 8.5%)
  User changes to 9.0% → presses Save
    ↓
PATCH /api/properties/:id
  Writes baseManagementFeeRate = 0.090 to DB
    ↓
Property is now CONFIRMED at 9.0%.
Admin changing Steady State to 9.5% does not affect this property.
```

---

## Open architectural items (tracked — do not re-litigate)

1. **`DEFAULT_PROPERTY_INCOME_TAX_RATE = 0.25`** — Tax rates are never
   constants or flat defaults. The correct fallback is
   `getFactoryNumber('taxRate', country)`. Implementing this requires adding
   `country` to `PropertyInput`. Separate task.

2. **Transfer taxes in `exit-scenarios.ts`** — Currently named constants in
   code. Admin confirmed these belong in the admin Constants table "in the
   long run." Separate task.

3. **`startOccupancy ?? 0.70` in POST stress-test handler** — Raw literal.
   Needs a named constant (`DEFAULT_START_OCCUPANCY = 0.55` is the ramp
   default; if 0.70 represents "stabilized property", create
   `DEFAULT_STRESS_TEST_START_OCCUPANCY = 0.70` with a comment). Confirm
   intent before fixing.
