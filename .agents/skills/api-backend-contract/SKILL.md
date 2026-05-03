---
name: api-backend-contract
description: "H+ server-side architecture: Express route structure, storage interface pattern, auth middleware chain, route modules and key endpoints, SSE streaming, scenario system, dual-engine separation, multi-tenancy data flow, and role-based access. Load when writing new routes, storage methods, or middleware."
---

# API Backend Contract

## Express Backend Structure

- **Entry point**: `artifacts/api-server/src/index.ts`
- Route files are organized by domain and registered in `index.ts`
- Server is deployed on **Railway** — not Vercel; no serverless function constraints apply
- Long-running operations (SSE streaming, heavy calculations) are supported without timeout limits

---

## Route Modules and Key Endpoint Groups

| Domain | Endpoints |
|--------|-----------|
| **Auth** | Login, logout, me, profile update, Google OAuth callback |
| **Properties** | CRUD, photo management, slide deck generation, research seeding |
| **Calculations** | Verification runs, DCF, IRR vector, consolidation checks |
| **Research** | SSE streaming generation, market research CRUD, ICP-driven research |
| **Admin** | Users, companies, groups, Marcela/voice config, navigation toggles, verification, database tools, render settings |
| **Notifications** | DSCR breach alerts, occupancy threshold alerts |
| **Integrations** | Plaid bank sync, document upload/OCR, Twilio SMS |
| **Branding** | Theme and logo resolution (user → group → system fallback cascade) |
| **Premium Exports** | AI-structured document generation (PDF, PPTX, XLSX) |
| **Scenarios** | Snapshot CRUD, load scenario, compare scenarios |

---

## Storage Interface Pattern

- `IStorage` interface defines all data access methods; backed by **Drizzle ORM** against **PostgreSQL** (Neon)
- Routes are thin dispatchers — business logic and data access live in storage methods and service modules, not in route handlers
- Storage is split by domain:
  - `artifacts/api-server/src/storage/photos.ts`
  - `artifacts/api-server/src/storage/intelligence.ts`
  - (additional domain storage files follow the same pattern)
- **DB schema**: `lib/db/src/schema/` — Drizzle table definitions exported from the `@workspace/db` package
- All queries go through storage methods; routes never call Drizzle directly

---

## Authentication / Authorization Middleware Chain

```
authMiddleware (session cookie → req.user)
  └─ requireAuth (general access gate — blocks unauthenticated requests)
       ├─ requireAdmin (admin role only)
       ├─ requireChecker (audit/checker role)
       ├─ requireManagementAccess (all roles except investor)
       └─ checkPropertyAccess (property-level visibility — scopes by user group membership)
```

- `authMiddleware` resolves the session cookie and populates `req.user`; downstream middleware reads `req.user.role`
- `checkPropertyAccess` is applied per-route on property endpoints and compares the requested property ID against the user's accessible property list
- Admin users bypass property-level filters

---

## Rate Limiting

- IP-based and user-based throttling applied on sensitive endpoints: login, research generation, enhance-photo
- Helper: `isApiRateLimited(userId, key, maxPerMinute)` — returns `true` if the caller has exceeded the limit
- Rate limit state is stored in-process (or Redis if configured); not a middleware layer — routes call the helper explicitly

---

## SSE Streaming

Used for research generation to stream AI progress tokens to the browser in real time:

- Route sets `Content-Type: text/event-stream` and keeps the connection open
- Tokens are written as SSE events as they arrive from the AI model
- Client uses the browser `EventSource` API to consume the stream
- On error or completion the server closes the stream with a terminal event

---

## Dual-Engine Separation (Critical Invariant)

| Engine | Location | Purpose |
|--------|----------|---------|
| Client engine | `lib/engine/` | Real-time UI calculations; runs in the browser |
| Server checker | `artifacts/api-server/src/` | Independent verification recalculation |

**These two engines must never share calculation code.** The independence is the entire basis of the verification system's validity. A shared bug would appear in both engines and go undetected.

- Server routes must not import from `lib/engine/`
- The client must not import from the server checker
- If a formula needs to change, it must be updated independently in both places

---

## Scenario System

- Scenarios are JSONB snapshots stored in PostgreSQL
- Each snapshot captures the full state: `globalAssumptions` + `properties` + `feeCategories`
- Loading a scenario replaces all live assumptions and triggers a full recalculation in the client engine
- Features: named snapshots, soft-delete, sharing within a user group
- Scenario routes: create, read, update (rename/notes), soft-delete, load (apply to session), compare (diff two snapshots)

---

## Multi-Tenancy Data Flow

- **User → UserGroup → Property visibility**: every property query is scoped to the authenticated user's accessible properties based on group membership
- **Branding cascade**: theme and logo are resolved in order — user-level override → group-level setting → system default
- Admin users see all properties and bypass group-scoped filters

---

## Role-Based Access Control

| Role | Access Level |
|------|-------------|
| **Admin** | Full access including admin panel; bypasses all property-level filters |
| **Partner** | Full investment toolkit; can edit assumptions, run scenarios, export |
| **Checker** | Read-only access plus verification tools |
| **Investor** | Read-only dashboard; property list filtered to their user group |

---

## Migration System

- Boot-time migrations run at server startup, gated by `isMigrationApplied` / `markMigrationApplied`
- Migration files live in `artifacts/api-server/src/migrations/`
- Every migration is idempotent: checks for column/table existence before applying
- Once marked applied, a migration is skipped on subsequent boots

---

## Related Skills

- `financial-engine` — client-side calculation engine architecture and formula registry
- `verification-system` — independent server-side checker, three-tier pipeline, audit opinions
- `integrations-infrastructure` — Plaid, Twilio, OCR, and third-party service wiring
- `hbg-business-model` — business context for management fees, SAFE tranches, and portfolio structure
