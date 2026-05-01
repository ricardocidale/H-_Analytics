---
name: navigation
description: Navigation shell components — Command Palette, Breadcrumbs, Favorites, Activity Feed, Dark Mode. Use when building navigation or shell features.
theme: dark-glass / inherit
---

# Navigation & Shell Components

## Command Palette (Ctrl+K)
Global search and quick-action launcher.

- **File**: `client/src/components/CommandPalette.tsx`
- **Trigger**: Ctrl+K (or Cmd+K on Mac)
- **Groups**: Navigation, Properties (live search), Quick Actions
- **Theme**: Dark Glass — `bg-[#0a0a0f]/95 backdrop-blur-xl`, `accent` highlighted results

---

## Breadcrumbs
Route-aware contextual breadcrumbs.

- **File**: `client/src/components/Breadcrumbs.tsx`
- **Behavior**: Static route map for all 22 pages; dynamic property name resolution via store
- **Property routes**: Home → Properties → {Property Name} → [Edit|Research]
- **Theme**: Inherits from parent — uses `text-foreground` / `text-muted-foreground` tokens

---

## Favorites / Bookmarks
Pin properties, pages, or views for quick access.

- **File**: `client/src/components/Favorites.tsx`
- **Storage**: Zustand `useFavoritesStore` persisted to localStorage
- **UI**: Star icon on property cards/headers, sidebar section, command palette group
- **Star Colors**: Unfavorited = `text-muted-foreground/40`, Favorited = `text-[#9FBCA4] fill-[#9FBCA4]`

---

## Activity Feed
Recent user actions and system events in chronological order.

- **File**: `client/src/components/ActivityFeed.tsx`
- **Storage**: Zustand `useActivityStore`, last 50 events persisted to localStorage
- **Events**: assumption_change (Sliders), scenario_run (Play), export (Download), property_add (Plus), research_refresh (RefreshCw), verification (CheckCircle)
- **Placement**: Dashboard widget or dedicated section

---

## Dark Mode
Dark mode is a theme variant, not a separate toggle.

- **Tokens**: Base `#0a0a0f`, Accent `#9FBCA4`, Text `#FFF9F5`, Card `#1a1a2e`, Borders `white/10`
- **Toggle**: Theme switcher in Settings; switching to "Dark" theme activates full dark mode
- **Persistence**: `useThemeStore` (localStorage)

---

## Sidebar Navigation Visibility by Role

Navigation items in `client/src/components/Layout.tsx` are filtered by user role. The four roles are: `admin`, `partner`, `checker`, `investor`.

| Nav Item | Admin | Partner | Checker | Investor | Guard |
|----------|-------|---------|---------|----------|-------|
| Dashboard | Yes | Yes | Yes | Yes | — |
| Properties | Yes | Yes | Yes | Yes | — |
| Management Co. | Yes | Yes | Yes | No | `hasManagementAccess` |
| Property Finder | Yes | Yes | Yes | No | `hasManagementAccess` + sidebar config |
| Analysis | Yes | Yes | Yes | No | `hasManagementAccess` + sidebar config |
| Systemwide Assumptions | Yes | Yes | Yes | No | `hasManagementAccess` |
| My Profile | Yes | Yes | Yes | Yes | — |
| My Scenarios | Yes | Yes | Yes | No | `hasManagementAccess` + sidebar config |
| Help | Yes | Yes | Yes | Yes | — |
| Admin Settings | Yes | No | No | No | `isAdmin` |
| Logo Management | Yes | No | No | No | `isAdmin` |

### Role Definitions (from `client/src/lib/auth.tsx`)
- `isAdmin`: `user.role === "admin"`
- `isChecker`: `user.role === "checker"`
- `isPartner`: `user.role === "partner"`
- `isInvestor`: `user.role === "investor"`
- `hasManagementAccess`: `user.role !== "investor"` (admin, partner, checker)

### Sidebar Config Toggle (`sb()`)
Admin-configurable toggles stored in `global_assumptions` table. Admin always sees all items regardless of toggle state. Non-admin users respect the toggle. Investor role is blocked independently of toggles via `hasManagementAccess`.

### Divider Cleanup
Consecutive dividers are automatically filtered out at render time so hidden items don't leave orphan separators.
