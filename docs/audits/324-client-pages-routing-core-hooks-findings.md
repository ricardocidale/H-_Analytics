# Audit #324 — Client Pages, Routing & Core Hooks

**Auditor**: Opus (automated deep review)  
**Date**: 2026-04-10  
**Scope**: `client/src/App.tsx` (668 lines), `client/src/pages/` (33 page files + 59 sub-files, ~15,008 lines), `client/src/hooks/` (8 files, 915 lines), `client/src/features/` (17 files, 3,122 lines), `client/src/types/` (1 file, 22 lines), `client/index.html`  
**Total**: ~119 files, ~19,735 lines

---

## Verdict: **PASS** — 0 Critical, 0 High, 5 Medium, 6 Low

### Overall Resilience Score: **8.4 / 10**

| Dimension | Score | Notes |
|-----------|-------|-------|
| Route Architecture | 9/10 | All pages lazy-loaded, 4 role guards (Protected/Admin/Management/Checker), legacy redirects preserved, Sentry + Financial + generic error boundaries layered |
| Code Splitting | 9/10 | Every page lazy-loaded; Login and ResearchRefreshOverlay also lazy (Three.js ~600KB deferred); admin tabs lazy per-section |
| Hook Correctness | 8/10 | Clean deps in useDebounce/usePrevious/useIsMobile; useMemo dep issue in useServerFinancials (see M-2); useUpload correctly handles cleanup |
| State Management | 8/10 | React Query with proper staleTime, keepPreviousData; Zustand for scenario dirty state; sessionStorage for once-per-session guards |
| Error Handling | 8/10 | Triple-layer error boundaries (Sentry → ErrorBoundary → FinancialErrorBoundary); but no page-level 404 for invalid property IDs (see M-4) |

Scoring methodology: Each dimension rated 1-10. Overall = weighted average (route 25%, splitting 15%, hooks 25%, state 20%, error handling 15%).

---

## Architecture Summary

### App Shell (`App.tsx`)
- **Provider hierarchy**: `Sentry.ErrorBoundary` → `ErrorBoundary` → `QueryClientProvider` → `AuthProvider` → `TooltipProvider` → `Router`. Clean top-down composition.
- **Four route guards**: `ProtectedRoute` (any auth), `AdminRoute` (admin only), `ManagementRoute` (non-investor), `CheckerRoute` (admin or checker). All handle loading states and redirect to `/login`.
- **Global behaviors**: `GlobalBeforeUnloadGuard` (warns on dirty tab close), `NavigationGuard` (intercepts route changes with unsaved work), `IdleAutoSave` (saves after 60min idle), `AutoSaveRestorePrompt` (offers to restore on login), `LogoutProtectionDialog`, `ScheduledResearchGate` (checks for stale research workflows).
- **9 legacy redirects**: /settings→/admin, /methodology→/help, /research→/, /global/research→/company/research, /sensitivity→/analysis, /financing→/analysis, /executive-summary→/, /checker-manual→/help, /compare→/analysis, /timeline→/analysis.
- **Analytics**: Sentry init at module level; analytics deferred via `requestIdleCallback` (good).
- **Lazy loading**: All 24 pages lazy-loaded with `React.lazy()` + `<Suspense>`. Login lazied separately (pulls Three.js).

### Pages (`client/src/pages/`)
- **33 page files** (10,459 lines top-level) plus **59 sub-module files** in `checker-manual/`, `user-manual/`, `icp/`, `scenarios/`.
- **Largest pages**: Dashboard (646), IcpStudio (635), Profile (625), PropertyEdit (578), ResearchHub (551), Company (546).
- **6 embedded sub-pages**: CheckerManual, ComparisonView, FinancingAnalysis, FundingPredictor, SensitivityAnalysis, TimelineView — not directly routed in App.tsx but rendered as tabs within Analysis and Help pages. All accept `{ embedded?: boolean }` prop. This is correct architecture — not dead code.
- **All pages wrapped in `<Layout>`**: Every page component includes the sidebar/header layout wrapper.

### Hooks (`client/src/hooks/`)
- **useServerFinancials** (413 lines): Primary financial computation hook. POSTs to `/api/finance/compute`, maps server response to `DashboardFinancials`, triggers Rebecca insight analysis. Properly uses `keepPreviousData` for smooth UX.
- **use-toast** (192 lines): Standard shadcn/ui toast implementation with reducer pattern.
- **use-geo** (161 lines): Cascading country → state → city selection with React Query. `staleTime: Infinity` for immutable geo data. Clean.
- **use-upload** (96 lines): File upload with validation, progress tracking, proper error handling.
- **use-mobile** (19 lines): Media query hook for responsive breakpoint. Clean.
- **use-debounce** (12 lines): Standard debounce hook. Clean deps.
- **use-previous** (11 lines): Standard previous value ref. Clean.
- **useExportSave** (12 lines): Thin wrapper for filename sanitization. `SaveDialog` is always `null` (stub).

### Features (`client/src/features/`)
- **design-themes/**: 6 files (1,150 lines) — ThemeManager, ThemePreview, ThemeFormDialog, AppearanceDefaultsSection, useDesignThemes hook, types.
- **property-images/**: 11 files (1,972 lines) — PhotoAlbumGrid, PhotoCard, PhotoGenerateDialog, PhotoUploadDialog, ImageCropDialog, EnhancePreviewDialog, HeroImage, useGenerateImage hook, PropertyImagePicker, index barrel.

### Types (`client/src/types/`)
- Single file: `dom-to-image-more.d.ts` (22 lines) — ambient module declaration for the `dom-to-image-more` library. Clean.

---

## Findings

### M-1: `PropertyEdit.tsx` uses `useState<any>(null)` for form draft (MEDIUM — type safety)

**Line 75:**
```typescript
const [draft, setDraft] = useState<any>(null);
```

The property edit form state is typed as `any`, which disables type checking on all form field accesses throughout the 578-line component. This is the primary form editing page — every assumption field flows through this untyped draft.

**Impact**: Typos in field names (e.g., `draft.purchasPrice` instead of `draft.purchasePrice`) won't be caught at compile time. This is a high-traffic code path.

**Recommendation**: Define a `PropertyDraft` type matching the form fields. Even a `Partial<Property>` would be an improvement over `any`.

---

### M-2: `useServerFinancials` useMemo dependency uses `.length` instead of stable reference (MEDIUM — correctness)

**Line 208-210:**
```typescript
const mapped = useMemo(
  () => (data && global) ? mapToDashboardFinancials(data, activeProperties, global) : null,
  [data, global, activeProperties.length],
);
```

The dependency array uses `activeProperties.length` as a proxy for array identity. If a property is added and one removed (same length), the memo won't recompute. The `activeProperties` array is filtered on every render (line 196: `properties?.filter(p => p.isActive !== false)`), so it creates a new array reference each time — but the memo only checks `.length`.

**Risk**: In practice, this is mitigated because `data` (the React Query result) also changes when properties change. But it's still a correctness concern — the memo could return stale mapped data in edge cases.

**Recommendation**: Either use `JSON.stringify(activeProperties.map(p => p.id))` in the dep array, or memoize `activeProperties` separately.

---

### M-3: No dynamic `document.title` updates on page navigation (MEDIUM — accessibility/SEO)

Zero pages set `document.title` dynamically. The browser tab always shows the static title from `index.html`: "H+ Analytics App | Powered by Norfolk AI".

**Impact**: Users with multiple tabs can't distinguish between Dashboard, Portfolio, Property Detail, etc. Screen readers don't announce page changes. Browser history shows the same title for every page.

**Recommendation**: Add a `useDocumentTitle` hook or use the `PageHeader` component to set `document.title` as a side effect. Example:
```typescript
useEffect(() => { document.title = `${pageTitle} — H+ Analytics`; }, [pageTitle]);
```

---

### M-4: No page-level 404 handling for invalid entity IDs (MEDIUM — UX)

Pages like `PropertyDetail`, `PropertyEdit`, `PropertyPhotos` parse the URL parameter (`params?.id`) and fetch the entity. If the entity doesn't exist (e.g., `/property/99999`), the page shows a loading spinner indefinitely or an error state — but no proper "Property not found" message with a link back to the portfolio.

**Example** from `PropertyEdit.tsx`:
```typescript
const propertyId = params?.id ? parseInt(params.id) : 0;
const { data: property, isLoading, isError } = useProperty(propertyId);
```
If `propertyId` is 0 or invalid, the query fires with `propertyId: 0` and likely fails.

**Recommendation**: Add a common `EntityNotFound` component that displays when the query returns 404, with a link back to the parent list page.

---

### M-5: `CompanyIcpDefinition.tsx` has 12 `as any` casts — highest in scope (MEDIUM — type safety)

This page casts `global` to `any` 12 times to access `icpConfig`, `icpDescriptive`, `icpQualitative`, `researchConfig`, and `assetDefinition` fields. These fields exist on the global assumptions object but aren't typed in the `GlobalResponse` interface.

**Lines 40-111** (sample):
```typescript
...((global as any)?.icpConfig && typeof (global as any).icpConfig === "object" ? (global as any).icpConfig : {}),
```

**Root cause**: The `GlobalResponse` type doesn't include ICP-related fields that were added after the initial type definition.

**Recommendation**: Extend the `GlobalResponse` type (or the underlying schema) to include these fields properly. This eliminates 12 `as any` casts in one change.

---

### L-1: `App.tsx` uses `useState<any[]>` for staleWorkflows and `useRef<any>` for prevUser (LOW — type safety)

**Line 373:** `const [staleWorkflows, setStaleWorkflows] = useState<any[]>([]);`
**Line 420:** `const prevUserRef = useRef<any>(null);`

Both could be properly typed:
- `staleWorkflows` should use the workflow type from the API response
- `prevUserRef` should use the `User` type from the auth context

---

### L-2: `useUpload` has `options` in useCallback dependency but `options` is an object (LOW — performance)

**Line 87:**
```typescript
}, [options]);
```

The `options` parameter is an object (`UseUploadOptions`), which creates a new reference on every render. This means the `uploadFile` callback is recreated every render, defeating the purpose of `useCallback`.

**Recommendation**: Destructure the callbacks from options and use them individually in the dep array, or use `useRef` to hold the options.

---

### L-3: `handleResearchComplete` useCallback missing `user` in dependency array (LOW — stale closure)

**App.tsx line 471-482:**
```typescript
const handleResearchComplete = useCallback((skipped?: boolean) => {
  setShowResearchRefresh(false);
  const guardKey = `research_refresh_done_${user?.id || "default"}`;
  // ...
}, []);  // empty deps — user?.id could be stale
```

The callback references `user?.id` but the dependency array is empty. In practice this is safe because `user` is set once and doesn't change during a session, but it's technically a stale closure.

---

### L-4: `IdleAutoSave` useEffect missing `autoSave` and `toast` in dependency array (LOW — stale closure)

**App.tsx line 255-279:**
```typescript
useEffect(() => {
  // ... uses autoSave.mutate and toast
}, [user]);  // only user in deps
```

The effect closure captures `autoSave` and `toast` but only lists `user` as a dependency. Since `autoSave` is from `useMutation` and `toast` from `useToast`, they're stable in practice — but the ESLint `react-hooks/exhaustive-deps` rule would flag this.

---

### L-5: 28 `as any` casts across pages — most from untyped research content (LOW — type safety)

**Breakdown:**
| Page | Count | Root Cause |
|------|-------|------------|
| CompanyIcpDefinition.tsx | 12 | GlobalResponse missing ICP fields |
| PropertyEdit.tsx | 5 | Research content untyped (`content as any`) |
| PropertyMarketResearch.tsx | 2 | Research content untyped |
| CompanyResearch.tsx | 2 | Research content untyped |
| Company.tsx | 2 | Export format type narrowing |
| IcpMarketContextTab.tsx | 2 | GlobalResponse missing portfolio locations |
| Dashboard.tsx | 1 | Export format type narrowing |
| PropertyDetail.tsx | 1 | Export format type narrowing |
| IcpStudio.tsx | 1 | Form data shape |

**Pattern**: 21 of 28 `as any` stem from two root causes:
1. `GlobalResponse` not including ICP/research config fields (14 casts)
2. Research `content` being typed as generic JSON rather than a structured interface (7 casts)

---

### L-6: `useServerFinancials` uses `prop as unknown as LoanParams` double cast (LOW — type bridge)

**Line 91:**
```typescript
const unified = aggregateUnifiedByYear(
  monthly,
  prop as unknown as LoanParams,
  global as unknown as GlobalLoanParams,
  projectionYears,
);
```

This double cast (`as unknown as`) bridges between `Property` and `LoanParams` types. The types share the same shape but aren't related by inheritance. While technically safe (the runtime objects have the correct fields), `as unknown as` bypasses all type checking.

**Recommendation**: Either make `LoanParams` extend `Pick<Property, ...>` or add a mapper function.

---

## Positive Observations

1. **100% lazy loading**: Every page is lazy-loaded via `React.lazy()` + `<Suspense>`. Login and ResearchRefreshOverlay are separately lazied to keep Three.js (~600KB) out of the initial bundle. Admin tabs are individually lazied. This is exemplary code splitting.

2. **Triple-layer error boundaries**: `Sentry.ErrorBoundary` (reports to Sentry with reload button) → `ErrorBoundary` (generic React boundary) → `FinancialErrorBoundary` (wraps financial pages). A calculation crash in one page can't take down the app.

3. **Comprehensive unsaved-work protection**: Four interlocking guards:
   - `GlobalBeforeUnloadGuard`: browser `beforeunload` event
   - `NavigationGuard`: intercepts route changes, reverts location, shows dialog
   - `LogoutProtectionDialog`: confirms logout with dirty state
   - `IdleAutoSave`: saves after 60 min idle

4. **Session-guarded overlays**: `ResearchRefreshOverlay` and `ScheduledResearchGate` use `sessionStorage` to show once per login session. Smart debounce (5-min cooldown on stale research check).

5. **Hooks are clean and focused**: All 8 hooks follow single-responsibility. `useDebounce`, `usePrevious`, `useIsMobile` are textbook implementations. `useGeoSelect` properly cascades country → state → city with React Query (`staleTime: Infinity` for immutable geo data).

6. **Server-side financial computation**: `useServerFinancials` sends all properties to `/api/finance/compute` and maps the response — computation happens server-side, not in the browser. Proper `keepPreviousData` prevents flash-of-empty during recomputation.

7. **9 legacy redirects preserved**: Old routes (/sensitivity, /financing, /map, /compare, /timeline, etc.) all redirect to their new consolidated locations. No broken bookmarks.

8. **Feature modules are well-structured**: `design-themes/` and `property-images/` follow the barrel pattern with dedicated hooks, types, and components. Clean separation.

9. **`data-testid` coverage**: 34 of 35 page-level files (97%) have at least one `data-testid`. Deep coverage in interactive pages (Profile: 19, ComparisonView: 14, MyScenariosCard: 13, Logos: 11, IcpProfileTab: 11).

10. **All pages use `<Layout>`**: Every page wraps its content in the shared Layout component, ensuring consistent sidebar/header/footer.

---

## `as any` Tally

| Area | Count | Budget | Status |
|------|-------|--------|--------|
| App.tsx | 0 | — | ✅ Clean (2 × `any` state/ref but not casts) |
| Pages | 28 | ≤100 (client total) | ✅ Within budget |
| Hooks | 0 | — | ✅ Exemplary |
| Features | 1 | — | ✅ Minimal |
| **Scope Total** | 29 | — | ✅ |

**Avoidable**: 21 of 29 (GlobalResponse type extension + research content typing).

---

## Recommendations Priority

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 1 | M-3: Add `useDocumentTitle` hook | 30 min | Accessibility + UX for multi-tab users |
| 2 | M-5: Extend GlobalResponse with ICP fields | 1 hour | Eliminates 14 `as any` casts |
| 3 | M-1: Type PropertyEdit draft state | 1 hour | Type safety on primary form page |
| 4 | M-4: Add EntityNotFound component for invalid IDs | 1 hour | Better UX for deep-linked invalid URLs |
| 5 | M-2: Fix useMemo dependency in useServerFinancials | 15 min | Correctness improvement |
| 6 | L-3/L-4: Fix stale closure deps in App.tsx callbacks | 15 min | ESLint compliance |
