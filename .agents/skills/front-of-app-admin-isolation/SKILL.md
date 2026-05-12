---
name: front-of-app-admin-isolation
description: Hard product rule for H+ Analytics — the front of the app NEVER navigates the user to the Admin section. Admin users reach Admin only through the sidebar's "Admin" menu item. Use whenever you create, edit, or review any front-of-app component (anything outside `client/src/components/admin/**` and `client/src/pages/admin/**`). Replaces the reflex of dropping "Open Specialist →" or "Admin → …" jump links into product surfaces with a strict isolation boundary that is enforced by `tests/audit/no-front-app-admin-links.test.ts`.
---

# Front-of-App ↔ Admin Isolation

## The rule (non-negotiable)

The front of the app — every page and component visible to a normal user
— must NEVER programmatically navigate to, or render a jump link into,
the Admin section. Admin users reach Admin **only** through the
sidebar's "Admin" menu item rendered by `client/src/components/Layout.tsx`.

This means, for every file under `client/src/` that is NOT in the
whitelist below:

- ❌ Do not import `setAdminSection` from `@/lib/admin-nav`.
- ❌ Do not import anything else from `@/lib/admin-nav`.
- ❌ Do not render a button or link whose `onClick` lands the user on
  `/admin` or changes the active admin section.

Plain-text mentions are fine. Telling the user "this setting lives in
Admin → Model Defaults" inside informational copy is allowed and often
helpful — it explains where a value comes from without performing
navigation. The forbidden thing is the JUMP, not the mention.

## Resource presentation is also forbidden on the front of the app

Beyond the navigation rule above, the front of the app must NOT render any
presentation of the resource inventory — Tables, APIs, URL Links, Constants
Tables, or any other external source. No cards, banners, panels, badges,
callouts, or "data source" widgets. The resource inventory has exactly one
home: `Admin → AI → Intelligence → Knowledge & Resources` (see
`hplus-admin-nav-ia` for the canonical tree).

The single allowed exception is a **Constant** (e.g. a depreciation life or
tax rate) that may appear as **discreet muted inline text** on the
front-of-app calculation page where the math actually consumes it — for
example, a small label "7 yr MACRS" beside a depreciation field. Even that
exception is bounded:

- Inline only — never a card, panel, or banner.
- Muted typography — not an attention-grabbing accent.
- No source citation, no agent list, no health icon, no jump link.
- No "open Tables" or "view details" affordance.

If you find yourself wanting to show *which* Specialist tunes a value, *when*
it was last refreshed, or *where* the data came from on a product page, the
answer is no — that all lives in `Knowledge & Resources`.

## What you do instead

When a front-of-app surface needs to *explain* that something is
governed elsewhere (e.g. "this field is read-only because it comes from
Model Constants"), say so in plain text — without a click target.
Example:

```tsx
<span data-testid="text-source-model-constants">
  Read-only · Sourced from Model Constants
</span>
```

When a front-of-app surface needs to *report* a Specialist or
prerequisite failure (e.g. `PrerequisitesFailedPanel` in
`client/src/components/company/SpecialistRequirementsPanel.tsx`), it
shows the failure reason and tells the user that an administrator can
fix it. It does NOT render a button that opens the admin page.

## The whitelist

Only these files may touch admin navigation:

| Path | Why |
|------|-----|
| `client/src/lib/admin-nav.ts` | The helper itself. |
| `client/src/components/admin/**` | The admin shell and admin-only widgets. |
| `client/src/pages/admin/**` | The admin pages. |
| `client/src/pages/Admin.tsx` | The admin entry page. |
| `client/src/components/Layout.tsx` | The sidebar that renders the single allowed `Admin` menu item. |
| `client/src/lib/analyst-mount-points.ts` | The Analyst deep-link resolver. Returns href + navigate handlers consumed by Analyst verdicts; produces no user-visible chrome on its own. |

Extending the whitelist is a product decision, not a code-cleanup
decision. If you genuinely need a new entry:

1. Add the path to the `WHITELIST` (or `WHITELIST_PREFIXES`) array in
   `tests/audit/no-front-app-admin-links.test.ts`.
2. Add a row to the table above with a one-line justification.
3. Mention the rationale in your commit message.

## How the rule is enforced

`tests/audit/no-front-app-admin-links.test.ts` walks every `.ts` /
`.tsx` file under `client/src/` (excluding `.test.*` files) and fails
the `Run Tests` workflow if any non-whitelisted file imports
`setAdminSection` or anything from `@/lib/admin-nav`. That is the only
mechanism through which the front of the app can perform an admin jump,
so blocking it at the import level is sufficient — there is no way to
introduce an admin jump without tripping this gate.

Plain-text mentions of admin paths inside JSX or comments are NOT
policed; the test deliberately skips that to avoid false positives on
informational copy ("set this in Admin → Model Defaults").

## Common mistakes this skill prevents

- Adding an "Open Specialist →" button to an explanatory panel on
  Property Edit or Company Assumptions because it "feels helpful".
- Wiring a `setAdminSection("constants")` click handler into a
  read-only label on a property field to "save the user a click".
- Reintroducing the rich `SpecialistRequirementsPanel` on the
  Management Company Assumptions page after it has been pared down.

## Why the rule exists

The front of the app is the product. Admin is the back office. Users
should never feel like they wandered into a different application by
clicking a label. Investors and operators only ever see product
surfaces; admins explicitly opt into Admin via the sidebar item. Mixing
the two leaks role boundaries, makes the product look like a control
panel, and creates training drag every time a user lands somewhere they
didn't expect.
