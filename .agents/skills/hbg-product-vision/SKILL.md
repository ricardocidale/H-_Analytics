---
name: hbg-product-vision
description: "H+ product identity, design tenets, workflow principles, navigation IA, user roles, white-labeling, and quality bar for all future work. Load before planning any new feature or page — establishes the 'Bloomberg Terminal for boutique hospitality' standard that every screen must meet."
---

## Product Identity

HBG Portal is a "Bloomberg Terminal for boutique hospitality" — it must feel like an indispensable institutional tool that hospitality investment professionals trust for decision-making, not a SaaS web app.

## Core Design Tenets

Apply to every future task:

1. **Deterministic integrity** — every number must be traceable to a formula; never approximate with AI
2. **Transparency** — users can always see how any number was derived (formula accordions, GAAP badges, audit opinions)
3. **Professional elegance** — every screen should look like it belongs in an investment committee presentation
4. **Hospitality-native vocabulary** — use the language of hotel operators and investors, never generic software terms (see `hbg-business-model` skill)
5. **Progressive disclosure** — show summary first; let users drill into detail on demand

## Workflow Design Principles

1. **Minimize navigation** — bring tools to the user's current context (inline research buttons, apply-research dialogs, formula accordions) rather than sending them to separate pages
2. **Research should inform, not dictate** — AI benchmarks appear as suggestions (yellow pills next to inputs) that users can accept, modify, or ignore; never auto-apply without user confirmation
3. **Verification should build confidence** — the audit opinion system gives users institutional-grade trust in their projections
4. **Scenarios should be effortless** — save current state as a named snapshot; load to compare; never lose the base case

## Navigation and Information Architecture

**Home group:** Dashboard, Properties, Management Company

**Tools group:** Simulation, Property Finder, Map View

**Settings group:** Profile, Scenarios, General Settings

**Footer:** Tour, Help, Admin, Sign Out

**Admin sidebar sections:** Brand, Business, Research, Design, AI Agents, System, Logs

## User Roles and Capabilities

| Role | Access |
|------|--------|
| Admin | Everything + admin panel; bypasses all property filters |
| Partner | Full investment toolkit; edit assumptions, scenarios, ICP |
| Checker | Read-only + verification tools |
| Investor | Dashboard + filtered properties only (read-only) |

## White-Labeling and Multi-Tenancy

- Each user group can have custom branding: logo, theme, asset descriptions for AI context
- Theme resolution cascades: user → group → system default
- AI context (Marcela knowledge base) reflects the group's properties and branding

## Quality Bar for Every New Page or Feature

Before marking any new page done, verify against these skills:

- **Width conventions:** `consistent-card-widths` skill
- **Save patterns:** `save-button-placement` skill
- **Design system:** `hbg-design-philosophy` skill
- **Accessibility and typography:** `nai-web-guidelines` skill
- **Icon routing:** all icons must go through `@/components/icons/` — never import `lucide-react` directly
- **Financial figures:** `font-mono tabular-nums` on every number display
- **PageHeader:** every user-facing page uses `<PageHeader>` for its title bar with primary actions in the `actions` slot

## Cross-Skill Reference Map

| Skill | Covers |
|-------|--------|
| `hbg-business-model` | Domain vocabulary, USALI waterfall, property lifecycle |
| `financial-engine` | Calculation contracts, engine architecture, return metrics |
| `verification-system` | Audit opinion system, three-tier checker |
| `hbg-design-philosophy` | Visual identity, color palette, typography, hospitality UX |
| `integrations-infrastructure` | External services and their boundaries |
| `marcela-ai-system` | AI agent architecture and research pipeline |
| `api-backend-contract` | Server routes, storage interface, auth middleware |
| `specialist-persona-naming` | AI specialist names (Gustavo, Ana, Bia…) |
| `nai-web-guidelines` | Accessibility, forms, animation, anti-patterns |
| `nai-design-system` | Component patterns, icon rules, design tokens |
| `nai-code-review` | Code review checklist for NAI repos |

## Related Skills

- hbg-business-model
- hbg-design-philosophy
- financial-engine
- nai-web-guidelines
- nai-code-review
