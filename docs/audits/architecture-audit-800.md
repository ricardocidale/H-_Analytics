---
title: Architecture audit: scenarios, portfolios, sharing, roles
---
# Architecture Audit: Scenarios, Portfolios, Sharing, Roles, Data Governance

## What & Why
You asked for an audit of the current implementation against a proposed
target architecture covering **scenarios, portfolios, sharing, user
management, permissions, data ownership, and server-side enforcement**.
This document is the deliverable: a structured, skeptical audit, plus
clarifying questions and refined recommendations. **No code, schema,
seed, or dependency changes have been made**, per your constraint.

## Done looks like
- You read the audit, answer the open decision questions, and approve
  (or revise) the target direction.
- After approval, a separate, staged refactor plan is produced as
  follow-up tasks — one per safely-mergeable phase.

## Out of scope for this task
- Any code, schema, migration, seed, dependency, or config edit.
- The pre-existing `database-scenario-architecture.md` plan is referenced
  but not executed here.

---

## 1. Executive summary

The current code is **partially aligned** with the proposed architecture.
The trust boundary (server-side auth, Zod-whitelisted profile updates,
soft-delete on properties, share-as-view-then-fork) is broadly in good
shape and stronger than the brief assumed. But three structural concepts
in the proposal **do not exist in the schema today**:

1. There is **no system-wide protected base scenario**. What is called
   `kind="default"` is a *per-user* personal starting scenario seeded at
   first login by `ensureDefaultScenario`. That is not the same thing as
   "the canonical property universe, owned by the platform, that admins
   fork visibility scenarios from".
2. There is **no separation between "admin scenario" (visibility/
   assignment) and "user portfolio" (saved working object)**. One table,
   `scenarios`, carries both meanings, discriminated only by `kind` and
   `isLocked`. The word "portfolio" is used informally in code (e.g.
   `/api/portfolio/risk-score`) to mean "the user's live property set",
   never as a saved entity.
3. There is **no `users.assignedScenarioId` linkage**. Users are not
   "assigned a scenario as their starting view"; instead each user owns
   a personal `kind="default"` snapshot that drifts independently of
   anything an admin curates.

Two legacy roles (`checker`, `investor`) are still active and seeded.
Whether they are legacy or load-bearing is a **product decision you
need to make** — they are not dead code.

The sharing model **leaks email-existence** (returns `404 "No user
found with that email address"` to the sharer). This contradicts your
proposed "do not reveal user directory" rule and is the single most
actionable security finding in this audit.

Overall: the codebase is closer to your proposed model than the brief
implies, but the **conceptual taxonomy is the main gap**, not the
permission enforcement.

---

## 2. Current architecture map (how it actually works)

### 2.1 Roles
Five active roles in `shared/schema/auth.ts` and `shared/constants-enums.ts`:
`super_admin`, `admin`, `user`, `checker`, `investor`.
Server middleware in `server/auth.ts`:
- `requireAuth`, `requireAdmin`, `requireSuperAdmin`, `requireChecker`,
  `requireManagementAccess` (everyone except `investor`).
A previously-existing `partner` role was migrated to `user` by
`server/migrations/role-partner-to-user-001.ts` and removed from the
valid enum. That migration is the precedent for any future role
deprecation.

### 2.2 Scenarios
Single table `scenarios` (`shared/schema/scenarios.ts`) carries
**three discriminated meanings** via `kind`:
- `kind="default"` — per-user personal "base" snapshot, created by
  `ensureDefaultScenario` (`server/routes/scenario-helpers.ts`) at
  first login. Often named `"[Initials] Default Scenario"` or
  `"Development"`. Frequently `isLocked=true`.
- `kind="autosave"` — single-row-per-user automatic backup, written by
  `POST /api/scenarios/auto-save`. A partial unique index
  `scenarios_user_kind_unique` (`server/migrations/scenario-system-unique-001.ts`)
  enforces one `default` and one `autosave` per user.
- `kind="manual"` — user-saved snapshot. The vast majority of scenarios.

Storage layout per scenario row:
- `globalAssumptions` JSONB — full snapshot of `global_assumptions`
- `properties` JSONB — full snapshot of property list
- `scenario_property_overrides` (separate table) — diffs `(scenarioId,
  propertyId, overrides JSONB, changeType: added|removed|modified)`
- `computedResults` JSONB — cached engine output
- `baseSnapshotHash` — version of the property universe forked from
- `scenario_results` (separate table) — per-`scenarioId` cache of heavy
  engine output keyed by `output_hash` and `engine_version`

### 2.3 Portfolios
**There is no `portfolios` table.** "Portfolio" is used informally:
- Code: `/api/portfolio/risk-score` computes against the user's *live*
  active property set.
- UI: `OverviewTab` displays "your portfolio" meaning the same live set.
The proposed concept of "user-owned saved working portfolio with its own
assumption + visibility overlay" is **not modelled** — it is approximated
by `scenario` rows with `kind="manual"`.

### 2.4 Sharing
Two tables:
- `scenario_access` — the actual access-control table. `grantType` is
  `"specific"` (one scenario) or `"all"` (all current and future scenarios
  owned by `ownerId`).
- `scenario_shares` — admin-tracking table by `targetType: user|group|
  company` and `targetId`. Appears to overlap conceptually with
  `scenario_access` in places (see Risks).

Behavior:
- Lookup is **by recipient email**.
- `POST /api/scenarios/shares` calls `getUserByEmail`; returns **404
  with the message `"No user found with that email address"`** when the
  email is not registered. This **discloses directory membership** to
  any caller. Confirmed in `server/routes/scenarios.ts`.
- Notification email goes through Resend (`sendScenarioShareNotification`).
- Sharees get **view + load** access. Loading
  (`POST /api/scenarios/:id/load`) hydrates the sharee's *own* live
  workspace from the snapshot — i.e. it's a fork-on-load, not a
  co-edit. The original is not mutated. Good.
- Admins can list / hard-delete / restore any scenario through
  `/api/admin/scenarios` and `/api/admin/scenarios/:id/access`.

### 2.5 Properties (canonical universe)
- `POST /api/properties` requires `requireManagementAccess`. Anyone
  except `investor` can create.
- Admin-created properties have `userId = NULL` ("shared / canonical").
  User-created properties have `userId = creator.id` ("personal").
  This is the **implicit** equivalent of a base-scenario membership.
- `DELETE /api/properties/:id` is a **soft archive** (`archivedAt`,
  `archivedBy`). Guarded by `requireManagementAccess` plus
  `checkPropertyAccess` ownership check.
- `POST /api/admin/properties/:id/restore` exists; **no super-admin-
  only hard-delete route was found**. (Worth re-confirming with you.)
- Removing a property "from a scenario" writes a `changeType="removed"`
  row to `scenario_property_overrides`. The canonical record is
  untouched. Good.

### 2.6 Users and profile
- **No public self-signup**. Users are created by admins via
  `POST /api/admin/users` or `POST /api/admin/invitations` (sends a
  random temp password via Resend).
- `PATCH /api/profile` Zod-whitelists `firstName, lastName, email,
  company, title, rebeccaOptOut`. Fields outside this list are stripped
  server-side. **`email` is editable by self** (except for `admin` and
  `checker` system accounts, which are blocked from changing email).
- `phone_number` **does exist on the users table** but is **not
  exposed** by the profile patch route. (Proposal asked for phone to
  be self-editable.)
- `role`, `canManageScenarios`, scenario assignment — **not** self-
  editable.
- Password change: separate flow `PATCH /api/profile/password`,
  requires `currentPassword`. Reset-by-link flow does not exist; admins
  set passwords directly.
- `PATCH /api/admin/users/:id` lets admins edit `email, firstName,
  lastName, company, title, role, canManageScenarios`. `guardSuperAdmin`
  blocks normal admins from modifying super-admin accounts. Promotion to
  super-admin requires super-admin.

### 2.7 Server-vs-client enforcement
Server-side enforcement is **good** for: route-level RBAC, profile-
field whitelist, property soft-delete, admin-only restore, super-
admin-only role promotion, ownership checks on property edit.
Client-side checks largely *mirror* server checks for UX (hiding
tabs/buttons), not as the security layer.

The notable client-only or client-leading concerns are:
- `canManageScenarios` is a per-user boolean threaded through the UI;
  every scenario-mutation route should be re-verified for actual
  server-side enforcement of this boolean (worth a focused pass).
- "Default scenario" creation runs on first authenticated request
  (`ensureDefaultScenario`); a malformed login flow could in principle
  race this. Low priority but worth noting.

---

## 3. Proposed target architecture (restated in implementation terms)

For traceability, the proposal you sent maps to these implementation
artifacts:

| Target concept | Implementation artifact you're proposing |
| --- | --- |
| Base scenario | One protected row, system-owned, `kind="base"`, `userId=NULL`. Only `super_admin` can destructively alter. |
| Admin (visibility) scenario | New row type derived from base; defines a property-id allowlist. Assigned to users. |
| User portfolio | New owned working object, separate table `portfolios`, with assumption diffs and visibility diffs against an assigned scenario. |
| Share | Existing `scenario_access`/`shares` model retargeted at portfolios. Strict view + fork-only. Email lookup that does **not** leak existence. |
| Property | Stays canonical. Only `super_admin` can hard-delete. Soft-delete elsewhere. |
| User profile | Self-edits limited to `company`, `phoneNumber`, `title`. |
| Three roles only | `super_admin`, `admin`, `user`. Deprecate `checker`, `investor`. |

---

## 4. Gap analysis

### 4.1 Schema
- **No `portfolios` table.** `scenarios` is the only saved working
  object.
- **No `kind="base"` scoping.** "Base" is a per-user `kind="default"`
  snapshot — there is no single, system-owned canonical base.
- **No `users.assigned_scenario_id` (or equivalent) FK.** Nothing in
  the schema represents "this user's starting visibility set".
- **Two overlapping share tables** (`scenario_access`,
  `scenario_shares`) — investigate whether one of them is now legacy.
- **Property "canonical vs personal" is implicit** (`userId IS NULL`)
  rather than a typed flag. Works, but the convention is fragile.
- **No `users.phoneNumber` editability** through the profile route
  (the column exists, the route doesn't expose it).

### 4.2 Permissions
- Property hard-delete is **not** super-admin-restricted (we couldn't
  find a hard-delete route at all — soft-delete is the only path).
  Confirm the intent matches.
- `canManageScenarios` is orthogonal to role and threaded through code
  — needs a focused pass to confirm every scenario-mutation route
  enforces it server-side.
- Sharing routes leak email existence (see 4.6).

### 4.3 Naming
- "Default scenario" is overloaded — sometimes user's personal starting
  point, sometimes admin-curated baseline. Confusing.
- "Portfolio" used as informal noun for the live set; not a saved
  entity. If the proposal lands, this becomes a real entity and the
  current colloquial use must be cleaned up.
- `kind="manual" | "autosave" | "default"` mixes lifecycle with
  intent. Better split or rename if the model changes.
- "Checker" and "Investor" appear in seed data, role enums, and UI
  copy. If deprecated, expect ~30+ touch points (UI copy, seed JSON,
  middleware, role enum, Zod, fixtures).

### 4.4 UI behavior
- The "load scenario" flow overwrites the user's live workspace. With
  the proposed split (live = current portfolio; viewing a scenario =
  read-only preview), the UI vocabulary "Load" and the destructive-
  swap behavior become misleading.
- Removing a property says "Remove" in some places and "Delete" in
  others. With a real visibility overlay this becomes user-meaningful
  and the copy gap matters.

### 4.5 Server-side enforcement
Mostly fine. Highest-value tightening:
1. Stop email-existence leak on share creation.
2. Move `canManageScenarios` checks to a single middleware and re-audit
   each scenario-mutation route.
3. Add a super-admin-only guard if we ever introduce a hard-delete for
   properties or for the seeded base scenario.

### 4.6 Sharing
- **Email-existence leak (high severity).** A sharer with no prior
  knowledge of who is in the directory can probe membership by trying
  emails and observing 404 vs 200. Standard mitigation: respond with
  the same neutral 200 outcome (e.g. "If that user exists, we sent
  them an invite") and either silently no-op or queue an outbound
  invite. Email a user-not-found notice to the sharer's own inbox if
  needed, not via the API response.
- **No fork-now affordance for sharees.** Sharees can `Load` but the
  UI doesn't have a clear "Save this as my own portfolio" action that
  is distinct from overwriting their live workspace. Easy to add.

### 4.7 Data governance
- Properties: soft-delete only — aligned.
- Scenarios: soft-delete + 30-day purge for normal users; admin can
  hard-delete. Aligned with the spirit of the proposal.
- Base scenario protection: **does not exist** because the base
  scenario itself does not exist as a single system row.

---

## 5. Terminology / nomenclature audit

Ambiguous, overloaded, or legacy terms found in code, schema, or UI:

| Term | Where | Why ambiguous |
| --- | --- | --- |
| **Scenario** | schema, routes, UI | Means snapshot, autosave row, per-user default, and admin baseline simultaneously. |
| **Default scenario** | `kind="default"`, `ensureDefaultScenario`, "Development", "[Initials] Default Scenario" | Different things in different files. |
| **Portfolio** | `/api/portfolio/risk-score`, dashboards, copy | Today: live property set. Proposal: a real saved entity. Will collide. |
| **Load** | `POST /api/scenarios/:id/load` | Destructively overwrites live state. Misleading if scenarios become read-only previews. |
| **Delete / Remove / Archive** | property routes, scenario routes | Inconsistently used for soft-delete vs visibility removal. |
| **Checker** | role, seeds, UI copy | Live-load-bearing today, possibly legacy under proposal. |
| **Investor** | role, seeds, UI copy | Same as Checker. |
| **`isLocked`** | `scenarios` column | Locks against edit, sometimes used to denote canonical/baseline-ness. Two meanings in one flag. |
| **`canManageScenarios`** | `users` column | Permission orthogonal to role. Unclear why role isn't sufficient. |

Recommend renaming **only after** decision questions in §7 are answered.

---

## 6. Risks and tradeoffs

1. **Migration risk: scenario semantics change.** Splitting `scenarios`
   into "admin scenario" + "user portfolio" touches every saved row.
   A backfill must classify each existing `kind="manual"` row as a
   user portfolio, every `kind="default"` row as either a portfolio or
   the seeded base, and every `kind="autosave"` row as portfolio
   autosave.
2. **Permission risk: deprecating roles.** `checker` is functional
   (`/api/calc-audit/*` is gated behind `requireChecker`). Removing
   the role without a replacement gating story silently widens or
   narrows access depending on direction. `investor` powers a
   read-only mode used for showing data without management rights —
   removing it without a replacement removes that mode entirely.
3. **Product risk: "assigned scenario" replaces personal default.**
   Users who today own their personal `default` will, under the
   proposal, see an admin-curated set on first login. If admins
   forget to assign one, the fallback must still be sensible.
4. **Sharing UX risk.** Closing the email-leak path means sharers can
   no longer get instant feedback that "no such user". Mitigations
   (send the sharer an email, or have admins pre-provision recipients)
   need to be designed.
5. **Schema-evolution risk.** The existing `scenarios.properties`
   JSONB snapshot is already known to drift on schema changes (per
   `.local/tasks/database-scenario-architecture.md`). Doubling down
   on per-property overrides is the right direction; widening the
   scope of saved snapshots without overlay support would amplify the
   drift problem.
6. **Dual share tables.** `scenario_access` and `scenario_shares`
   coexist. Refactoring sharing without first picking one introduces
   double-write bugs.

---

## 7. Questions for the developer (decision-blocking)

These are the ones that change the scope of any refactor plan. They
must be answered before tasks are created.

**Q1. Roles — `checker` and `investor`.**
Treat as legacy and migrate away (proposal as-written), or keep them
as functional roles with their own permissions surface? `checker` is
load-bearing for `/api/calc-audit/*` and `investor` powers a read-only
mode. If they go, what replaces those capabilities?

**Q2. "Base scenario" — one or many?**
The proposal describes **one** protected, system-owned base scenario.
The current code has **per-user** `kind="default"` snapshots. Which is
the target?
  (a) One system-owned canonical base (new row type, super-admin only).
  (b) Keep per-user defaults, just rename and protect them.
  (c) Both — system base AND per-user starting points derived from it.

**Q3. "Admin scenario" — new entity or repurposed `scenarios.kind`?**
Should the visibility/assignment scenario be:
  (a) A new table (`admin_scenarios`) with explicit property-id
      allowlist columns, cleanly separated from user portfolios; or
  (b) A `kind="visibility"` variant of the existing `scenarios` table?

**Q4. "User portfolio" — new entity or rename of `kind="manual"`?**
  (a) New `portfolios` table with explicit FK to `assignedScenarioId`,
      and `assumption_diffs` + `visibility_diffs` JSONB, leaving
      `scenarios` for admin objects only.
  (b) Reuse `scenarios` with `kind="portfolio"`; live with the
      conceptual overlap.
This is the highest-leverage choice and most other tasks fall out of it.

**Q5. Sharing — close the email-existence leak how?**
  (a) Always return a generic 200 ("If that user exists, we sent
      them an invite") and silently no-op when the email isn't
      registered.
  (b) Send the sharer an out-of-band email if recipient not found
      ("you tried to share with X, they don't have an account
      yet").
  (c) Allow admins to pre-provision recipients (invite flow), and
      reject the share at the API level only with a generic error.
We recommend (a) + (b) combined.

**Q6. Property hard-delete.**
Today there is **no** hard-delete route — only soft-archive. Do you
want a super-admin-only hard-delete, or is soft-archive forever
sufficient? Either is defensible; we should make the choice explicit.

**Q7. `canManageScenarios` boolean.**
Should this stay as a per-user permission orthogonal to role, or be
folded into role definitions? It complicates RBAC reasoning today.

**Q8. Profile self-edit fields.**
Proposal says `company`, `phone`, `title`. Current code allows
`firstName`, `lastName`, `email`, `company`, `title`, `rebeccaOptOut`.
Should we tighten to the proposal exactly (drop `firstName`,
`lastName`, `email`, `rebeccaOptOut` from self-edit) and add
`phoneNumber`? Or keep names self-editable for UX reasons?

**Q9. Dual share tables.**
`scenario_access` vs `scenario_shares` — is one of these already
considered legacy? If not, which should be the canonical table going
forward?

**Q10. Is there a multi-tenant boundary we must preserve?**
`userGroupId` and `companyId` already exist on users. Sharing scenarios
"to a company" already has dedicated paths (`shared_company`). Does the
proposed "share by email" flow preempt or coexist with company-level
auto-sharing?

---

## 8. Suggestions to refine the proposed architecture

We do not recommend accepting the proposal as-written. The
following refinements would simplify the refactor and reduce risk:

1. **Treat the base scenario as a *view*, not a row.**
   Rather than a single `kind="base"` row that everything forks from,
   model the base as `the set of all non-archived properties with
   userId IS NULL` — exactly what the system already enforces via
   the implicit canonical-vs-personal split. Promote that to an
   explicit `properties.scope = 'canonical' | 'personal'` column so
   the rule is typed and queryable. This avoids inventing a new row
   to "protect" something that's really a query.

2. **Make "admin scenario" be a *visibility filter*, not a property
   snapshot.** Store property-id allowlist + denylist, plus
   assumption defaults to override the canonical ones. Do not
   snapshot property rows — let the engine merge `canonical →
   admin filter → portfolio diff` at read time. This is the same
   architectural direction `database-scenario-architecture.md`
   already pointed at.

3. **Introduce `portfolios` as a new table.** Don't reuse `scenarios`
   for this. The two concepts have different lifecycles, different
   permission models, and different UX vocabulary. Trying to keep
   them in one table will recreate the same overloaded-`kind`
   problem in a year.

4. **Fold `canManageScenarios` into role.** If the only users who
   can save portfolios are `admin`/`super_admin`/`user` (and not
   `checker`/`investor`), encode that as a role capability matrix
   in one place instead of a per-user override boolean.

5. **Don't deprecate `checker`/`investor` until you've named what
   replaces them.** If the answer is "they're truly gone", migrate
   them to `user` and remove `requireChecker` (folding `/api/calc-
   audit/*` into `requireAdmin` or behind a feature flag). If they
   stay, accept that the proposal's "3 roles only" line is aspirational
   and adjust the audit accordingly.

6. **Sharing: keep both `scenario_access` and `scenario_shares` only
   if their purposes are explicit.** If `scenario_shares` is
   admin-tracking and `scenario_access` is enforcement, document it.
   If they overlap, kill one before redesigning sharing on top of
   them.

7. **Profile self-edit fields: keep `firstName`/`lastName`
   self-editable.** Names change (marriage, transliteration,
   correction). Locking them down causes more support load than it
   prevents abuse, and identity is anchored on `id`/`email`, not name.
   Just tighten `email` so users can't move their own account to a
   different person's address.

---

## 9. Refactor plan (staged)

Sequenced so each phase is independently mergeable, reversible, and
small enough to review. Numbers in parentheses are rough size
estimates relative to a single typical task.

**Phase 0 — Decisions (this audit, blocking).**
Answer Q1–Q10. (–)

**Phase 1 — Quick wins, no schema change. (1)**
- Close email-existence leak on share creation.
- Add `phoneNumber` to `PATCH /api/profile` whitelist.
- Audit every scenario-mutation route for explicit `canManageScenarios`
  enforcement; add a single middleware and apply uniformly.
- Document (in a single doc, not in code) the current meaning of
  `kind`, `isLocked`, `accessType`, `grantType`, and the
  `scenario_access` vs `scenario_shares` split.

**Phase 2 — Property scope flag. (1)**
- Add `properties.scope = 'canonical' | 'personal'` (typed
  replacement for the `userId IS NULL` convention). Backfill from
  existing data. Rename "remove from scenario" UI copy to "hide".

**Phase 3 — Sharing cleanup. (1)**
- Reconcile `scenario_access` and `scenario_shares` into one canonical
  table. Migrate the other.
- Add a "Save as my own portfolio" CTA on shared-scenario load.

**Phase 4 — Admin scenario as visibility filter. (2)**
- New columns on `scenarios` (or new `admin_scenarios` table per Q3)
  for `propertyAllowlist`, `propertyDenylist`,
  `assumptionOverrides`. Server merges at read time.
- New admin UI to author + assign.
- New `users.assignedScenarioId` FK.

**Phase 5 — Portfolios as their own entity. (2)**
- New `portfolios` table. Migrate `kind="manual"` rows.
- Update sharing to target portfolios, not scenarios.
- Update "Load" semantics: viewing a scenario or another user's
  portfolio is read-only; editing always happens on a portfolio you own.

**Phase 6 — Role consolidation (per Q1). (1)**
- Either deprecate `checker`/`investor` (and replace their hooks) or
  formalize them. Migrate seeds, UI copy, and the audit doc you wrote
  in Phase 1.

Total: ~8 task-units of work, plus the upfront decisions.

---

## 10. Proposed target model

Tables (additions/changes only — existing not relisted):

- `properties.scope` text NOT NULL DEFAULT `'canonical'` CHECK in
  `('canonical','personal')`.
- `admin_scenarios` (new) — `id`, `name`, `description`, `createdBy`,
  `propertyAllowlist int[]`, `propertyDenylist int[]`,
  `assumptionOverrides jsonb`, `isProtected bool`, soft-delete.
- `users.assigned_admin_scenario_id` (new FK) — nullable; null means
  "fall back to base view".
- `portfolios` (new) — `id`, `userId` (owner), `assignedAdminScenarioId`,
  `name`, `assumptionDiff jsonb`, `visibilityDiff jsonb`, `createdAt`,
  `updatedAt`, soft-delete.
- `portfolio_shares` (new or renamed from `scenario_access`) — single
  canonical sharing table targeting portfolios.
- Enums: `userRole` shrunk to `super_admin | admin | user` **only if**
  Q1 lands on deprecation. Otherwise unchanged.

Permissions (server-enforced):
- `super_admin`: anything, including hard-delete of properties and
  destructive edits on `admin_scenarios` flagged `isProtected`.
- `admin`: same as `super_admin` minus the two carve-outs above.
- `user`: create/edit own portfolios; share own portfolios; soft-
  archive own personal properties; cannot delete canonical properties.
- Sharees: read + fork-to-own-portfolio. Never edit owner's
  portfolio.

Inheritance and fallback:
- A user with no `assignedAdminScenarioId` sees the canonical base
  view (all `properties.scope='canonical' AND archivedAt IS NULL`).
- A portfolio with no diffs is identical to its assigned admin
  scenario.

---

## 11. Server-side action inventory

Routes that should exist after the refactor (additions and renames):

- `GET/POST/PATCH/DELETE /api/admin/admin-scenarios` — author and
  assign visibility scenarios.
- `POST /api/admin/users/:id/assign-scenario` — set
  `assigned_admin_scenario_id`.
- `GET/POST/PATCH/DELETE /api/portfolios` — owned portfolios.
- `GET /api/portfolios/shared-with-me`.
- `POST /api/portfolios/:id/shares` — replaces
  `POST /api/scenarios/shares`. Returns generic success regardless of
  recipient existence; sends out-of-band email to the sharer if
  recipient not found.
- `POST /api/portfolios/:id/fork` — explicit fork-from-shared
  affordance.
- `POST /api/admin/properties/:id/scope` — flip `scope` between
  `canonical` and `personal`. Super-admin only when downgrading.
- `DELETE /api/admin/properties/:id/hard` — only if Q6 lands on
  "yes, allow hard delete". Super-admin only.

Routes that should be retired or renamed:
- `POST /api/scenarios/:id/load` (destructive) → split into
  `GET /api/scenarios/:id/preview` (already exists) and
  `POST /api/portfolios/from-scenario` (explicit fork).
- `POST /api/scenarios/auto-save` → `POST /api/portfolios/:id/autosave`.

---

## 12. Recommended implementation order

Pending your decisions:

1. Phase 1 (quick wins) — independently mergeable, low risk.
2. Phase 2 (property scope flag) — schema additive, no behavior
   change.
3. Phase 3 (sharing cleanup) — depends on Q9.
4. Phase 4 (admin scenarios) — depends on Q2, Q3.
5. Phase 5 (portfolios) — depends on Q4, follows Phase 4.
6. Phase 6 (role consolidation) — depends on Q1, follows everything
   else so naming churn doesn't ripple.

Each phase becomes its own project task, sized for one reviewable
change.

---

## Relevant files
- `shared/schema/auth.ts`
- `shared/schema/scenarios.ts`
- `shared/schema/properties.ts`
- `shared/schema/config.ts`
- `shared/schema/scenario-results.ts`
- `shared/constants-enums.ts`
- `server/auth.ts`
- `server/routes/scenarios.ts`
- `server/routes/scenarios-access.ts`
- `server/routes/admin/scenarios.ts`
- `server/routes/admin/users.ts`
- `server/routes/properties.ts`
- `server/routes/profile.ts`
- `server/routes/scenario-helpers.ts`
- `server/storage/financial/scenarios-crud.ts`
- `server/storage/properties.ts`
- `server/seeds/index.ts`
- `server/seeds/properties.ts`
- `server/seeds/users.ts`
- `server/seed-users.json`
- `server/integrations/resend.ts`
- `server/migrations/role-partner-to-user-001.ts`
- `server/migrations/scenario-system-unique-001.ts`
- `client/src/lib/auth.tsx`
- `client/src/app-guards.tsx`
- `client/src/lib/api/types.ts`
- `client/src/components/scenarios/ShareScenarioDialog.tsx`
- `client/src/components/admin/ScenariosTabSections.tsx`
- `.local/tasks/database-scenario-architecture.md` (prior plan, related)