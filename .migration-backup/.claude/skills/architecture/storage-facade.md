---
name: Storage Facade
description: Documents the DatabaseStorage facade pattern — a single IStorage interface delegating to 11 specialized storage classes.
---

# Storage Facade Pattern

## Overview

`DatabaseStorage` implements `IStorage` as a thin facade that delegates all database operations to 11 specialized classes. This keeps each class focused (~100-200 lines) while presenting a single unified interface to route handlers.

## Architecture

```
IStorage (interface)
    |
    v
DatabaseStorage (facade) ── delegates to:
    ├── UserStorage         — users, sessions, login_logs, user_groups
    ├── PropertyStorage     — properties CRUD + filtering
    ├── FinancialStorage    — global_assumptions, scenarios, fee categories
    ├── AdminStorage        — verification_runs, design_themes, logos, companies
    ├── ActivityStorage     — activity_logs
    ├── ResearchStorage     — market_research, research_questions, prospective_properties
    ├── PhotoStorage        — property_photos
    ├── DocumentStorage     — document_extractions, extraction_fields, docusign_envelopes
    ├── ServiceStorage      — service_templates, property_services
    └── NotificationStorage — alert_rules, notification_logs, notification_preferences, notification_settings
```

## Key Files

| File | Purpose |
|------|---------|
| `server/storage/index.ts` | `IStorage` interface + `DatabaseStorage` facade |
| `server/storage/users.ts` | User/session/group CRUD |
| `server/storage/properties.ts` | Property CRUD + filtering |
| `server/storage/financial.ts` | Global assumptions, scenarios, fees |
| `server/storage/admin.ts` | Themes, logos, companies, verification |
| `server/storage/activity.ts` | Activity logs |
| `server/storage/research.ts` | Market research, research questions |
| `server/storage/photos.ts` | Property photos |
| `server/storage/documents.ts` | Document extractions, DocuSign envelopes |
| `server/storage/notifications.ts` | Alert rules, notification logs/preferences/settings |
| `server/storage/services.ts` | Service templates and property services |

## Conventions

- Route handlers receive `storage: IStorage` — never access specialized classes directly
- Each specialized class takes `db` (Drizzle instance) in constructor
- All queries use Drizzle ORM with the shared schema from `shared/schema.ts`
- Shared singleton rows (global_assumptions) use `ORDER BY id DESC` per `portfolio-dynamics.md`
- Properties use `userId IS NULL` for shared visibility per `portfolio-dynamics.md`

## Related Rules

- `.claude/rules/portfolio-dynamics.md` — singleton row uniqueness and shared ownership
- `.claude/rules/portfolio-dynamics.md` — shared property ownership
- `.claude/rules/database-seeding.md` — seed data conventions
