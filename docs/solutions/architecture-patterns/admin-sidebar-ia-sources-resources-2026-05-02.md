---
module: admin-navigation
date: "2026-05-02"
problem_type: architecture_pattern
component: documentation
severity: high
applies_when:
  - "Adding a new top-level section to the Admin sidebar"
  - "Adding anything related to Sources, data inputs, APIs, or external connections to the admin UI"
  - "Planning where knowledge assets, API management, or file uploads belong in the Admin navigation"
tags:
  - admin-sidebar
  - navigation
  - sources
  - resources
  - apis
  - ia
  - information-architecture
  - knowledge-registry
---

# Admin Sidebar IA: Sources and Resources sections

## Context

Repeated clarification was needed across multiple sessions about where "Sources" and "Resources" belong in the admin navigation, and what each section contains. The mismatch between the old legacy redirect (`"sources" → "data-sources"`) and the intended product design caused agents to incorrectly place these sections inside `/intelligence` instead of the Admin sidebar.

## Guidance

The Admin sidebar (`AdminSidebar.tsx`, route `/admin`) has two distinct top-level sections for external data and integrations. These are **Admin sidebar sections**, not Intelligence sections.

### Sources (Admin sidebar — top-level section — ONLY location for "Sources" in the app)

A dedicated **Sources** section in the Admin sidebar. **This label belongs exclusively to the Admin sidebar. Do not create anything labelled "Sources" inside `/intelligence`.**

Sub-items:

| Sub-item | What it contains |
|----------|-----------------|
| **Tables** | ALL structured data tables the app uses: country economic data, constants/defaults tables, benchmark tables (Capital Raise, Exit Multiples, Reference Brands), reference lookup tables, market data |
| **Links** | External URLs the app references or scrapes as research inputs |
| **Files** | Documents uploaded by the admin (PDFs, CSVs, reference docs) used as knowledge sources |

**Tables is intentionally broad** — every structured table in the system lives here, including:
- Country economic data (inflation rate, FX rate, GDP growth, interest rate per country)
- Constants and financial defaults (the numbers used in the financial engine)
- Benchmark ranges (Capital Raise, Exit Multiples, Reference Brands)
- Any other reference or lookup table the app reads from

All content here is **read-only for viewing**; admin can upload files and add links, but does not edit the underlying data — regeneration is done via the Analyst button pattern.

### Resources (Admin sidebar — top-level section)

A **Resources** section in the Admin sidebar groups wire-up registries and integration management. Sub-items:

| Sub-item | What it contains |
|----------|-----------------|
| **APIs** | Full API registry: every external API the app calls, with full description, endpoint, auth method, rate limits, and a **live test button** admin can use to verify the API is reachable and returning valid data |
| *(additional sub-items as needed)* | e.g. Models, Webhooks, etc. |

The **APIs page** specifically is a purpose-built admin tool — not just a list, but a testable interface. Each API entry includes: name, description, endpoint URL, auth key reference, rate limit, status badge, and a "Test" action that fires a real request and shows the response.

## Why This Matters

Placing Sources or Resources inside `/intelligence` (the AI-specific area) hides them from admins who think of these as operational/infrastructure concerns rather than AI concerns. The Admin sidebar is the correct home because:

- These sections are relevant to all admins, not only those configuring AI behavior
- Sources and Resources feed the whole app (financial engine, research, chat), not just AI specialists
- The Intelligence section (`/intelligence`) is focused on AI agent configuration, knowledge management, and research orchestration — not general data source management

## When to Apply

- Any task that involves adding a new external data source, API, file upload capability, or link registry to the admin UI → put it under **Admin sidebar → Sources** or **Admin sidebar → Resources**
- Any task that says "Sources section" or "Resources section" in the admin context → these are Admin sidebar sections, not Intelligence tabs
- The existing `"sources" → "data-sources"` redirect in `SECTION_REDIRECTS` is a legacy alias that predates this IA decision. When implementing the new Sources section, remove or update this redirect so it lands on the new canonical Sources page

## Examples

```
Admin sidebar (/admin)
├── ...existing sections...
├── Sources                          ← NEW top-level section
│   ├── Tables
│   ├── Links
│   └── Files
└── Resources                        ← NEW top-level section
    └── APIs  (with live test button per API)
```

Do NOT put these under `/intelligence`:
```
# WRONG — do not do this
Intelligence → Resources → Catalog → [APIs tab]   ← this is the old pattern
Intelligence → Knowledge Registry → Sources        ← wrong; Sources belongs in Admin
```

## Relevant Files

- `artifacts/hospitality-business-portal/src/components/admin/AdminSidebar.tsx` — add new `AdminSection` values and nav groups here
- `artifacts/hospitality-business-portal/src/pages/Admin.tsx` — add route cases for new sections
- `artifacts/api-server/src/seeds/source-registry.ts` — existing seed pattern for source data (APIs, connections)
- `artifacts/api-server/src/routes/admin/intelligence-sources.ts` — existing API registry routes (may be the basis for the new APIs page)
- `docs/brainstorms/knowledge-registry-requirements.md` — Knowledge Registry feature (Intelligence area) is separate from Sources/Resources in Admin sidebar
