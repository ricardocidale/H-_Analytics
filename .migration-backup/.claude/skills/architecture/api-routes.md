# API Routes Reference

## Authentication

All routes under `/api/auth/` handle user authentication.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/login` | None | Login with email + password. Rate-limited by IP. |
| `POST` | `/api/auth/admin-login` | None | Convenience login for admin user (uses ADMIN_PASSWORD env var) |
| `POST` | `/api/auth/logout` | Any | Clear session cookie and log out |
| `GET` | `/api/auth/me` | Any | Get current authenticated user info |

### Login Request
```json
{ "email": "admin", "password": "..." }
```

### Login Response
```json
{ "user": { "id": 1, "email": "admin", "name": "Ricardo Cidale", "role": "admin" } }
```

## User Profile

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `PATCH` | `/api/profile` | User | Update own profile (name, email, company, title) |
| `PATCH` | `/api/profile/password` | User | Change own password |

## Admin - User Management

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/admin/users` | Admin | List all users |
| `POST` | `/api/admin/users` | Admin | Create new user |
| `PATCH` | `/api/admin/users/:id` | Admin | Update user profile |
| `PATCH` | `/api/admin/users/:id/password` | Admin | Reset user password |
| `DELETE` | `/api/admin/users/:id` | Admin | Delete user |
| `GET` | `/api/admin/login-logs` | Admin | Get login audit history |

## Admin - User Groups

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/admin/user-groups` | Admin | List all user groups |
| `POST` | `/api/admin/user-groups` | Admin | Create new user group (name, companyName, logoId?, themeId?, assetDescriptionId?) |
| `PATCH` | `/api/admin/user-groups/:id` | Admin | Update user group |
| `DELETE` | `/api/admin/user-groups/:id` | Admin | Delete user group (unassigns members first) |
| `POST` | `/api/admin/user-groups/:id/assign` | Admin | Assign user to group (`{ userId }`) |
| `POST` | `/api/admin/user-groups/:id/unassign` | Admin | Remove user from group (`{ userId }`) |

### Branding Resolution

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/my-branding` | User | Get resolved branding for current user |

Branding priority: user-level overrides (assignedLogoId, assignedThemeId, assignedAssetDescriptionId) > group-level (from user_groups) > system defaults. Response includes `groupCompanyName` from the user's group.

## Admin - Seeding & Verification

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/admin/seed-production` | Admin | Seed database with production data |
| `GET` | `/api/admin/run-verification` | Admin/Checker | Run independent financial verification |
| `POST` | `/api/admin/ai-verification` | Admin/Checker | AI-powered methodology review (SSE stream) |
| `GET` | `/api/admin/run-design-check` | Admin | Run design consistency check on frontend |

## Admin - Activity Logs

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/admin/activity-logs` | Admin | Get filtered activity logs (query: userId, entityType, from, to, limit, offset) |
| `GET` | `/api/activity-logs/mine` | User | Get current user's own activity (query: limit) |

### Activity Log Response
```json
[{
  "id": 1,
  "userId": 1,
  "userEmail": "admin",
  "userName": "Ricardo Cidale",
  "action": "create",
  "entityType": "property",
  "entityId": 1,
  "entityName": "The Hudson Estate",
  "metadata": { "changedFields": ["name", "location"] },
  "ipAddress": "127.0.0.1",
  "createdAt": "2026-02-07T12:00:00Z"
}]
```

## Admin - Verification History

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/admin/verification-history` | Admin | List past verification runs (query: limit) |
| `GET` | `/api/admin/verification-history/:id` | Admin | Get full results for one verification run |

### Verification History Response (list)
```json
[{
  "id": 1,
  "userId": 1,
  "totalChecks": 98,
  "passed": 98,
  "failed": 0,
  "auditOpinion": "UNQUALIFIED",
  "overallStatus": "PASS",
  "createdAt": "2026-02-07T12:00:00Z"
}]
```

## Admin - Session Management

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/admin/active-sessions` | Admin | List all active (non-expired) sessions with user info |
| `DELETE` | `/api/admin/sessions/:sessionId` | Admin | Force logout — delete a specific session |

## Global Assumptions

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/global-assumptions` | User | Get current global assumptions |
| `POST` | `/api/global-assumptions` | User | Create or update global assumptions |

### Global Assumptions Response (key fields)
```json
{
  "id": 1,
  "modelStartDate": "2026-04-01",
  "projectionYears": 10,
  "inflationRate": 0.03,
  "baseManagementFee": 0.05,
  "incentiveManagementFee": 0.15,
  "staffSalary": 75000,
  "staffTier1MaxProperties": 3,
  "staffTier1Fte": 2.5,
  "staffTier2MaxProperties": 6,
  "staffTier2Fte": 4.5,
  "staffTier3Fte": 7.0,
  "debtAssumptions": { "acqLTV": 0.75, "interestRate": 0.09, "amortizationYears": 25 }
}
```

## Properties

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/properties` | User | List all properties for current user |
| `GET` | `/api/properties/:id` | User | Get single property by ID |
| `POST` | `/api/properties` | User | Create new property |
| `PATCH` | `/api/properties/:id` | User | Update existing property |
| `DELETE` | `/api/properties/:id` | User | Delete property |

### Property Response (key fields)
```json
{
  "id": 1,
  "name": "The Hudson Estate",
  "location": "Upstate New York",
  "market": "North America",
  "roomCount": 20,
  "startAdr": 330,
  "purchasePrice": 2300000,
  "type": "Full Equity",
  "cateringBoostPercent": 0,  // DEPRECATED — catering boost is no longer used in revenue calculations
  "costRateRooms": 0.36,
  "costRateFB": 0.15
}
```

## Scenarios

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/scenarios` | User | List all scenarios for current user |
| `POST` | `/api/scenarios` | User | Save current state as new scenario |
| `POST` | `/api/scenarios/:id/load` | User | Load saved scenario (restores all data) |
| `PATCH` | `/api/scenarios/:id` | User | Update scenario name/description |
| `DELETE` | `/api/scenarios/:id` | User | Delete scenario (cannot delete "Base") |
| `POST` | `/api/scenarios/:id/clone` | User | Duplicate scenario with " (Copy)" suffix |
| `GET` | `/api/scenarios/:id/export` | User | Download scenario as JSON (excludes images) |
| `POST` | `/api/scenarios/import` | User | Upload and create scenario from JSON |
| `GET` | `/api/scenarios/:id1/compare/:id2` | User | Diff two scenarios (assumptions + properties) |

### Scenario Save Request
```json
{ "name": "Optimistic Case", "description": "Higher ADR growth scenario" }
```

## Design Themes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/design-themes` | User | List user's themes + system themes |
| `GET` | `/api/design-themes/active` | User | Get active theme for current user |
| `POST` | `/api/design-themes` | User | Create theme (owned by current user) |
| `PATCH` | `/api/design-themes/:id` | User | Update theme (owner only) |
| `DELETE` | `/api/design-themes/:id` | User | Delete theme (owner only, not active) |
| `POST` | `/api/design-themes/:id/activate` | User | Set theme as active for current user |

## Research Questions

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/research-questions` | User | List all custom research questions (ordered by sortOrder) |
| `POST` | `/api/research-questions` | User | Create new research question (auto-assigns sortOrder) |
| `PUT` | `/api/research-questions/:id` | User | Update question text |
| `DELETE` | `/api/research-questions/:id` | User | Delete a research question |

### Research Question Request (Create/Update)
```json
{ "question": "What is the average wellness retreat pricing in Costa Rica?" }
```

### Research Question Response
```json
{ "id": 1, "question": "What is the average wellness retreat pricing in Costa Rica?", "sortOrder": 0, "createdAt": "2026-02-15T01:10:29.043Z" }
```

Research questions are automatically merged into AI research prompts during property market research generation via `researchVariables.customQuestions`.

## Market Research

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/research/:type` | User | Get cached research (type: property/company/global) |
| `POST` | `/api/research/generate` | User | Generate new AI research (SSE stream) |

### Research Generate Request
```json
{
  "type": "property",
  "propertyId": 1,
  "propertyContext": { "name": "The Hudson Estate", "location": "..." },
  "boutiqueDefinition": { ... }
}
```

## File Uploads & Image Generation

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/uploads/request-url` | User | Get presigned upload URL for object storage |
| `GET` | `/api/objects/*` | None | Serve uploaded files from object storage |
| `POST` | `/api/generate-image` | User | Generate image via gpt-image-1 (returns raw base64) |
| `POST` | `/api/generate-property-image` | User | Generate property photo with AI and upload to storage |

### Generate Property Image Request
```json
{ "prompt": "Luxury boutique hotel exterior, Upstate New York, architectural photography" }
```

### Generate Property Image Response
```json
{ "objectPath": "/objects/uploads/abc-123-uuid" }
```

The endpoint generates an image via OpenAI `gpt-image-1`, uploads the PNG buffer to object storage via presigned URL, and returns the object path ready to use as `imageUrl` on a property. Used by `PropertyImagePicker` in `client/src/features/property-images/`.

## Utility

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/fix-images` | None | Utility endpoint to fix property image URLs |

## One-Time Seeding

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/seed-production` | None | Initial database population (skips if data exists) |

## Auth Roles

| Role | Access Level |
|------|-------------|
| `admin` | Full access to all endpoints including user management and verification |
| `user` | Standard access to properties, assumptions, scenarios, research |

| `checker` | Verification access to run financial checks and view audit results |

**Checker Access**: The `requireChecker` middleware grants verification endpoint access to users with `role === "admin"` OR `email === "checker@norfolkgroup.io"`. The checker user has role `"checker"` in the database.

## Error Responses

All errors follow this format:
```json
{ "error": "Human-readable error message" }
```

Common HTTP status codes:
- `400` - Bad request (validation failure)
- `401` - Not authenticated
- `403` - Access denied (insufficient role)
- `404` - Resource not found
- `429` - Rate limited (too many login attempts)
- `500` - Server error
