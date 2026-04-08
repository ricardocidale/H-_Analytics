---
name: scenarios
description: Scenario save/load/compare/share system. Covers scenario snapshots, the Scenarios page UI, scenario API routes, and the scenarios table. Use when working on scenario features or snapshot persistence.
---

# Scenarios

The scenario system allows users to save, restore, compare, and share complete snapshots of all portfolio assumptions and financial outputs. Use this skill when working on scenario save/load/share features, the Scenarios page UI, scenario-related API routes, or any code that touches the `scenarios` table.

**Related skills:** `product-vision/` (onboarding workflow), `server-finance/` (snapshot persistence, drift detection), `notifications/` (scenario email sharing)

---

## What a Scenario Contains

A scenario is a complete, reproducible snapshot of:
- All property assumptions for every property in the portfolio at save time
- Global assumptions (ManCo settings, staffing, SAFE funding, inflation rates, etc.)
- Fee category configurations per property
- The scenario name, description, and metadata (created by, created at)
- Computed results snapshot (`scenario_results` table) — the full financial output at that moment

Restoring a scenario from any point in time always reproduces **identical financial outputs** — same inputs, same engine, same results.

---

## Two-Layer Privacy Model

### Layer 1 — Scenario Records Are User-Private

The `scenarios` table rows are owned by the creating user (`userId = creator's id`). A user's Scenarios page shows **only their own saved scenarios**. Other users cannot see, browse, or load another user's scenario unless it has been explicitly shared.

This means:
- Query the scenarios list with `WHERE userId = :currentUserId` (plus any shared-with-me records)
- Never return all scenarios to all users
- Admin users can see all scenarios (support / audit purposes)

### Layer 2 — The Active Workspace Is Shared

The currently **loaded and active** portfolio — properties (`userId = NULL`) and `global_assumptions` (`userId = NULL`) — is a **shared workspace visible to all authenticated users**. Loading a scenario replaces this shared workspace and affects what every logged-in user sees instantly.

```
Scenario Record (user-private)  →  loadScenario()  →  Active Workspace (shared, userId=NULL)
     saved by User A                                      visible to User A, B, C, ...
```

**This is intentional**: the app models a single real investment portfolio that an investment team works on together. The active workspace is the "current version" of the portfolio everyone is collaborating on.

### Consequences for UI

1. **Warn before loading** — The UI must display a confirmation dialog: *"Loading this scenario will replace the current portfolio for all users. Save the current state first if you want to preserve it."*
2. **Prompt on logout** — If there are unsaved changes (the active workspace differs from the last saved scenario), the app must prompt the user to save before logging out.
3. **No silent auto-load** — Never load a scenario without explicit user confirmation.

---

## Scenario Load — Technical Requirements

`loadScenario()` must:
1. Update the **shared** `global_assumptions` row (`userId=NULL`) — never create a user-specific row
2. Delete all shared properties, then re-insert scenario properties with `userId: null`
3. Never set `userId` to the logged-in user's ID on restored properties (this would make them invisible to everyone else)
4. Restore fee categories per property
5. Persist the loaded scenario ID in session state so the UI can show "Currently viewing: [Scenario Name]"

---

## Scenario Sharing & Access Control

Users can share scenarios via two mechanisms: the legacy `scenario_shares` table (per-scenario, per-target-type grants) and the new `scenario_access` table (fine-grained owner-to-grantee grants).

### Access Control Model (`scenario_access` table)

The `scenario_access` table supports two grant types:
- **Specific**: `scenarioId` is set, `grantType = "specific"` — grants access to one scenario
- **All**: `scenarioId` is NULL, `grantType = "all"` — grants access to ALL scenarios owned by `ownerId` (current and future)

Schema:
```
scenario_access:
  id (serial PK)
  scenarioId (integer, FK → scenarios.id, nullable)
  ownerId (integer, FK → users.id — the person granting access)
  granteeId (integer, FK → users.id — the person receiving access)
  grantType: "specific" | "all"
  createdAt (timestamp)
```

### API Routes

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/scenarios/access` | Grant access: `{ granteeId, scenarioId? }` |
| DELETE | `/api/scenarios/access` | Revoke access: `{ granteeId, scenarioId? }` |
| GET | `/api/scenarios/access` | List all grants issued by current user |
| GET | `/api/scenarios/shared-with-me` | List scenarios shared with current user |

All routes require `requireAuth`. Grant/revoke verify ownership of the scenario.

### Storage Methods

| Method | Description |
|--------|-------------|
| `grantScenarioAccess(ownerId, granteeId, scenarioId \| null)` | Creates a grant record (idempotent) |
| `revokeScenarioAccess(ownerId, granteeId, scenarioId \| null)` | Deletes the grant record |
| `getScenarioAccessByOwner(ownerId)` | Returns all grants issued by owner, with grantee info |
| `getScenariosSharedViaAccess(userId)` | Returns scenarios accessible to userId via grants |

The existing `getScenariosSharedWithUser(userId)` method now merges results from both `scenario_shares` (legacy) and `scenario_access` (new).

### In-App Share (Scenarios Page)

The Scenarios page shows two sections:
1. **My Scenarios** — owned scenarios with Share, Edit, Clone, Delete, Export buttons
2. **Shared with Me** — scenarios accessible via grants, with Load and Export buttons and a "Read-only" badge

The Share dialog (on each scenario card) allows:
- Enter recipient email
- Choose: "This scenario only" (specific grant) or "All my scenarios" (all grant)
- View existing access grants with a Revoke button per grant

### Email Share (Notifications System)
- Select a scenario → Share via email → enter recipient email addresses
- Sends a formatted scenario summary email via Resend containing:
  - Scenario name and description
  - Key portfolio metrics (Total Revenue, NOI, IRR, Equity Multiple)
  - Per-property summary table
  - Link/invitation to open the full scenario in the portal
- Route: `POST /api/notifications/share-scenario`

---

## Scenario Comparison

Users can compare scenarios side-by-side:
- Select two scenarios → Compare
- Shows delta columns: the difference in key metrics between the two snapshots
- Does NOT load either scenario into the active workspace — comparison is read-only

---

## Computed Snapshot Persistence

When a scenario is saved, the server also persists a `scenario_results` record — an immutable artifact of the full financial computation:

- **Drift detection**: When a scenario is later viewed, the server can compare current recomputation against the stored baseline. Outcomes: `match`, `input_changed`, `engine_changed`
- **Export reproducibility**: The `computeRef` parameter in `/api/exports/premium` locks exports to the stored snapshot, guaranteeing the export matches the scenario exactly
- **Audit trail**: Stored results prove what the model showed at the time the scenario was saved, even if assumptions or the engine change later

---

## Key Files

| File | Purpose |
|------|---------|
| `server/storage/financial.ts` | `getScenariosByUser()`, `loadScenario()`, `grantScenarioAccess()`, `revokeScenarioAccess()`, `getScenariosSharedViaAccess()` |
| `server/routes/scenarios.ts` | API routes: GET/POST/DELETE scenarios, share, load, access control |
| `shared/schema/scenarios.ts` | `scenarios`, `scenarioShares`, `scenarioAccess`, `scenarioPropertyOverrides`, `scenarioResults` tables |
| `client/src/pages/Scenarios.tsx` | Scenarios page UI: My Scenarios + Shared with Me sections |
| `client/src/components/scenarios/ShareScenarioDialog.tsx` | Share dialog with email entry, mode selection, and grant management |
| `client/src/lib/api/scenarios.ts` | Client hooks: `useScenarioAccess()`, `useGrantScenarioAccess()`, `useRevokeScenarioAccess()`, `useSharedWithMe()` |
| `server/migrations/scenario-access-001.ts` | Migration for `scenario_access` table |

---

## Invariants

- Scenario records: `userId = creating user's id` — never NULL
- Active workspace properties: `userId = NULL` — always
- `loadScenario()` never sets `userId` on restored properties
- Scenario list query always filters by `userId = currentUser` (+ shared-with-me)
- Comparison view never modifies the active workspace
- Load action always shows a confirmation dialog first
- `scenario_access` grants: only the owner can grant/revoke access to their own scenarios
- "All" grants (`grantType = "all"`) apply to current and future scenarios by that owner
- A user cannot grant access to themselves
- The `getScenariosSharedWithUser()` merges results from both `scenario_shares` (legacy) and `scenario_access` (new) tables, deduplicating by scenario ID
