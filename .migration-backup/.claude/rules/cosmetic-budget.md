# Cosmetic-Churn Budget

## Rule

Commits that touch ONLY cosmetic/branding assets (opengraph images, social preview PNGs, favicon tweaks, CSS-only polish with no user-value change) are budget-constrained.

**Budget:** One cosmetic-only commit per calendar month, batched.

## Why

`rewritetax.md` scoreboard flagged 88 opengraph / social-sharing image swaps in repo history to date. Each one ran a full `verify:summary` + CI cycle (~1 unit of agent cost × 88 = ~$88 visible). Rate is ~1/day, disproportionate to the value delivered.

Cosmetic changes are low-information-per-dollar. They're often triggered by momentary aesthetic preference rather than measured user feedback.

## What counts as "cosmetic-only"

A commit is cosmetic-only if ALL of:
- It modifies only image/font/branding asset files (`.jpg`, `.png`, `.svg` under `client/public/` or `client/src/assets/`)
- OR it modifies only Tailwind class names with no JSX structural change
- OR it modifies only `index.html` `<meta>` tags (OpenGraph, Twitter, etc.)
- AND it does NOT touch any file in `client/src/components/`, `client/src/pages/`, `client/src/features/`, `server/`, `shared/`, `calc/`, `engine/`

Pragmatic test: if the commit diff is >95% binary bytes or CSS-class swaps, it's cosmetic.

## Enforcement

The commit-msg hook at `.husky/cosmetic-warn` emits a **warning** (not a block) when it detects a cosmetic-only commit. The warning asks:

> "Cosmetic-only commit detected. Have you already committed a cosmetic change this month? (See `git log --since='4 weeks ago' --diff-filter=M -- client/public/opengraph.jpg`). If yes, consider batching."

The user (or agent) can always override by committing anyway. The warning is a nudge.

## Exempt categories

- **Brand refresh sprints** — planned once/quarter, batched. Announce in session memory; multiple cosmetic commits during the sprint are fine.
- **Bug fixes for image regressions** (corrupt file, wrong resolution, broken transparency). These are correctness fixes, not churn.
- **First-time asset additions** (new feature ships with its initial branding). Not churn.

## Who enforces

- **Claude Code:** before committing an image or branding asset, check when the last same-category cosmetic commit landed. If <4 weeks ago, batch the change or skip.
- **Replit Agent:** same. Specifically: do not commit opengraph/social-image swaps except during a declared brand sprint.
- **Human steward:** can override any budget decision explicitly. "Ship the image" is a valid answer; the rule exists to make the cost visible, not to create drag.

## Related

- `rewritetax.md` §"Where the Bleeding Is" pattern #1
- `.claude/rules/agent-collision-hygiene.md` (different rule, similar philosophy of bounded-frequency actions)
- `.husky/cosmetic-warn` (the warning-only hook that implements this)
