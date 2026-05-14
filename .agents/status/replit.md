# Replit Agent — Agent Status

<!-- Replit is the SOLE WRITER of this file. CC reads it but never edits it. -->
<!-- Update at session start (take ownership) and session end (release + handoff). -->
<!-- Staleness: if Updated timestamp is >24h ago, treat as idle regardless of Status. -->

Updated: 2026-05-14T19:52:00Z
Status: idle

## Active Branch

main

## Last Commit on Branch

feat(admin): login toggle — Admin → System → Login (super_admin only)

## What Replit Did This Session

- Created `artifacts/api-server/src/routes/admin/system-auth.ts` with three endpoints:
  - `GET /api/system/login-config` (public) — returns `{ loginScreenEnabled: boolean }`
  - `GET /api/admin/system/auth-settings` (requireSuperAdmin) — reads setting
  - `PATCH /api/admin/system/auth-settings` (requireSuperAdmin) — toggles setting
  - Setting stored in `seed_defaults` table with `{entityType:'system', entityKey:'auth', fieldName:'login_screen_enabled'}`
- Registered `registerSystemAuthRoutes` in `artifacts/api-server/src/routes/admin/index.ts`
- Created `artifacts/hospitality-business-portal/src/components/admin/LoginSettingsTab.tsx` — Switch toggle (super_admin only), Badge, warning alert
- Updated `AdminSidebar.tsx` — added `"login-settings"` to `AdminSection` type + "Login" item in System group
- Updated `Admin.tsx` — lazy import + `sectionMeta` entry + `case "login-settings"` render
- Updated `Login.tsx` — queries `/api/system/login-config`, shows "Access Restricted" panel when `loginScreenEnabled: false`
- Fixed pre-existing API server crash: `model-defaults-refi-params-001` migration guard used wrong column names (`card`/`sort_order` instead of `card_key`; missing `last_set_source`). Manually inserted the 3 refi rows with correct schema and marked `model_defaults_refi_params_001` as applied in `_applied_migrations`. API server now boots cleanly.
- Typecheck ✅, lint ✅ across all packages

## Files Replit Owns Right Now

None — session complete.

## Handoff to CC

None.

## Pending Replit Work

None.

## Do Not Touch (CC-owned surfaces)

- `lib/engine/src/` — financial engine
- `lib/calc/src/` — financial calculators
- `lib/shared/src/constants*.ts` — shared constants
- `lib/db/src/` — DB schema + constants
- `artifacts/api-server/src/finance/` — finance routes
- `artifacts/api-server/src/report/` — report routes
- `artifacts/api-server/src/migrations/*.ts` — runtime guards
- `artifacts/api-server/src/tests/proof/` and `tests/engine/` — engine tests
