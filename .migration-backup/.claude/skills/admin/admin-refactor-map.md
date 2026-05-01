---
name: admin-refactor-map
description: Admin page architecture after refactor. 87-line shell + 10 tab components. Reference for future maintenance.
status: COMPLETED (February 24, 2026)
---

# Admin Page Architecture (Post-Refactor)

## Shell: `client/src/pages/Admin.tsx` — 87 lines
Tab navigation only. No business logic, no data fetching, no mutations.

## Previous: 3,236-line monolith (archived for reference below)

## Current Component Structure

### Line Range Summary

| Section | Lines | Description |
|---------|-------|-------------|
| Imports | 1–28 | 28 imports from react, tanstack, lucide, components, libs |
| Interfaces | 29–199 | 13 interface/type definitions |
| Component Start | 201 | `export default function Admin()` |
| Tab State | 204–205 | `adminTab`, `activitySubTab` state |
| User Tab State | 207–217 | Dialog states, form states for user CRUD |
| Verification State | 218–222 | verification results, design results, sync state |
| Queries (shared) | 224–353 | users, loginLogs, globalAssumptions, activityLogs, checkerActivity, verificationHistory, activeSessions, logos, themes, assetDescriptions |
| Mutations (shared) | 254–410 | updateSidebar, createAssetDesc, deleteAssetDesc, updateGlobal |
| User Groups Section | 414–481 | State + CRUD mutations for user groups |
| Companies Section | 483–543 | State + CRUD mutations for companies |
| Logos Section | 545–592 | State + CRUD mutations for logos |
| User CRUD Mutations | 595–705 | create, delete, password, resetAll, edit mutations |
| AI + Verification | 707–787 | AI review, verification runner |
| PDF Export | 789–973 | `exportVerificationPDF()` — 185 lines |
| Design Check + Sync | 976–1067 | runDesignCheck, checkSyncStatus, executeSyncMutation |
| `renderUsers()` | 1089–1170 | Users tab JSX |
| `renderActivity()` | 1172–1320 | Login activity tab JSX (with active sessions) |
| `renderCheckRow()` + helpers | 1322–1442 | Verification rendering helpers |
| `renderVerification()` | ~1443–~1730 | Verification tab JSX |
| `renderActivityFeed()` | ~1731–~1840 | Activity feed sub-tab JSX |
| `renderCheckerActivity()` | ~1841–~1960 | Checker activity sub-tab JSX |
| `renderLogos()` | ~1961–~2120 | Logos tab JSX |
| `renderBranding()` | ~2121–~2300 | Branding tab JSX |
| `renderUserGroups()` | ~2301–~2500 | User groups tab JSX |
| `renderCompanies()` | ~2501–~2620 | Companies tab JSX |
| `renderThemes()` | ~2621–~2660 | Themes tab (delegates to ThemeManager) |
| `renderSidebar()` | ~2661–~2750 | Navigation/sidebar toggle tab JSX |
| `renderDatabase()` | ~2751–~2836 | Database sync tab JSX |
| Main Return JSX | 2838–2919 | Layout + Tabs shell with TabsContent |
| Dialogs | 2922–3236 | User, password, edit, company, group, logo dialogs |

### Shared Dependencies (needed by multiple tabs)

| Resource | Used By Tabs |
|----------|-------------|
| `users` query | Users, Activity, UserGroups |
| `adminLogos` query | Logos, Branding, Companies, UserGroups |
| `allThemes` query | Branding, UserGroups |
| `assetDescriptions` query | Branding, UserGroups |
| `globalAssumptions` query | Sidebar, Branding |
| `adminCompanies` query | Companies, Users |
| `userGroupsList` query | UserGroups, Branding |
| `queryClient` | All tabs (for invalidation) |
| `toast` | All tabs |

### Tab → Component Extraction Plan

| Tab | New File | Owns State | Owns Queries | Dialogs |
|-----|----------|-----------|-------------|---------|
| Users | `UsersTab.tsx` | user CRUD form state, dialog states | users, companies | Add/Edit/Password/Delete user dialogs |
| Companies | `CompaniesTab.tsx` | company form, mgmt state | companies, logos | Company create/edit dialog |
| Activity | `ActivityTab.tsx` | sub-tab, filters | loginLogs, activityLogs, checkerActivity, activeSessions | None |
| Verification | `VerificationTab.tsx` | verification results, AI review, expanded categories | verificationHistory | None |
| Logos | `LogosTab.tsx` | logo form, delete confirm | logos | Add logo dialog, delete confirm |
| UserGroups | `UserGroupsTab.tsx` | group form, editing state | userGroups, logos, themes, assetDescriptions, users | Group create/edit dialog |
| Branding | `BrandingTab.tsx` | asset desc name | globalAssumptions, logos, themes, assetDescriptions, userGroups | None |
| Themes | `ThemesTab.tsx` | None (delegates to ThemeManager) | None | None (ThemeManager handles it) |
| Navigation | `NavigationTab.tsx` | None | globalAssumptions | None |
| Database | `DatabaseTab.tsx` | sync results, confirm dialog | None (uses mutations) | Sync confirm dialog |

### Shared Types File: `client/src/components/admin/types.ts`

Extract these interfaces:
- `DesignCheckResult`
- `User` (admin version)
- `Logo`
- `LoginLog`
- `CheckResult`
- `PropertyCheckResults`
- `VerificationResult`
- `UserGroup`
- `AdminCompany`
- `AdminView`
- `ActivitySubView`
- `ActivityLogEntry`
- `CheckerSummary`
- `CheckerActivityData`
- `VerificationHistoryEntry`
- `ActiveSession`
- `AssetDesc`

### Key Rules for Extraction

1. Each tab component receives NO props — it fetches its own data
2. Each tab component uses `useToast()` and `useQueryClient()` internally
3. Shared types imported from `./types`
4. Dialogs that belong to a tab move INTO that tab component
5. The main Admin.tsx becomes a thin shell: Layout + Tabs + lazy tab rendering
6. `formatDateTime`, `formatDuration`, `formatMoney` imported from existing lib files
7. Icons imported per-component (only what's needed)
8. All `data-testid` attributes preserved exactly
