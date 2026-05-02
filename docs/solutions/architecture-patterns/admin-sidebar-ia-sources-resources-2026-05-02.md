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

Repeated clarification was needed across multiple sessions about where "Sources" and "Resources" belong in the admin navigation, and what each section contains. The mismatch between the old legacy redirect (`"sources" → "data-sources"`) and the intended product design caused agents to incorrectly place these sections inside `/ai-intelligence` instead of the Admin sidebar.

## Guidance

The Admin sidebar (`AdminSidebar.tsx`, route `/admin`) has two distinct top-level sections for external data and integrations. These are **Admin sidebar sections**, not AI Intelligence sections.

### Sources (Admin sidebar — top-level section)

A dedicated **Sources** section in the Admin sidebar surfaces every type of input the app uses in its work and research. Sub-items:

| Sub-item | What it contains |
|----------|-----------------|
| **Tables** | Structured data tables used by the app (benchmark tables, reference tables, lookup data) |
| **Links** | External URLs the app references or scrapes as research inputs |
| **Files** | Documents uploaded by the admin (PDFs, CSVs, reference docs) used as knowledge sources |
| *(additional sub-items as needed)* | Any other category of source material the app draws from |

All content here is **read-only for viewing**; admin can upload files and add links, but does not edit the underlying data — regeneration is done via the Analyst button pattern.

### Resources (Admin sidebar — top-level section)

A **Resources** section in the Admin sidebar groups wire-up registries and integration management. Sub-items:

| Sub-item | What it contains |
|----------|-----------------|
| **APIs** | Full API registry: every external API the app calls, with full description, endpoint, auth method, rate limits, and a **live test button** admin can use to verify the API is reachable and returning valid data |
| *(additional sub-items as needed)* | e.g. Models, Webhooks, etc. |

The **APIs page** specifically is a purpose-built admin tool — not just a list, but a testable interface. Each API entry includes: name, description, endpoint URL, auth key reference, rate limit, status badge, and a "Test" action that fires a real request and shows the response.

## Why This Matters

Placing Sources or Resources inside `/ai-intelligence` (the AI-specific area) hides them from admins who think of these as operational/infrastructure concerns rather than AI concerns. The Admin sidebar is the correct home because:

- These sections are relevant to all admins, not only those configuring AI behavior
- Sources and Resources feed the whole app (financial engine, research, chat), not just AI specialists
- The AI Intelligence section (`/ai-intelligence`) is focused on AI agent configuration, knowledge management, and research orchestration — not general data source management

## When to Apply

- Any task that involves adding a new external data source, API, file upload capability, or link registry to the admin UI → put it under **Admin sidebar → Sources** or **Admin sidebar → Resources**
- Any task that says "Sources section" or "Resources section" in the admin context → these are Admin sidebar sections, not AI Intelligence tabs
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

Do NOT put these under `/ai-intelligence`:
```
# WRONG — do not do this
AI Intelligence → Resources → Catalog → [APIs tab]   ← this is the old pattern
AI Intelligence → Knowledge Registry → Sources        ← wrong; Sources belongs in Admin
```

## Relevant Files

- `artifacts/hospitality-business-portal/src/components/admin/AdminSidebar.tsx` — add new `AdminSection` values and nav groups here
- `artifacts/hospitality-business-portal/src/pages/Admin.tsx` — add route cases for new sections
- `artifacts/api-server/src/seeds/source-registry.ts` — existing seed pattern for source data (APIs, connections)
- `artifacts/api-server/src/routes/admin/intelligence-sources.ts` — existing API registry routes (may be the basis for the new APIs page)
- `docs/brainstorms/knowledge-registry-requirements.md` — Knowledge Registry feature (AI Intelligence area) is separate from Sources/Resources in Admin sidebar
