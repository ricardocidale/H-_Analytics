---
title: "Intelligence → LLMs: workflow cards spec — accordion, vendor/model preferences, Analyst button, dirty-state guard"
date: 2026-05-02
category: architecture-patterns
module: intelligence-llms
problem_type: best_practice
component: frontend_admin
severity: high
applies_when:
  - Building or modifying the Intelligence → LLMs page
  - Adding a new LLM workflow to the system
  - Designing vendor/model preference UI
  - Adding Analyst button behavior for LLM workflows
tags: llms, intelligence, accordion, vendor-model, analyst-button, save-button, dirty-state, prompts
---

# Intelligence → LLMs: workflow cards spec

## Context

The LLMs page (`Intelligence → LLMs`) is the single home for managing every LLM
workflow in the system — what they do, which vendors and models they use, what prompts
they run, which Specialists are responsible for them, and whether they are working.
Admin users can read the configuration, change vendor/model preferences, save, and
trigger the Analyst to test and update recommendations.

## Page structure

Same accordion-table pattern as the Specialists page. One row per LLM workflow.

### Collapsed row (accordion header)

| Left | Right |
|------|-------|
| Workflow name / short description | 🟢/🔴 status icon · last updated timestamp |

Clicking the row header expands to the full card. Only one card should be open at a time
(or a "one open" accordion policy — TBD by designer).

---

## Expanded card contents

### 1. Workflow description
Full plain-language description of what this LLM workflow does.
Examples: "Generates property risk narrative for Executive Summary slide",
"Classifies comparables by asset type and deal structure".

### 2. Vendors and models
For each vendor involved in this workflow:

- **Vendor name** (e.g. Anthropic, OpenAI, Google)
- **Model selection dropdown** — lists all available models for that vendor
  - The Analyst's preferred/recommended model is highlighted inside the dropdown
    via color (e.g. highlighted row) or an icon (e.g. ✦ or star) directly on the
    dropdown option — NOT a separate field
  - The currently saved preference is pre-selected in the dropdown
  - Admin can change the selection; this marks the card as dirty (unsaved)

If the workflow uses more than one vendor, each vendor gets its own block.

### 3. Analyst button (per card)

Follows the `analyst-research-buttons` skill naming convention.

When clicked, the Analyst button does **two things in sequence**:

1. **Regenerates vendor and model lists** — fetches latest available vendors and models
   for this workflow context, then indicates its recommended vendor+model inside each
   dropdown (via color or icon on the dropdown option itself)
2. **Tests the LLM workflow** — fires a real test run of the workflow end-to-end,
   verifies it is responding correctly, updates status icon and last updated timestamp
3. Writes result to the internal activity log

During run: button shows spinner + "Running…", status icon shows amber/pending.
On completion: status icon updates, last updated timestamp updates, dropdowns refresh
with new recommendations highlighted.

### 4. Save button

Saves the admin's selected vendor/model preferences for this workflow.
- Appears alongside (or adjacent to) the Analyst button
- Follows app-standard Save button placement (see save-button-placement skill)
- Only enabled when the card is dirty (has unsaved changes)
- On success: card returns to clean state, confirmation toast

### 5. Status and timestamp

- 🟢 Working / 🔴 Error / 🟡 Not tested
- "Last updated: X ago" — timestamp of last successful Analyst test or manual save
- On hover: full ISO datetime + last error message if status is red

### 6. Prompts

Shows all prompts used by this workflow. Each prompt entry shows:

- **Prompt label** (e.g. "System prompt", "User message template", "Fallback prompt")
- **Content**: either the literal prompt text (in a code/text block) OR a description
  of how the prompt is dynamically constructed (e.g. "Built from property metadata
  + comparable set + calibration guidance at runtime")
- If the workflow has more than one prompt, all are listed in order

Prompts are **display-only** in this card. Prompt editing is out of scope for this page.

### 7. Specialists involved

Lists which Specialist(s) are responsible for this LLM workflow:

- If one or more Specialists: list by human name + role
  (e.g. "Helena — Tax Authority Research")
- If **no Specialist is assigned**: show a prominent warning flag:
  > ⚠ No Specialist assigned — all LLM workflows should have a Specialist in charge

  This flag is a data-quality indicator. The Analyst button should attempt to suggest
  an appropriate Specialist when regenerating (if it can determine one from context).

---

## Dirty-state guard

If the admin has changed any preference in an expanded card and attempts to:
- Collapse the accordion row
- Navigate away from the LLMs page
- Switch to another section in the sidebar

…the app must interrupt with a confirmation dialog:

> **Unsaved changes**
> You have unsaved changes to [Workflow Name].
> [Save]   [Discard]   [Keep editing]

- **Save**: saves and proceeds with navigation
- **Discard**: discards changes and proceeds
- **Keep editing**: stays on the card

This guard applies per-card. Cards with no changes do not trigger it.

---

## Layout sketch

```
┌── LLM Workflows ────────────────────────────────────────────────────────┐
│                                                                          │
│  🟢  Executive Summary Risk Narrative            Last updated: 2 days ago │
│  ─────────────────────────────────────────────────────────────────────   │
│  🔴  Comparable Classification                   Last updated: 14 days ago│
│  ─────────────────────────────────────────────────────────────────────   │
│  🟢  ICP Intelligence Scoring   ▼ (expanded)    Last updated: 1 day ago  │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Description                                                      │   │
│  │  Scores companies in the ICP database by fit, using firmographic  │   │
│  │  signals and deal stage context.                                  │   │
│  │                                                                   │   │
│  │  Vendors & Models                                                 │   │
│  │  Anthropic   Model: [Claude 3.5 Sonnet ✦ recommended ▾]          │   │
│  │  OpenAI      Model: [GPT-4o                              ▾]       │   │
│  │                                                                   │   │
│  │  Prompts                                                          │   │
│  │  System prompt: "You are a hospitality investment analyst…"       │   │
│  │  User template: Built from ICP record + deal stage at runtime     │   │
│  │                                                                   │   │
│  │  Specialists involved                                             │   │
│  │  Ana — ICP Intelligence                                           │   │
│  │                                                                   │   │
│  │                           [Run Analyst ↻]   [Save]               │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

Analyst recommendation indicator in dropdown:
```
Model: [ Claude 3.5 Sonnet  ✦  ▾ ]
        ┌──────────────────────────┐
        │ ✦ Claude 3.5 Sonnet      │  ← highlighted (recommended)
        │   Claude 3 Opus          │
        │   Claude 3 Haiku         │
        └──────────────────────────┘
```

---

## Data model notes (for backend)

Each LLM workflow entry needs:
```
{
  id: string,
  name: string,
  description: string,
  status: "working" | "error" | "untested",
  last_updated: ISO datetime,
  vendors: [
    {
      vendor_id: string,          // "anthropic" | "openai" | "google" | …
      models_available: string[], // fetched/refreshed by Analyst
      model_selected: string,     // admin-saved preference
      model_recommended: string   // Analyst recommendation (shown in dropdown)
    }
  ],
  prompts: [
    {
      label: string,
      content_type: "literal" | "dynamic",
      content: string             // literal text OR description of construction
    }
  ],
  specialist_ids: string[],       // empty array = warning flag
  activity_log_ref: string        // link to internal activity log entries
}
```

---

## Related

- `.agents/skills/hplus-admin-nav-ia/SKILL.md` — canonical nav tree and all placement rules
- `.agents/skills/analyst-research-buttons/SKILL.md` — Analyst button naming convention
- `.agents/skills/save-button-placement/SKILL.md` — Save button placement standards
- `docs/solutions/architecture-patterns/intelligence-specialists-page-2026-05-02.md` — Specialists accordion (same UX pattern)
- `docs/solutions/architecture-patterns/sources-ux-status-analyst-button-2026-05-02.md` — Sources UX (same Analyst button pattern)
