---
name: api-backend-contract
description: Express backend architecture, route modules, storage interface, authentication middleware, and role-based access control for HBG Portal. Use when working on server routes, API endpoints, storage operations, or authentication.
---

The server-side architecture and API surface for the HBG Portal. Covers Express backend structure, route modules, storage interface, authentication middleware, rate limiting, SSE streaming, scenario system, multi-tenancy, and role-based access control. Use this skill when working on server routes, API endpoints, storage operations, or authentication.

## Tech Stack

- **Runtime:** Node.js with TypeScript (ESM)
- **Framework:** Express 5
- **ORM:** Drizzle ORM
- **Database:** PostgreSQL (Neon-backed via Replit)
- **Build:** esbuild

## File Organization

```
server/
+-- routes.ts                     # Express API routes
+-- storage.ts                    # IStorage interface + Drizzle implementation
+-- auth.ts                       # Authentication middleware
+-- db.ts                         # Database connection
+-- calculationChecker.ts         # Server-side financial verification
+-- seed.ts                       # Database seed data
+-- integrations/                 # Stripe, Gmail, Google Sheets, Twilio, etc.
+-- replit_integrations/          # Auth, object storage, chat, image, audio
+-- routes/                       # Domain-organized route modules
+-- ai/                           # AI clients, knowledge base

shared/
+-- schema.ts                     # Drizzle table definitions + Zod schemas
+-- constants.ts                  # Shared constants
```

## Authentication

Session-based auth with bcrypt password hashing, HTTP-only cookies, 7-day expiry.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/login` | None | Login with email + password. Rate-limited by IP. |
| `POST` | `/api/auth/admin-login` | None | Convenience admin login (uses ADMIN_PASSWORD env var) |
| `POST` | `/api/auth/logout` | Any | Clear session cookie |
| `GET` | `/api/auth/me` | Any | Get current authenticated user |

## User Roles

| Role | Access Level |
|------|-------------|
| `admin` | Full access to all endpoints including user management |
| `partner` | Company-level access — view and edit within assigned companies |
| `checker` | Verification access to run checks and view audit results |
| `investor` | Portfolio-level read access — dashboards and reports |

**Checker Access:** `requireChecker` middleware grants access to users with `role === "admin"` OR `email === "checker@norfolkgroup.io"`.

## API Routes

### User Management (Admin)
| Method | Path | Description |
|--------|------|-------------|
| `GET/POST` | `/api/admin/users` | List / Create users |
| `PATCH/DELETE` | `/api/admin/users/:id` | Update / Delete user |
| `PATCH` | `/api/admin/users/:id/password` | Reset password |
| `GET` | `/api/admin/login-logs` | Login audit history |

### User Groups
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/user-groups` | List all groups (auth required) |
| `POST` | `/api/user-groups` | Create group (admin only) |
| `PATCH` | `/api/user-groups/:id` | Update group (admin only) |
| `DELETE` | `/api/user-groups/:id` | Delete group (admin only) |
| `GET` | `/api/my-branding` | Get resolved branding for current user |

**Branding cascade:** user-level overrides > group-level > system defaults.

### Properties
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/properties` | List all for current user |
| `GET` | `/api/properties/:id` | Get single property |
| `POST` | `/api/properties` | Create property |
| `PATCH` | `/api/properties/:id` | Update property |
| `DELETE` | `/api/properties/:id` | Delete property |

### Global Assumptions
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/global-assumptions` | Get current assumptions |
| `PATCH` | `/api/global-assumptions` | Update (admin only) |
| `PUT` | `/api/global-assumptions` | Full update (management access) |

### Scenarios
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/scenarios` | List all for current user |
| `POST` | `/api/scenarios` | Save current state as snapshot |
| `POST` | `/api/scenarios/:id/load` | Load (restores all data) |
| `PATCH` | `/api/scenarios/:id` | Update name/description |
| `DELETE` | `/api/scenarios/:id` | Delete (cannot delete "Base") |

### Verification
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/verification/run` | Run financial verification (checker+) |
| `POST` | `/api/verification/ai-review` | AI methodology review (SSE stream, checker+) |
| `GET` | `/api/verification/history` | Past verification runs |
| `GET` | `/api/verification/runs/:id` | Single verification run detail |

### Admin
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/admin/seed-production` | Seed database |
| `GET` | `/api/admin/activity-logs` | Filtered activity logs |
| `GET/DELETE` | `/api/admin/active-sessions` | Session management |

### Design Themes
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/design-themes` | List all themes (admin only) |
| `POST` | `/api/admin/design-themes` | Create theme (admin only) |
| `PATCH` | `/api/admin/design-themes/:id` | Update theme (admin only) |
| `DELETE` | `/api/admin/design-themes/:id` | Delete theme (admin only) |

### Research & AI
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/research/:type` | Cached research (property/company/global) |
| `POST` | `/api/research/generate` | Generate AI research (SSE stream) |
| `GET/POST/PUT/DELETE` | `/api/research-questions` | Custom research questions CRUD |

### File Uploads
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/uploads/request-url` | Presigned upload URL |
| `GET` | `/api/objects/*` | Serve uploaded files |
| `POST` | `/api/generate-image` | Generate image via gpt-image-1 |
| `POST` | `/api/generate-property-image` | Generate + upload property photo |

## Database Schema (31 tables)

- **Core:** `users`, `sessions`, `user_groups`, `user_group_properties`
- **Business:** `companies`, `company_service_templates`, `properties`, `global_assumptions`, `property_fee_categories`, `scenarios`, `seed_defaults`
- **Branding:** `logos`, `design_themes`, `asset_descriptions`, `property_photos`
- **Audit:** `login_logs`, `activity_logs`, `verification_runs`
- **Research:** `market_research`, `market_rates`, `prospective_properties`, `saved_searches`, `research_questions`
- **AI:** `conversations`, `messages`
- **Notifications:** `alert_rules`, `notification_logs`, `notification_preferences`, `notification_settings`
- **Documents:** `document_extractions`, `extraction_fields`

## Error Responses

```json
{ "error": "Human-readable error message" }
```

Status codes: 400 (validation), 401 (not authenticated), 403 (access denied), 404 (not found), 429 (rate limited), 500 (server error).

## Rate Limiting

- Login: 5 attempts per IP, 15-minute lockout
- AI research: per-user 1-minute sliding window

## Key Files

| File | Purpose |
|------|---------|
| `server/routes.ts` | Main route registration |
| `server/storage.ts` | IStorage interface + Drizzle implementation |
| `server/auth.ts` | Authentication middleware |
| `shared/schema/` | Modular table definitions + Zod schemas (re-exported from `shared/schema/index.ts`) |
| `shared/constants.ts` | Named constants |
