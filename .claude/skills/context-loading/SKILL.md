---
name: context-loading
description: Token-efficient context loading protocol. Maps common task types to the minimum required skills. Load this first to determine which other skills are needed.
---

# Context Loading Protocol

## Purpose
With 176 skill files, loading everything wastes tokens and slows responses. This skill maps common task types to the **minimum required** skill set, ensuring fast, focused sessions.

## Golden Rule
**Load `claude.md` first (always loaded automatically). Then load only the skills needed for the current task. Never load all skills at once.**

## Task-to-Skill Map

### Tier 1: Always Loaded (automatic)
- `claude.md` — Master doc, skill router, user preferences, project state

### Tier 2: Load by Task Type

#### Financial Calculations & Engine Work
| Task | Load These Skills | Skip |
|------|------------------|------|
| Fix/modify income statement | `finance/income-statement.md`, `rules/financial-engine.md` | UI skills, research |
| Fix/modify cash flow statement | `finance/cash-flow-statement.md`, `finance/cash-line-architecture.md` | UI skills, research |
| Fix/modify balance sheet | `finance/balance-sheet.md`, `finance/cross-statement-reference.md` | UI skills, research |
| IRR/NPV/returns calculation | `finance/irr-analysis.md`, `finance/dcf-analysis.md` | UI skills, statements |
| Debt/financing/refinancing | `finance/calculation-chain.md`, `rules/financial-engine.md` | UI skills, research |
| Fee linkage / consolidation | `finance/fee-linkage.md`, `finance/consolidation.md` | UI skills, exports |
| Management company pro forma | `finance/fee-linkage.md`, `testing/management-company.md` | Property-level skills |
| Centralized services / vendor costs | `finance/centralized-services.md`, `finance/fee-linkage.md` | Property-level skills |
| Full financial statements build | `finance/financial-statements-construction.md` | Individual statement skills (it's comprehensive) |
| Any finance change | **Always also load**: `rules/audit-persona.md`, `proof-system/SKILL.md` | — |

#### Testing & Verification
| Task | Load These Skills | Skip |
|------|------------------|------|
| Run/fix tests | `testing/SKILL.md` (master), then the relevant sub-skill | All finance/UI skills |
| Add new test suite | `testing/SKILL.md`, `proof-system/SKILL.md` | UI skills |
| Fix failing property tests | `testing/property-statements.md` | Consolidated/mgmt skills |
| Fix failing consolidated tests | `testing/consolidated-statements.md` | Property-level skills |
| Fix failing management co tests | `testing/management-company.md` | Property-level skills |
| Verification / audit opinion | `proof-system/SKILL.md` | Individual testing sub-skills |

#### UI & Visual Work
| Task | Load These Skills | Skip |
|------|------------------|------|
| New page or component | `component-library/SKILL.md`, `ui/theme-engine.md` | Finance skills, research |
| FinancingAnalysis tabs | `ui/financing-tab-components.md` | Finance engine, research |
| Scenarios dialogs | `ui/scenarios-dialogs.md` | Finance engine, research |
| SensitivityAnalysis panels | `ui/sensitivity-panels.md`, `finance/irr-analysis.md` | Research, testing |
| Chart work | `ui/charts.md`, `component-library/SKILL.md` | Finance skills, testing |
| Graphics enhancement | `ui/graphics-component-catalog.md`, `ui/page-enhancement-checklist.md`, `rules/design-standards.md` | Finance skills |
| Animation patterns | `ui/animation-patterns.md`, `ui/graphics-component-catalog.md` | Finance skills, testing |
| Magic UI effects (particles, meteors, ripple, etc.) | `ui/magic-ui.md` | Finance skills, testing |
| Financial table styling | `ui/financial-table-styling.md`, `ui/theme-engine.md` | Finance engine skills |
| Navigation / sidebar | `ui/navigation.md`, `component-library/SKILL.md` | Finance skills |
| Export UI (buttons, menus) | `exports/SKILL.md`, `component-library/SKILL.md` | Finance skills |
| 3D graphics / animations | `3d-graphics/SKILL.md`, `ui/animation-patterns.md` | Everything else |
| Theme changes | `ui/theme-engine.md`, `design-system/SKILL.md` | Finance skills |
| Image generation / AI images | `ui/reusable-components.md`, `ui/property-image-picker.md` | Finance skills |
| Logo management | `multi-tenancy/SKILL.md`, `ui/reusable-components.md` | Finance skills |
| Branding / user groups / logos | `multi-tenancy/SKILL.md` | Finance skills |
| Entity card UI (admin CRUD) | `ui/entity-cards.md`, `rules/ui-patterns.md` | Finance skills |
| User management / roles | `multi-tenancy/SKILL.md` | Finance skills |
| Accordion/formula rows | `ui/help-tooltip.md`, `ui/financial-table-styling.md` | Finance engine skills |
| Info/help icon work | `ui/info-icons.md`, `ui/help-tooltip.md` | Finance skills |
| Tabbed/composite pages | `ui/composite-tabbed-pages.md` | Finance skills |

#### Mobile & Tablet Responsiveness
| Task | Load These Skills | Skip |
|------|------------------|------|
| Fix mobile layout issues | `mobile-responsive/SKILL.md` | Finance skills, research |
| iPad / tablet layout | `mobile-responsive/SKILL.md`, `mobile-responsive/tablet-layouts.md` | Finance skills |
| Responsive charts (0px height) | `mobile-responsive/SKILL.md`, `ui/charts.md` | Finance skills |
| Device testing / QA | `mobile-responsive/device-testing-checklist.md` | Finance skills |
| useIsMobile hook usage | `mobile-responsive/responsive-helpers.md` | Finance skills |
| Full mobile overhaul | `mobile-responsive/SKILL.md`, `mobile-responsive/tablet-layouts.md`, `mobile-responsive/device-testing-checklist.md` | Finance skills |

#### Export Work
| Task | Load These Skills | Skip |
|------|------------------|------|
| Excel export | `exports/excel-export.md` | Other export skills |
| PDF export | `exports/pdf-rendering.md`, `exports/premium-export-spec.md` | Other export skills |
| PNG export | `exports/png-export.md` | Other export skills |
| PowerPoint export | `exports/pptx-export.md` | Other export skills |
| Any export change | `exports/SKILL.md` (master) | Finance engine skills |

#### Research & AI
| Task | Load These Skills | Skip |
|------|------------------|------|
| Research system architecture | `research/SKILL.md` (master) | Individual analysis skills |
| Property market research | `research/SKILL.md`, the specific analysis skill | Finance engine, UI |
| ADR benchmarking | `research/adr-analysis/SKILL.md` | Other research skills |
| Company research | `research/company-research/SKILL.md` | Property research skills |
| Auto-refresh on login | `research/auto-refresh/SKILL.md` | All other research skills |
| Location-aware seeding | `research/location-aware-seeding/SKILL.md` | Analysis skills |
| Research badge data flow | `ui/research-badges.md`, `research/SKILL.md` | Analysis skills |
| Research questions CRUD | `research/research-questions/SKILL.md` | Analysis skills, finance |
| Research validation, deterministic tools, research tool schemas | `research/SKILL.md`, `rules/research-precision.md`, `tool-schemas/SKILL.md` | Finance engine, UI |
| ICP definition / research | `icp-research/SKILL.md` | Property-level research |
| Any research change | **Always also load**: `research/SKILL.md` (master) | — |

#### Rebecca Chatbot
| Task | Load These Skills | Skip |
|------|------------------|------|
| Rebecca chatbot / text chat | `rebecca-chatbot/SKILL.md` | Finance skills |
| Admin Rebecca tab config | `admin/admin-refactor-map.md`, `rebecca-chatbot/SKILL.md` | Finance skills |
| RAG knowledge base | `rebecca-chatbot/SKILL.md` | Finance skills |

#### Admin Page Refactoring
| Task | Load These Skills | Skip |
|------|------------------|------|
| Extract admin tab component | `admin/tab-extraction-guide.md`, `admin/admin-refactor-map.md`, `admin/component-checklist.md` | Finance skills, research |
| Admin API route work | `admin/admin-api-routes.md`, `rules/api-routes.md` | Finance skills |
| Admin shell restructure | `admin/admin-shell-template.md`, `admin/admin-refactor-map.md` | Finance skills |
| Admin types/shared code | `admin/admin-refactor-map.md` | Finance, UI skills |
| Admin components/hooks/styles | `admin-components/SKILL.md` | Finance skills |

#### Codebase Architecture & UI Components
| Task | Load These Skills | Skip |
|------|------------------|------|
| Barrel files / import paths | `codebase-architecture/SKILL.md` | Finance, research |
| UI component lookup | `codebase-architecture/SKILL.md` § UI Component Catalog | Finance, research |
| Module boundaries / re-exports | `codebase-architecture/SKILL.md` | Finance, research |
| Tooltip system | `codebase-architecture/SKILL.md` § Tooltips, `admin-components/SKILL.md` § Tooltip Explainers | Finance |

#### Funding, Maps, Notifications, Documents
| Task | Load These Skills | Skip |
|------|------------------|------|
| Capital strategy / SAFE tranches | `funding-strategy/SKILL.md`, `rules/financial-engine.md` | UI skills, research |
| Map view / geospatial | `map-view/SKILL.md` | Finance, research |
| Notifications / alert rules | `notifications/SKILL.md` | Finance, research |
| Email sharing (Resend) | `notifications/SKILL.md` | Finance, UI skills |
| Document OCR / extraction | `document-intelligence/SKILL.md` | Finance, research |
| Financial diagnostics | `finance/diagnostic-decision-tree.md`, `proof-system/SKILL.md` | UI skills |

#### Database & Infrastructure
| Task | Load These Skills | Skip |
|------|------------------|------|
| Schema changes / migrations | `database/SKILL.md`, `rules/database-seeding.md` | Finance, UI skills |
| API route changes | `rules/api-routes.md`, `architecture/SKILL.md` | UI skills |
| Seed data changes | `rules/database-seeding.md` | Finance engine skills |
| Image generation server | `ui/property-image-picker.md`, `architecture/SKILL.md` | Finance, UI skills |

#### Documentation & Skills
| Task | Load These Skills | Skip |
|------|------------------|------|
| Update checker manual | `manuals/checker-manual/SKILL.md` | Finance engine, UI |
| Update user manual | `manuals/user-manual/SKILL.md` | Finance engine, UI |
| Create new skill | `coding-conventions/SKILL.md`, `skills/coding-conventions/skill-organization.md` | Unrelated domain skills |
| Reorganize skills/rules | `skills/coding-conventions/skill-organization.md`, `context-loading/SKILL.md` | Finance, UI skills |
| Audit folder structure | `skills/coding-conventions/skill-organization.md`, `source-code/SKILL.md` | Finance, UI skills |

## Loading Tiers by Request Complexity

### Quick Fix (1-2 skills)
User asks to fix a specific bug, tweak a label, adjust a color.
→ Load only the directly relevant skill. Skip everything else.

### Feature Work (2-4 skills)
User asks to add or modify a feature.
→ Load the domain skill + component library + any cross-cutting rules.

### Cross-Domain Work (4-6 skills)
User asks for something that spans finance + UI + testing.
→ Load the minimum from each domain. Use the table above.

### Full Audit (6+ skills)
User asks for verification, release prep, or comprehensive review.
→ Load proof-system, testing master, relevant finance skills, and audit rules.

## Anti-Patterns (Token Waste)

| Don't Do This | Do This Instead |
|---------------|-----------------|
| Load all 16 finance skills for an IS fix | Load `finance/income-statement.md` only |
| Load all UI skills for a button change | Load `component-library/SKILL.md` only |
| Load testing skills for a UI change | Skip testing unless the change affects calculations |
| Load research skills for a finance fix | Skip research entirely |
| Load source-code/SKILL.md (814 lines) routinely | Only load when you need a full file map |
| Read all 18 checker manual sections | Read only the section relevant to the task |

## Session Start Checklist

1. Read `claude.md` (auto-loaded)
2. Identify the task type from the user's request
3. Look up the minimum skill set in the table above
4. Load only those skills
5. If unsure, start with the domain SKILL.md and drill into sub-skills as needed
6. After completing work, update only the skills you loaded (don't update unrelated skills)

## Cross-References
- Skill Router: `claude.md` § Skill Router
- All skills: `.claude/skills/` (33 directories, 176 files)
- Rules: `.claude/rules/` (19 files)
- Manuals: `.claude/manuals/` (2 manuals)
