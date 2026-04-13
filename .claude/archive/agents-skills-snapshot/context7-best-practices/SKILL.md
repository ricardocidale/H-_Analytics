---
name: context7-best-practices
description: Library-specific best practices from Context7 docs for Drizzle ORM, React, Express.js, and TanStack Query. Use when making architectural decisions, reviewing code, or optimizing performance and security.
---

# Context7 Best Practices — H+ Analytics

Canonical reference for library-specific best practices sourced from Context7 documentation queries. Covers Drizzle ORM, React, Express.js, and TanStack Query patterns already applied or recommended for this codebase.

Use this skill when making architectural decisions, adding new features, or reviewing code for performance and security.

---

## 1. Drizzle ORM / PostgreSQL

### Foreign Key Indexing (APPLIED)

Every foreign key column must have an explicit index. Drizzle supports inline index definitions in the table builder's third argument.

```typescript
export const companies = pgTable("companies", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  logoId: integer("logo_id").references(() => logos.id, { onDelete: "set null" }),
  themeId: integer("theme_id").references(() => designThemes.id, { onDelete: "set null" }),
}, (table) => [
  index("companies_logo_id_idx").on(table.logoId),
  index("companies_theme_id_idx").on(table.themeId),
]);
```

**Rule**: When adding a new FK column, always add a matching index in the same commit.

**Already indexed FKs**: `properties.userId`, `property_urls.propertyId`, `users.companyId`, `users.userGroupId`, `sessions.userId`, `scenarios.userId`, `scenario_property_overrides.scenarioId`, `scenario_results.scenarioId`, `property_fee_categories.propertyId`, `market_research.propertyId`, `property_photos.propertyId`, `property_photos.beforePhotoId`, `companies.logoId`, `companies.themeId`, `user_groups.logoId`, `user_groups.themeId`.

### GIN Indexes for Full-Text Search

If adding search on text columns (property names, descriptions), use GIN indexes on `tsvector`:

```typescript
import { index, sql } from "drizzle-orm/pg-core";

export const properties = pgTable("properties", {
  name: text("name").notNull(),
}, (table) => [
  index("name_search_idx").using("gin", sql`to_tsvector('english', ${table.name})`),
]);
```

### Transactions

Use `db.transaction()` for atomic multi-table writes. Drizzle supports relational queries inside transactions, PostgreSQL isolation levels, and explicit rollback.

```typescript
await db.transaction(async (tx) => {
  await tx.update(accounts).set({ balance: sql`${accounts.balance} - 100` }).where(eq(accounts.userId, 1));
  await tx.update(accounts).set({ balance: sql`${accounts.balance} + 100` }).where(eq(accounts.userId, 2));
}, {
  isolationLevel: "serializable",
});
```

**When to use**: Scenario saves with overrides, property creation with photos, any multi-table mutation where partial failure would leave inconsistent data.

### Array Columns

Always call `.array()` as a method on the column type: `text().array()` — never `array(text())`.

---

## 2. React Frontend Performance

### Code Splitting with React.lazy (APPLIED)

All page-level components are lazy-loaded in `client/src/App.tsx`. Heavy dependencies (Three.js ~600KB) are isolated behind lazy boundaries.

```typescript
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const SensitivityAnalysis = lazy(() => import("@/pages/SensitivityAnalysis"));

<Suspense fallback={<PageLoader />}>
  <Dashboard />
</Suspense>
```

**Rule**: Every new page component must be lazy-loaded. Never add a static import for a page in App.tsx.

### useMemo for Expensive Computations (APPLIED)

Financial calculations, filtered lists, and derived data are wrapped in `useMemo`.

```typescript
const yearlyData = useMemo(() => computeYearlyFinancials(assumptions), [assumptions]);
```

**Rule**: Any computation that iterates over arrays or performs math (IRR, NPV, amortization) must be memoized. Use `console.time` / `console.timeEnd` to verify benefit during development.

### useCallback for Stable Function References (APPLIED)

Event handlers passed to `memo()`-wrapped children must use `useCallback`.

```typescript
const handleSave = useCallback((data: FormData) => {
  mutation.mutate(data);
}, [mutation]);
```

### React.memo for Pure Components (APPLIED)

Portfolio cards, table rows, chart wrappers, and audio visualizer parts use `memo()`.

```typescript
const PropertyCard = memo(function PropertyCard({ property }: Props) {
  // only re-renders when property changes
});
```

**Rule**: Components receiving stable props from parent lists (`map()` iterations) should be wrapped in `memo()`.

---

## 3. Express.js Backend Security & Performance

### Security Hardening (APPLIED)

All of the following are configured in `server/index.ts`:

| Header / Setting | Implementation | Status |
|---|---|---|
| `x-powered-by` disabled | `app.disable("x-powered-by")` | APPLIED |
| `X-Content-Type-Options: nosniff` | Custom middleware | APPLIED |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | APPLIED |
| `Permissions-Policy` | Camera, mic, geolocation restricted | APPLIED |
| `Content-Security-Policy` | Full CSP with Sentry, PostHog allowlists | APPLIED |
| `Strict-Transport-Security` | Production-only HSTS | APPLIED |
| Compression | `compression()` middleware with threshold | APPLIED |
| Trust proxy | `app.set("trust proxy", 1)` for Replit reverse proxy | APPLIED |

**Why not Helmet?** The app uses a custom CSP with fine-grained allowlists for Sentry, PostHog, and other third-party services. Helmet's defaults would need extensive overrides, so manual headers provide more explicit control.

### Async Error Handling (APPLIED)

Route handlers use async/await. Express 5.x auto-catches rejected promises. A global error handler at the end of the middleware chain returns sanitized errors in production.

```typescript
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  const status = (err as any).status || 500;
  const message = process.env.NODE_ENV === "production" && status >= 500
    ? "Internal Server Error"
    : err.message;
  res.status(status).json({ error: message });
});
```

### Caching Strategy (APPLIED)

- **Static assets**: Long `maxAge` via `express.static` options
- **Stable API endpoints** (`/api/logos`, `/api/companies`): `Cache-Control` headers applied via middleware
- **Static map thumbnails**: 24h `Cache-Control` on `/api/geospatial/static-map`

---

## 4. TanStack Query Data Management

### Hierarchical Query Keys (APPLIED)

Query keys mirror the REST API path structure. The `getQueryFn` in `queryClient.ts` joins the key array with slashes to form the fetch URL.

```typescript
// Key structure: ["api", "resource", id?, "sub-resource"?]
useQuery({ queryKey: ["api", "properties", propertyId, "photos"] });

// Invalidation at any level:
queryClient.invalidateQueries({ queryKey: ["api", "properties"] });           // all properties
queryClient.invalidateQueries({ queryKey: ["api", "properties", 50] });       // single property
queryClient.invalidateQueries({ queryKey: ["api", "properties", 50, "photos"] }); // just photos
```

### Stale Time & Refetch Policy (APPLIED)

Financial data uses `staleTime: Infinity` — data is never auto-refetched. This prevents expensive recomputations. Manual `invalidateQueries` is called after mutations.

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      refetchOnWindowFocus: false,
    },
  },
});
```

### Optimistic Updates (APPLIED)

Used in admin panels (Companies, Research Config) for instant-feeling UI:

```typescript
useMutation({
  mutationFn: deleteCompany,
  onMutate: async (id) => {
    await queryClient.cancelQueries({ queryKey: ["admin", "companies"] });
    const previous = queryClient.getQueryData(["admin", "companies"]);
    queryClient.setQueryData(["admin", "companies"], (old) =>
      old?.filter((c) => c.id !== id)
    );
    return { previous };
  },
  onError: (err, id, context) => {
    queryClient.setQueryData(["admin", "companies"], context?.previous);
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "companies"] });
  },
});
```

### Prefetching (RECOMMENDED — not yet applied)

Use `queryClient.prefetchQuery()` to pre-warm cache on hover for property detail pages:

```typescript
const prefetchProperty = (id: number) => {
  queryClient.prefetchQuery({
    queryKey: ["api", "properties", id],
    queryFn: () => fetch(`/api/properties/${id}`).then(r => r.json()),
  });
};
```

### Bulk Invalidation (APPLIED)

Financial query keys are centralized in `client/src/lib/api/properties.ts`:

```typescript
const ALL_FINANCIAL_QUERY_KEYS = [
  ["globalAssumptions"], ["properties"], ["propertyPhotos"],
  ["feeCategories"], ["scenarios"], ["research"], ["serviceTemplates"],
] as const;
```

---

## 5. Checklist for New Features

When building a new feature, verify these patterns are followed:

- [ ] New FK columns have matching indexes in the schema definition
- [ ] New pages are lazy-loaded in App.tsx with Suspense + PageLoader fallback
- [ ] Expensive computations use `useMemo` with correct dependency arrays
- [ ] Event handlers passed to child components use `useCallback`
- [ ] List-rendered components are wrapped in `memo()`
- [ ] New API routes handle errors via async/await (auto-caught by Express)
- [ ] Sensitive endpoints check auth (`requireAuth` middleware)
- [ ] Response bodies for stable data include `Cache-Control` headers
- [ ] Query keys follow hierarchical `["api", "resource", id]` pattern
- [ ] Mutations invalidate relevant query keys via `onSettled`
- [ ] New mutation hooks are registered in `FINANCIAL_MUTATIONS` or `NON_FINANCIAL_MUTATIONS` in the recalculation enforcement test
