---
title: "No duplicate menu items in a hierarchical navigation tree"
date: 2026-05-02
category: architecture-patterns
module: admin-navigation
problem_type: best_practice
component: frontend_stimulus
severity: high
applies_when:
  - Adding a new section to the Admin or AI Intelligence sidebar
  - Brainstorming where a feature lives in the navigation tree
  - A feature could plausibly belong in more than one nav section
tags: navigation, ux, admin-sidebar, ai-intelligence-sidebar, information-architecture
---

# No duplicate menu items in a hierarchical navigation tree

## Context

During IA brainstorming for the H+ Admin sidebar (Sources, Resources) and AI Intelligence
(Knowledge Registry), a "Knowledge Base" item was proposed in two places simultaneously:

1. `AI Intelligence → Rebecca AI Assistant → Knowledge Base` — already existed
2. `AI Intelligence → Knowledge Registry → Knowledge Base` — newly proposed

The product owner caught this and stated the principle clearly: a hierarchical menu tree
must rigorously have one and only one item per destination. Two items pointing at the same
place is poor UX and indicates the tree itself is not resolved yet.

## Guidance

**One destination = one menu item. No exceptions.**

When a feature could belong in more than one place, pick its canonical home based on
primary purpose, then remove all duplicates:

| Content type | Canonical home |
|---|---|
| Platform documentation the AI assistant reads | `AI Intelligence → Rebecca AI Assistant → Knowledge Base` |
| External data / research the app reads from | `Admin → Sources → [sub-item]` |
| Analyst-generated calibration output | `AI Intelligence → [Analyst section or dedicated item]` |
| Structured reference tables | `Admin → Sources → Tables` |
| External API registrations | `Admin → Resources → APIs` |

If two proposed items have the same label in the tree, the tree is wrong — resolve it
before writing any code.

## Why This Matters

- Users build a mental model of the app from the sidebar. Seeing the same label twice
  signals that neither instance is the "real" one, destroying trust.
- Duplicate destinations create maintenance debt: updates to one copy silently diverge
  from the other.
- In this app, the sidebar is the primary navigation for admin power users. Its clarity
  is load-bearing.

## When to Apply

- Every time a new sidebar item is proposed for `AdminSidebar.tsx` or `AiIntelligenceSidebar.tsx`
- Every time a brainstorm doc or skill proposes a nav tree — check for duplicates before
  finalising
- When reviewing PRs that touch sidebar section unions (`AdminSection`, `AiIntelligenceSection`)

## Examples

**Wrong — duplicate "Knowledge Base":**
```
AI Intelligence
├── Rebecca AI Assistant
│   ├── Configuration
│   ├── Knowledge Base        ← item 1
│   └── Conversations
└── Knowledge Registry
    └── Knowledge Base        ← item 2 (duplicate destination — INVALID)
```

**Right — single canonical home:**
```
AI Intelligence
├── Rebecca AI Assistant
│   ├── Configuration
│   ├── Knowledge Base        ← one and only home for KB
│   └── Conversations
└── Assumption Guidance       ← separate item, different destination
```

## Resolution Applied

"Knowledge Registry" was removed from the AI Intelligence tree entirely. It had no
unique content:
- Knowledge Base → already under `Rebecca AI Assistant`
- Comparables → confirmed under `Admin → Sources → Market Research`
- Market Research → confirmed under `Admin → Sources`
- Assumption Guidance → Analyst output, lives in AI Intelligence as its own item

The hard rule is now encoded in `.agents/skills/hplus-admin-nav-ia/SKILL.md` as Rule 4.

## Related

- `.agents/skills/hplus-admin-nav-ia/SKILL.md` — canonical nav tree and all placement rules
- `docs/solutions/architecture-patterns/admin-sidebar-ia-sources-resources-2026-05-02.md` — Sources/Resources IA decision
- `artifacts/hospitality-business-portal/src/components/admin/AdminSidebar.tsx`
- `artifacts/hospitality-business-portal/src/components/ai-intelligence/AiIntelligenceSidebar.tsx`
