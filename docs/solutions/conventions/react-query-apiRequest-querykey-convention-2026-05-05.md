---
title: "React Query convention: apiRequest() is for mutations only; use default queryFn for data queries"
date: 2026-05-05
category: docs/solutions/conventions/
module: knowledge-registry
problem_type: convention
component: frontend_stimulus
severity: high
applies_when:
  - "Adding a new useQuery call in any React component in this codebase"
  - "Deciding whether to call apiRequest() or raw fetch() inside a queryFn"
  - "Constructing a queryKey that includes pagination or filter parameters"
  - "Adding a useMutation that POSTs, PATCHes, or DELETEs via the shared API client"
tags:
  - react-query
  - api-request
  - query-key
  - typescript
  - paginated-queries
  - default-query-fn
related_components:
  - tooling
---

# React Query convention: apiRequest() is for mutations only; use default queryFn for data queries

## Context

`apiRequest()` (from `@/lib/queryClient`) is an HTTP transport utility that returns `Promise<Response>`. It was not designed as a typed data-fetching function. React Query's `useQuery<T>` hook requires a `queryFn` resolving to `Promise<T>` — not to a raw `Response`.

During the Knowledge Registry feature build, four components initially passed `apiRequest()` directly as `queryFn`, causing TypeScript error TS2769 ("no overload matches this call") across all of them. Fixing each component required knowing the two correct alternatives. A second related gap — the queryKey format required when relying on the codebase's default query function — produced subtler URL mismatches in paginated components (session history).

The reference implementation for the correct query pattern in this codebase is `artifacts/hospitality-business-portal/src/components/admin/intelligence/AnalystTables.tsx`. When in doubt, grep that file for the queryKey shape to use.

## Guidance

**For queries: omit `queryFn` and let the default take over.**

The React Query client in `queryClient.ts` registers a `defaultQueryFn` that **joins the full `queryKey` array with `"/"` to form the request URL**, handles JSON parsing, and throws on non-OK responses. Most queries in this codebase already rely on this — adding your own `queryFn` is only necessary when you need custom headers or post-processing.

```typescript
// Before — TS2769: apiRequest returns Promise<Response>, not Promise<CountryRow[]>
const { data } = useQuery<CountryRow[]>({
  queryKey: ["/api/admin/knowledge-registry/country-economic-data"],
  queryFn: () => apiRequest("GET", "/api/admin/knowledge-registry/country-economic-data", {}),
});

// After — omit queryFn; the joined queryKey array becomes the URL
const { data } = useQuery<CountryRow[]>({
  queryKey: ["/api/admin/knowledge-registry/country-economic-data"],
});
```

When custom fetch logic is genuinely needed, use raw `fetch()` — never `apiRequest()`:

```typescript
// Acceptable — custom logic with fetch(), not apiRequest()
const { data } = useQuery<CountryRow[]>({
  queryKey: ["/api/admin/knowledge-registry/country-economic-data"],
  queryFn: async () => {
    const res = await fetch("/api/admin/knowledge-registry/country-economic-data", {
      credentials: "include",
    });
    if (!res.ok) throw new Error("Failed to load country economic data");
    return res.json(); // cast to your expected type if needed: `as Promise<CountryRow[]>`
  },
});
```

**For mutations: `apiRequest()` is correct — always call `.json()` on the result.**

```typescript
const mutation = useMutation({
  mutationFn: async (payload: ImportPayload) => {
    const res = await apiRequest("POST", "/api/admin/knowledge-registry/import", payload);
    return res.json() as Promise<ImportResult>; // res.json() returns Promise<any>; cast to your type
  },
});
```

**When using the default `queryFn`, encode the full URL in a single-string `queryKey`.**

Because the default function joins the full array with `"/"`, a multi-element queryKey like `["/api/.../chunks", page]` produces the wrong URL (`/api/.../chunks/2` instead of `/api/.../chunks?page=2`). For paginated or parameterized queries, embed the complete URL — including query parameters — in a single string at index 0.

```typescript
// Before — join("/") produces /api/.../chunks/2, not /api/.../chunks?page=2
queryKey: [`/api/admin/knowledge-registry/${entryId}/chunks`, page]

// After — full URL with param in a single key string
queryKey: [`/api/admin/knowledge-registry/${entryId}/chunks?page=${page}`]
```

## Why This Matters

**Type safety.** `apiRequest()` returns `Promise<Response>`. `QueryFunction<T>` requires `Promise<T>`. TypeScript catches this as TS2769 at compile time — but only if type-checking runs. If suppressed or skipped, the bug surfaces silently at runtime when query consumers receive a `Response` object instead of parsed data.

**Cache and URL correctness.** The default `queryFn` derives the request URL by joining all elements of `queryKey` with `"/"`. When `queryKey` is a multi-element array and the intent is a query-parameterised URL, joining produces a path segment instead of a query string. Cache keys and actual request URLs diverge — paginated components may share a cache bucket across pages or hit the wrong endpoint.

**One decision, not two.** A single rule — `apiRequest()` for mutations, default queryFn (or raw `fetch()`) for queries — eliminates a recurring decision point. Developers should not need to read `queryClient.ts` to know which helper to reach for.

## When to Apply

- Any time a `useQuery` or `useSuspenseQuery` call is added — check whether `queryFn` is needed at all before writing one.
- Any time `apiRequest()` appears in a `queryFn` — this is always wrong in this codebase.
- Any time a `queryKey` uses a multi-element array and the default `queryFn` is in play — verify the joined result matches the intended URL.
- Any time a mutation is added — `apiRequest()` is correct here; always pair it with `.json()` and cast to the expected result type.

## Related

- **`artifacts/hospitality-business-portal/src/lib/queryClient.ts`** — defines `defaultQueryFn`; read this when the URL-construction behaviour needs to be confirmed. The join is at the function body, not `queryKey[0]`.
- **`artifacts/hospitality-business-portal/src/components/admin/intelligence/AnalystTables.tsx`** — reference implementation demonstrating the correct `useQuery` pattern without an explicit `queryFn`.
- **Cache invalidation after mutations** — `queryClient.invalidateQueries({ queryKey: [...] })` uses the same key-matching logic. If `page` moves into the URL string, invalidation calls must match the new key format.
