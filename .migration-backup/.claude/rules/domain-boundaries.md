# Domain Boundaries

## Rule

The application is organized into independent domains. Each domain owns its storage, routes, and integrations. Cross-domain access is restricted to documented, read-only patterns.

## Six Independent Domains

| Domain | Storage | Routes | Integrations | May Read From |
|--------|---------|--------|--------------|---------------|
| **Financial Engine** | FinancialStorage | calculations, global-assumptions | None | — |
| **AI Agents** | (reads only) | ai, chat | Anthropic, Gemini, OpenAI | Financial (read-only via `buildPropertyContext`) |
| **Photos/Media** | PhotoStorage | property-photos, uploads | Replicate, Gemini | Properties (hero sync denormalization) |
| **Research** | ResearchStorage | research | Anthropic, calc/research tools | Financial (validation only, non-destructive) |
| **Documents** | DocumentStorage | documents | Document AI | Properties (field mapping, read-only) |
| **Notifications** | NotificationStorage | notifications | Resend | — |

**Admin** is a meta-domain that configures all others. It is not an independent domain.

## Cross-Domain Rules

1. AI Agents may **read** financial context but never **write** to financial tables
2. Photos may **sync** hero image to properties (documented denormalization in `PhotoStorage.syncHeroToProperty`) but never touch financial data
3. Research tools in `calc/research/` are **pure functions** — they validate against assumptions but never mutate them
4. Scenarios snapshot **all** domains (properties, photos, fees, assumptions) but domain logic stays in domain routes
5. All database access goes through `IStorage` — no route may import `db` directly

## Prohibited Crossings

- Financial engine must never import from AI agents
- Photos must never import from financial engine or scenarios
- Notifications must never import from financial engine
- Documents must never import from AI agents or research
- No storage class may call methods on another storage class
- No route file may import `db` from `../db` or `../../db`
- `calc/` files must never import from `server/` (tool purity)

## Enforcement

`tests/proof/domain-boundaries.test.ts` — static analysis verifying:
1. No prohibited cross-domain imports in route files
2. No route file imports `db` directly (facade enforcement)
3. `calc/` files never import from `server/` (tool purity)
