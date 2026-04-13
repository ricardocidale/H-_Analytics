---
name: multi-tenancy
description: >
  Multi-tenant branding system: users, user groups, themes, logos, asset descriptions,
  and company names. Use when managing branding, user assignment, themes, or any
  group-level customization.
---

# Multi-Tenancy & Branding System

## Overview

Branding flows through User Groups, not individual users:
```
User → User Group → Default Fallback
```

Every user belongs to exactly one User Group. Every User Group defines company branding (name, logo, theme, asset description). Users inherit all branding from their group.

## Entities

### 1. Users

**Table:** `users`

| Field | Type | Description |
|-------|------|-------------|
| id | integer (auto) | Primary key |
| email | text (unique) | Login identifier |
| passwordHash | text | bcrypt hash |
| role | text | `admin`, `partner`, `checker`, or `investor` |
| name | text? | Display name |
| company | text? | Legacy company field |
| title | text? | Job title |
| userGroupId | integer? | FK to user_groups (always set) |
| createdAt | timestamp | Auto |
| updatedAt | timestamp | Auto |

**Invariants:**
- Every user must belong to a user group (enforced on startup via seed)
- New users are assigned to the default group ("General") automatically
- Users cannot have per-user branding overrides; branding comes from the group

**Schema:** `shared/schema.ts` (users table)
**Storage:** `server/storage.ts` (getUser, createUser, updateUser, etc.)

### 2. User Groups

**Table:** `user_groups`

| Field | Type | Description |
|-------|------|-------------|
| id | integer (auto) | Primary key |
| name | text | Group display name (e.g., "KIT Group", "General") |
| logoId | integer? | FK to logos table (logo carries the company name) |
| themeId | integer? | FK to design_themes table |
| assetDescriptionId | integer? | FK to asset_descriptions table |
| isDefault | boolean | Exactly one group is default (the "General" group) |
| createdAt | timestamp | Auto |

**Invariants:**
- Exactly one group has `isDefault = true` (the "General" group)
- The default group cannot be deleted
- When a non-default group is deleted, its users are moved to the default group
- All users without a group are auto-assigned to the default group on startup
- **No `companyName` on user groups** — the company name comes from the group's assigned logo
- Users see the company name from their group's logo (or the default logo if none assigned)

**Seed behavior:**
- On startup, if no default group exists, a "General" group is created
- All unassigned users are moved to the default group

**Admin UI:** User Groups tab in Admin page (tabs: Users, Companies, Activity, Verification, Logos, User Groups, Branding, Themes, Navigation, Database)
- Create/edit groups with name, logo (includes company name), theme, asset description
- Default group shows "Default" badge and cannot be deleted
- Users can be assigned to groups via the Users tab

### 3. Design Themes

**Table:** `design_themes`

| Field | Type | Description |
|-------|------|-------------|
| id | integer (auto) | Primary key |
| name | text | Theme display name |
| description | text | Theme description |
| colors | jsonb (DesignColor[]) | Array of color definitions |
| isDefault | boolean | Exactly one theme is default |
| createdAt | timestamp | Auto |
| updatedAt | timestamp | Auto |

**DesignColor structure:**
```typescript
interface DesignColor {
  rank: number;
  name: string;
  hexCode: string;
  description: string;
}
```

**Invariants:**
- Themes are standalone entities (not owned by any user)
- Exactly one theme has `isDefault = true`
- The default theme cannot be deleted
- Themes are assigned to User Groups, not to individual users
- Any group without a themeId uses the default theme
- Themes can be created, edited (name + colors), and deleted (except default)

**Admin UI:** Themes tab in Admin page (standalone CRUD)
- Create new themes with name, description, colors
- Edit existing themes
- Delete non-default themes
- Default theme shows "Default" badge

### 4. Logos

**Table:** `logos`

| Field | Type | Description |
|-------|------|-------------|
| id | integer (auto) | Primary key |
| name | text | Logo display name (e.g., "Norfolk AI - Blue") |
| companyName | text | Company name associated with this logo (e.g., "Norfolk Group") |
| url | text | Path or URL to logo image |
| isDefault | boolean | Exactly one logo is default |
| createdAt | timestamp | Auto |

**Invariants:**
- Logos are standalone, reusable entities
- Each logo carries its own `companyName` — this is how company names are defined
- Exactly one logo has `isDefault = true`
- The default logo cannot be deleted
- Logos are assigned to User Groups
- Any group without a logoId uses the default logo
- **Company names live on logos, not on user groups.** When a group picks a logo, users in that group see the logo's company name.
- **Admin Logos tab uses AIImagePicker** — Logo creation supports three modes: file upload, AI image generation, and URL input (via the `AIImagePicker` component)

### 5. Asset Descriptions

**Table:** `asset_descriptions`

| Field | Type | Description |
|-------|------|-------------|
| id | integer (auto) | Primary key |
| name | text | Display name (e.g., "Luxury Boutique Hotels & Wellness") |
| isDefault | boolean | Exactly one is default |
| createdAt | timestamp | Auto |

**Invariants:**
- Asset descriptions are standalone, reusable entities
- Exactly one has `isDefault = true`
- Assigned to User Groups, inherited by users in that group

## Branding Resolution

The `/api/my-branding` endpoint resolves branding for the authenticated user:

```
1. Get user's userGroupId and selectedThemeId
2. If group exists:
   - logo = group.logoId → logos table (or default logo)
   - companyName = resolved logo's companyName
   - theme resolution (3-tier):
     a. user.selectedThemeId → if set, use this theme (user's personal choice)
     b. group.themeId → if set, use this theme (group default)
     c. default theme → fallback
   - assetDescription = group.assetDescriptionId → asset_descriptions table (or default)
3. If no group (should not happen):
   - Fall back to defaults for everything (default logo, default theme, etc.)
```

**Key: company name comes from the logo**, not the group. The logo entity is the single source of truth for both the visual logo and the associated company name.

**Theme selection**: Users can override their group's default theme by selecting a different one on their Profile page. The theme selector only appears when more than one theme is available. Selecting "Group Default" clears the override (sets `selectedThemeId` to null). Themes are created, edited, and deleted only in Administration.

## API Routes

### User Groups
- `GET /api/admin/user-groups` — List all groups
- `POST /api/admin/user-groups` — Create group
- `PATCH /api/admin/user-groups/:id` — Update group
- `DELETE /api/admin/user-groups/:id` — Delete group (400 if default)
- `PATCH /api/admin/users/:id/group` — Assign user to group

### Themes
- `GET /api/design-themes` — List all themes (admin only, full details)
- `GET /api/available-themes` — List all themes (any authenticated user, for theme selection)
- `GET /api/design-themes/:id` — Get single theme
- `POST /api/admin/design-themes` — Create theme (admin only)
- `PATCH /api/admin/design-themes/:id` — Update theme (admin only)
- `DELETE /api/admin/design-themes/:id` — Delete theme (400 if default)
- `PATCH /api/profile/theme` — User selects a theme (`{ themeId: number | null }`)

### Logos
- `GET /api/admin/logos` — List all logos
- `POST /api/admin/logos` — Create logo
- `PATCH /api/admin/logos/:id` — Update logo
- `DELETE /api/admin/logos/:id` — Delete logo (400 if default)

### Branding
- `GET /api/my-branding` — Resolve current user's branding from group

## File Locations

| What | Where |
|------|-------|
| Schema definitions | `shared/schema.ts` |
| Storage layer | `server/storage.ts` |
| API routes | `server/routes.ts` |
| Seed data | `server/seed.ts` |
| Admin UI | `client/src/pages/Admin.tsx` |
| Theme manager component | `client/src/features/design-themes/ThemeManager.tsx` |
| Theme types | `client/src/features/design-themes/types.ts` |
| Theme engine skill | `.claude/skills/ui/theme-engine.md` |
| This skill | `.claude/skills/multi-tenancy/SKILL.md` |

## User Group Assignments (Seed)

The Admin user (email: `admin`) belongs to the **Norfolk Group** user group, not the default "General" group. Each built-in user is pre-assigned to a specific group:

| User Email | Name | User Group | Logo → Company Name | Role |
|------------|------|-----------|---------------------|------|
| `admin` | Ricardo Cidale | Norfolk Group | (via Norfolk AI logo) → Norfolk Group | admin |
| `checker@norfolkgroup.io` | Checker | Norfolk Group | (via Norfolk AI logo) → Norfolk Group | checker |
| `bhuvan@norfolkgroup.io` | Bhuvan Agarwal | Norfolk Group | (via Norfolk AI logo) → Norfolk Group | partner |
| `reynaldo.fagundes@norfolk.ai` | Reynaldo Fagundes | Norfolk Group | (via Norfolk AI logo) → Norfolk Group | partner |
| `rosario@kitcapital.com` | Rosario David | KIT Group | (via KIT logo) → KIT Capital Hospitality | partner |
| `kit@kitcapital.com` | Dov Tuzman | KIT Group | (via KIT logo) → KIT Capital Hospitality | partner |
| `lemazniku@icloud.com` | Lea Mazniku | KIT Group | (via KIT logo) → KIT Capital Hospitality | partner |

**Admin in Norfolk Group:** The admin user sees "Norfolk Group" branding (company name, logo, theme, asset description) throughout the portal, not the default "Hospitality Business Group" branding. This is intentional — the admin operates under the Norfolk Group identity.

**Important:** The admin's branding is determined by their user group, not by their role. If the admin is reassigned to a different group, their branding changes accordingly. The admin role only grants administrative privileges (managing groups, themes, users); it does not confer special branding.

## Key Design Decisions

1. **No per-user branding (except themes)** — Logo, company name, and asset description are group-level only. Themes allow user-level override.
2. **Company names live on logos** — Each logo carries a `companyName`. When a group picks a logo, users in that group see the logo's company name. There is no separate company name field on user groups.
3. **Two separate "company name" concepts** — `logo.companyName` is the branding company name shown in the UI for multi-tenant identity. `globalAssumptions.companyName` is the Management Company entity name used in financial modeling. These are completely independent values serving different purposes.
4. **User-selectable themes** — Themes are managed (CRUD) only in Administration. Each user gets a default theme from their group but can select a different one on their Profile page if multiple themes exist. The theme selector only appears when >1 theme is available.
5. **Theme resolution order** — User's `selectedThemeId` → Group's `themeId` → Default theme.
6. **Admin belongs to Norfolk Group** — The admin user is a member of the "Norfolk Group" user group and inherits its branding. Admin role is about permissions, not branding.
7. **Default group is mandatory** — The "General" group always exists and cannot be deleted. New users land here.
8. **Default theme is mandatory** — At least one theme always exists. Groups without an explicit theme get the default.
9. **Deletion cascades to default** — Deleting a non-default group moves its users to the default group.
10. **Standalone entities** — Themes, logos, and asset descriptions are not owned by users or groups. They are shared resources that groups reference.
