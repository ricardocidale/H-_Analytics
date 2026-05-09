---
title: "Intelligence: Specialists accordion page replaces individual Specialist group menu items"
date: 2026-05-02
category: architecture-patterns
module: intelligence-nav
problem_type: best_practice
component: frontend_nav
severity: high
formerly: ai-intelligence-specialists-page-2026-05-02.md
applies_when:
  - Building or modifying the Intelligence sidebar
  - Adding a new Specialist
  - Building the Specialists directory page
  - Referencing LLMs, Sources, or APIs from within a Specialist panel
tags: intelligence, specialists, accordion, read-only, nav-ia
---

# Intelligence: Specialists accordion page replaces individual Specialist group menu items

## Context

The Intelligence sidebar previously grouped Specialists by domain (Management Company,
Property, Photos, Portfolio Ops, Constants & Authority Sources). Each domain was a separate
sidebar item with its own sub-items. This caused sidebar clutter and forced admins to hunt
across groups to find a specific Specialist.

The solution is a single **Specialists** page — an accordion-table list of ALL research
Specialists, each row expandable to show full detail. The domain groups disappear from the
sidebar entirely.

## Guidance

### Sidebar structure (Intelligence)

Current structure as of 2026-05-09 (`IntelligenceSidebar.tsx`):

```
Intelligence (/intelligence)
├── The Analyst
│   ├── Gustavo  (Analyst Orchestrator — informational / read-only)
│   ├── Specialists   ← single accordion-table page (all Specialists)
│   └── Assumption Guidance
├── Agents
│   ├── Rebecca  (Configuration, Knowledge Base, Conversations)
│   └── Iris     (Resource Maintainer)
├── Runs          ← unified cross-type run log (Analyst / Slide Factory / Iris)
├── Knowledge & Resources
│   ├── Knowledge Registry
│   └── Country Economic Data
└── System
    ├── System Health
    ├── Scheduled Research
    ├── LLMs
    └── Vector Search Latency
```

The following items were **removed** from the sidebar:
- Management Company (and sub-items: Funding Intelligence, Revenue Intelligence, ICP Intelligence)
- Property (and sub-items: Risk Intelligence, Executive Summary)
- Photos (and sub-item: Photo Enhancer & Renders)
- Portfolio Ops (and sub-item: Portfolio Watchdog)
- Constants & Authority Sources / Model Constants (removed entirely — data in Admin → Sources)
- The Analyst / Gustavo as a standalone item (moved into "The Analyst" group)
- Rebecca AI Assistant as a standalone item (moved into "Agents" group)

**Note:** Iris (Resource Maintainer) was added to the Agents group in a subsequent session. LLMs moved from a top-level item to under System.

### Specialists accordion page

**Layout:** scrollable list, one accordion row per Specialist

**Collapsed row shows:**
- Human name (e.g. "Helena")
- Function / domain (e.g. "Tax Authority Research")
- 🟢/🔴 status icon (last health check result)

**Expanded row shows (ALL READ-ONLY — no interactive controls on resources):**
- Description of what the Specialist does
- LLMs used: display labels only (e.g. "GPT-4o", "Claude 3.5 Sonnet")
  → To manage: `Intelligence → LLMs`
- Sources used: display labels only (e.g. "IRS Tax Tables", "FRED API")
  → To manage: `Admin → Sources`
- APIs used: display labels only
- Last called: relative timestamp from internal activity log
- **[Run Analyst]** button — the only interactive element:
  - Triggers a health check (is this Specialist deployed and responding?)
  - Does NOT regenerate source data (that is done from Admin → Sources)
  - Does NOT change LLM settings
  - Writes result to internal activity log
  - Updates status icon and "Last called" timestamp on completion

### Who appears in the Specialists accordion
- All research Specialists (domain Specialists across Management Company, Property, Photos,
  Portfolio Ops, and previously Constants-related Specialists)
- Gustavo (orchestrator) does NOT appear here — he has his own AI Agents → Gustavo page
- Rebecca (assistant) does NOT appear here — she is an AI agent, not a research Specialist
- Letícia (Resources Builder) IS a Specialist and appears in the accordion alongside all other Specialists. She has no separate sidebar item.

## Why This Matters

- Single entry point for all Specialist management reduces sidebar clutter from 5+ groups to 1 item
- Read-only resource display enforces the single-source-of-truth principle:
  Sources are managed in Admin → Sources, LLMs are managed in Intelligence → LLMs
- Accordion pattern scales to any number of Specialists without sidebar growth

## Related

- `.agents/skills/hplus-admin-nav-ia/SKILL.md` — canonical nav tree and all rules
- `docs/solutions/architecture-patterns/intelligence-ai-agents-gustavo-page-2026-05-02.md` — Gustavo page spec
- `artifacts/hospitality-business-portal/src/components/intelligence/IntelligenceSidebar.tsx`
