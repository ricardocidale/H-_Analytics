---
title: "Brand & Appearance — Sidebar Restructure + Animations Tab"
status: active
created: 2026-05-16
depth: Standard
---

## Summary

Split the single "Brand Settings" admin sidebar entry into two dedicated items — **Themes** and **Brand Assets** — bring the horizontal tab bar into compliance with the app-wide `CurrentThemeTab` standard, and deliver a new **Animations** tab housing play/pause-controlled animation cards for the H+ Logo and the Cube animation.

---

## Problem Frame

The "Brand & Appearance" sidebar group currently exposes one flat item ("Brand Settings") that opens `BrandTab.tsx`, a component with its own horizontal sub-tab bar (Logos / Themes / Brand Assets). Two problems exist:

1. **Navigation hierarchy mismatch** — Themes and Brand Assets are distinct surfaces but share a single nav entry. Users have no direct sidebar path to either; they must open Brand Settings and then select a sub-tab.
2. **Tab bar non-compliance** — `BrandTab.tsx` implements its own `border-b-2` button pattern that doesn't match the `CurrentThemeTab` pill-style used on the Dashboard and other surfaces. This is a visual consistency violation.

A third gap: there is no surface for showcasing or previewing motion/animation assets. The new `AnalystCubeIcon` component exists but has no admin home.

---

## Requirements

| ID | Requirement |
|----|-------------|
| R-1 | Admin → Brand & Appearance sidebar group gains exactly two child items: **Themes** and **Brand Assets** |
| R-2 | "Themes" navigates directly to the current Themes page — no sub-tab chrome |
| R-3 | "Brand Assets" opens a page with three horizontal tabs: Logos, Brand Assets, Animations |
| R-4 | The Logos and Brand Assets tabs show the current `LogosTab` and `BrandAssetsTab` content unchanged |
| R-5 | The Animations tab presents animation cards in a photo-album card grid matching the visual style of Logos/Brand Assets |
| R-6 | Each animation card has a **play/pause toggle button** — default state is paused (static) on page load |
| R-7 | The Animations tab includes two cards: **H+ Logo** (new animated logo component) and **Cube** (`AnalystCubeIcon`) |
| R-8 | All horizontal tab bars in this section use `CurrentThemeTab` from `@/components/ui/tabs.tsx` (pill-style, card-with-shadow container) |
| R-9 | No backend changes — purely frontend restructuring |
| R-10 | Legacy URL hashes (`#/brand`, `#/logos`, `#/themes`) continue to navigate users to the correct destination via updated `SECTION_REDIRECTS` |

---

## Scope Boundaries

**In scope:**
- All files under `artifacts/hospitality-business-portal/src/`
- `AdminSidebar.tsx` — type union, redirects, nav groups
- `Admin.tsx` — lazy imports, sectionMeta, switch cases
- `BrandTab.tsx` — retired after replacement components are wired
- New components: `ThemesSection.tsx`, `BrandAssetsPage.tsx`, `AnimationsTab.tsx`, `HplusLogoAnimated.tsx`
- Modified component: `AnalystCubeIcon.tsx` — add `playing` prop
- `graphics/index.ts` — barrel export for `HplusLogoAnimated`

**Out of scope:**
- `lib/`, `api-server/`, schema, migrations, routes — no changes
- Upload, CRUD, or save capabilities in the Animations tab (display + play/pause only)
- Persisting the active sub-tab across navigation or page reloads
- Changing the content or functionality of `ThemesTab`, `LogosTab`, or `BrandAssetsTab`
- Auto-playing animations on page load (default state is always paused)

### Deferred to Follow-Up Work
- Multiple-animation-playing at the same time (currently: each card has independent state; could add "play all" later)
- URL-hash deep-linking to a specific Brand Assets sub-tab (e.g. `#/brand-assets-page?tab=animations`)

---

## Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| **New canonical sections: `"brand-themes"` and `"brand-assets-page"`** | Adding to the `AdminSection` union as canonical values (not aliases) ensures the switch in `Admin.tsx` and `sectionMeta` can reference them directly. The old `"brand"` entry becomes a `SECTION_REDIRECTS` alias pointing to `"brand-assets-page"` — it is the more general entry point. `"logos"` and `"themes"` legacy aliases are updated accordingly. |
| **"Brand & Appearance" switches from flat to multi-section group** | `buildNavGroups()` currently renders it as a flat single-item (no submenu). Adding a second section item triggers the existing multi-section rendering path (SidebarGroupLabel + SidebarMenuSub) automatically — no new rendering logic needed. |
| **`BrandTab.tsx` is retired, not refactored** | The file's role is fully replaced by `ThemesSection.tsx` + `BrandAssetsPage.tsx`. Attempting to reshape it in-place would leave dead code. Deletion is cleaner; the two replacement components are lean enough to write fresh. |
| **`CurrentThemeTab` for all horizontal tab bars** | Already exported from `@/components/ui/tabs.tsx` and used on Dashboard. It provides the card-with-shadow container, pill active state, overflow scroll, and optional `rightContent` slot. Extending it to Brand Assets Page closes the compliance gap with no new component needed. |
| **`playing` prop on animation components, default `true`** | External play/pause control requires a prop. Default `true` preserves backward compatibility for any existing consumer of `AnalystCubeIcon`. The `AnimationsTab` overrides it to `false` on mount and toggles it via local state. |
| **H+ Logo animation: framer-motion wrapper around `logo.png`** | No SVG source exists in the repo. The simplest compliant implementation is a framer-motion `motion.img` wrapping the existing `logo.png` asset with a continuous float + subtle pulse animation when `playing=true`, static otherwise. No external assets needed. |
| **Each animation card has independent `playing` state** | Simplest mental model for the admin user — pressing play on one card doesn't affect the other. A future "play all" action is a one-line state change if ever needed. |

---

## Implementation Units

### IU-1 · Add `playing` prop to `AnalystCubeIcon`
**File:** `artifacts/hospitality-business-portal/src/components/graphics/AnalystCubeIcon.tsx`

Add a `playing?: boolean` prop (default `true`). When `false`, suppress all animation: outer spin, per-cubie orbit, and position expansion should all be inert (same behavior as when `useReducedMotion()` returns `true`). The existing reduced-motion path already handles this — `playing=false` should short-circuit to the same static branch. The `playing` prop takes precedence over `useReducedMotion`.

**Test scenarios:**
- `playing={false}` → outer `animate` prop is `{}`, position wrappers animate to static grid positions, no orbit tumble
- `playing={true}` and `prefersReducedMotion=true` → static (reduced-motion wins when playing)
- `playing={true}` and `prefersReducedMotion=false` → full animation runs
- Default (`playing` not provided) → behaves identically to `playing={true}`

---

### IU-2 · Create `HplusLogoAnimated`
**Files:**
- `artifacts/hospitality-business-portal/src/components/graphics/HplusLogoAnimated.tsx` *(new)*
- `artifacts/hospitality-business-portal/src/components/graphics/index.ts` *(add export)*

A framer-motion wrapper around the existing `@/assets/logo.png`. Props: `size?: number` (controls width; height auto), `playing?: boolean` (default `true`), `className?: string`, `decorative?: boolean`, `ariaLabel?: string`. When `playing=true` and `useReducedMotion()=false`: a continuous float animation (subtle `y` oscillation, 3–4 s, ease in-out, infinite) with a soft opacity pulse layered on top. When `playing=false` or reduced motion: static `<img>`. Export from `graphics/index.ts`.

**Test scenarios:**
- `playing={false}` → renders a static `<img>`, no motion.div animate props active
- `playing={true}` → `motion.img` animates with float keyframes
- `decorative={false}` with `ariaLabel="H+ Analytics"` → `role="img"` + `aria-label` present
- `size={96}` → wrapper width is 96 px

---

### IU-3 · Create `AnimationsTab`
**File:** `artifacts/hospitality-business-portal/src/components/admin/AnimationsTab.tsx` *(new)*

Photo-album card grid (2-column on ≥md, 1-column on mobile) of animation preview cards. Each card: a square/tall preview area with a neutral background and the animation component centered inside it, a text label below ("H+ Logo" / "Cube"), and a play/pause icon button (using `Play` / `Pause` from the icon set). Each card tracks its own `playing` boolean in local state, defaulting to `false`. Pressing the button toggles it. The animation component receives the `playing` prop. Style each card as a `Card` with `CardContent` — consistent with the Logos/Brand Assets photo-album grid visual.

Animation registry (inline constant, not imported from elsewhere):
```
[
  { id: "hplus-logo", name: "H+ Logo",  Component: HplusLogoAnimated, previewSize: 80 },
  { id: "cube",       name: "Cube",      Component: AnalystCubeIcon,   previewSize: 64 },
]
```

**Test scenarios:**
- On mount: all `playing` states are `false` → all animation components receive `playing={false}`
- Clicking play button on "Cube" card → that card's `playing` becomes `true`; other cards unaffected
- Clicking pause button → `playing` returns to `false`
- `HplusLogoAnimated` and `AnalystCubeIcon` are imported from `@/components/graphics`

---

### IU-4 · Create `BrandAssetsPage`
**File:** `artifacts/hospitality-business-portal/src/components/admin/BrandAssetsPage.tsx` *(new)*

Three-tab page using `CurrentThemeTab`. Tabs: `Logos`, `Brand Assets`, `Animations`. Default active: `"logos"`. `LogosTab` is imported directly (eager). `BrandAssetsTab` and `AnimationsTab` are lazy-loaded via `React.lazy` with a shared minimal fallback (`<div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>`). Tab switching renders via conditional `{activeTab === "logos" && <LogosTab />}` pattern (same as the current `BrandTab`). The `CurrentThemeTab` component is imported from `@/components/ui/tabs`.

**Test scenarios:**
- Default render → Logos tab is active, `LogosTab` renders
- Click "Brand Assets" → `BrandAssetsTab` renders inside `Suspense`
- Click "Animations" → `AnimationsTab` renders inside `Suspense`
- Tab bar renders as a `CurrentThemeTab` card (rounded-xl border shadow-sm), not a `border-b-2` custom bar

---

### IU-5 · Create `ThemesSection`
**File:** `artifacts/hospitality-business-portal/src/components/admin/ThemesSection.tsx` *(new)*

A one-function component that renders `<ThemesTab />` directly. No sub-tab chrome, no horizontal bar. This exists only as a named default export so `Admin.tsx` can lazy-import it uniformly like every other section component.

---

### IU-6 · Update `AdminSidebar.tsx`
**File:** `artifacts/hospitality-business-portal/src/components/admin/AdminSidebar.tsx`

Three edits:

1. **`AdminSection` union** — add `"brand-themes"` and `"brand-assets-page"` as canonical members.

2. **`SECTION_REDIRECTS`** — update entries:
   - `"brand"` → `"brand-assets-page"` (was: `"brand"` was canonical; now it's an alias)
   - `"logos"` → `"brand-assets-page"` (was: `"brand"`)
   - `"themes"` → `"brand-themes"` (was: `"brand"`)

3. **`buildNavGroups()` "brand" group** — replace the single `{ value: "brand", label: "Brand Settings", icon: IconPalette }` section with two sections:
   - `{ value: "brand-themes",     label: "Themes",       icon: IconSwatchBook }`
   - `{ value: "brand-assets-page", label: "Brand Assets", icon: IconImage }`
   Since the group now has 2 sections (≥2), the sidebar renders it as a collapsible multi-section group automatically (SidebarGroupLabel + SidebarMenuSub path in the existing render loop).

**Test scenarios:**
- `resolveSection("brand")` → `"brand-assets-page"`
- `resolveSection("logos")` → `"brand-assets-page"`
- `resolveSection("themes")` → `"brand-themes"`
- `resolveSection("brand-themes")` → `"brand-themes"` (no redirect, identity)
- `resolveSection("brand-assets-page")` → `"brand-assets-page"` (identity)
- "Brand & Appearance" nav group has `sections.length === 2`

---

### IU-7 · Update `Admin.tsx`
**File:** `artifacts/hospitality-business-portal/src/pages/Admin.tsx`

Four edits:

1. **Lazy imports** — add:
   ```
   const ThemesSection    = lazy(() => import("@/components/admin/ThemesSection"));
   const BrandAssetsPage  = lazy(() => import("@/components/admin/BrandAssetsPage"));
   ```
   Remove: `const BrandTab = lazy(() => import("@/components/admin/BrandTab"))` (retired).

2. **`sectionMeta`** — add entries:
   - `"brand-themes"`: title "Themes", subtitle "Color palettes, typography, and visual appearance"
   - `"brand-assets-page"`: title "Brand Assets", subtitle "Logos, brand assets, and animation previews"
   - Update `"brand"` alias entry to match `"brand-assets-page"` subtitle.
   - Update `"logos"` and `"themes"` alias entries to match their new canonical targets.

3. **`SectionContent` switch** — replace `case "brand": return <BrandTab />;` with:
   ```
   case "brand-themes":     return <ThemesSection />;
   case "brand-assets-page": return <BrandAssetsPage />;
   ```

4. **Remove stale `BrandTab` reference** — ensure no dangling import after the lazy import line is removed.

**Test scenarios:**
- `section="brand-themes"` → `ThemesSection` renders
- `section="brand-assets-page"` → `BrandAssetsPage` renders
- `section="brand"` (legacy hash) → resolves to `"brand-assets-page"` → `BrandAssetsPage` renders
- `section="logos"` (legacy) → resolves to `"brand-assets-page"` → `BrandAssetsPage` renders
- `section="themes"` (legacy) → resolves to `"brand-themes"` → `ThemesSection` renders

---

### IU-8 · Delete `BrandTab.tsx`
**File:** `artifacts/hospitality-business-portal/src/components/admin/BrandTab.tsx` *(delete)*

After IU-4 through IU-7 are complete and all references to `BrandTab` are removed, delete the file. Confirm no other file imports it before deletion (a `grep -r "BrandTab"` check is the gate).

---

## Sequencing

```
IU-1 (AnalystCubeIcon playing prop)
IU-2 (HplusLogoAnimated)           — can run in parallel with IU-1
IU-5 (ThemesSection)               — can run in parallel with IU-1 and IU-2
  ↓
IU-3 (AnimationsTab)               — depends on IU-1 and IU-2
  ↓
IU-4 (BrandAssetsPage)             — depends on IU-3 and IU-5
  ↓
IU-6 (AdminSidebar)                — depends on IU-4 and IU-5 (type must match)
IU-7 (Admin.tsx)                   — depends on IU-4 and IU-5
  ↓
IU-8 (delete BrandTab)             — depends on IU-6 and IU-7 (all references cleared)
```

---

## Risks

| Risk | Mitigation |
|------|-----------|
| **`AdminSection` union widening** — adding new members can cause exhaustive-switch lint warnings in Admin.tsx if any switch has a `default` fallback that's relied on | The switch in `SectionContent` already has a `default` branch for Specialist sections; the new cases slot in before it. TypeScript will not error on addition to a union used in a non-exhaustive switch. |
| **Legacy hash redirects breaking** — `resolveSection` chains through `SECTION_REDIRECTS`; a misconfigured redirect creates an infinite loop | `resolveSection` already guards against cycles with a `seen` Set. Confirm redirect graph is acyclic: `"brand"→"brand-assets-page"`, `"logos"→"brand-assets-page"`, `"themes"→"brand-themes"`. None form a cycle. |
| **`BrandTab` deletion too early** — deleting before `Admin.tsx` import is removed causes a build error | IU-8 is gated on `grep -r "BrandTab" src/` returning zero hits. |
| **`logo.png` animation quality** — a PNG can't be selectively animated (paths, text). Float + pulse is achievable but not as crisp as SVG manipulation | Agreed approach is float + opacity pulse via `motion.img`. If the visual result is unsatisfactory, the fallback is to treat the logo card as a static display item only. Flag for user review after implementation. |

---

## Files Touched Summary

| File | Change |
|------|--------|
| `src/components/graphics/AnalystCubeIcon.tsx` | Add `playing` prop |
| `src/components/graphics/HplusLogoAnimated.tsx` | **New** |
| `src/components/graphics/index.ts` | Export `HplusLogoAnimated` |
| `src/components/admin/AnimationsTab.tsx` | **New** |
| `src/components/admin/BrandAssetsPage.tsx` | **New** |
| `src/components/admin/ThemesSection.tsx` | **New** |
| `src/components/admin/AdminSidebar.tsx` | Union + redirects + nav group |
| `src/pages/Admin.tsx` | Lazy imports + sectionMeta + switch |
| `src/components/admin/BrandTab.tsx` | **Deleted** |
