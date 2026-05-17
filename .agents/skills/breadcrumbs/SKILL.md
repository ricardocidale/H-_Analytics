# Breadcrumbs Skill

Maintain the breadcrumb trail that appears in the H+ Analytics app header whenever a route is added, removed, renamed, or reorganised.

---

## Where breadcrumbs live

**One file owns all breadcrumb logic:**

```
artifacts/hospitality-business-portal/src/components/Breadcrumbs.tsx
```

The exported `Breadcrumbs` component is rendered inside `Layout.tsx` (in the header bar). It is completely driven by `useBreadcrumbs()` — a hook that inspects the current URL and returns an ordered list of `{ label, href? }` entries.

---

## How the hook is structured

```
useBreadcrumbs()
  │
  ├── path === "/"                  → Dashboard (single-item)
  ├── path matches /property/:id…  → dynamic: resolves property name from store / API
  ├── path matches /structures…    → dynamic: resolves property name (when :id present)
  └── everything else              → staticRoutes lookup, with a raw-path fallback
```

There are **two dynamic blocks** (property routes + structures routes) and **one static map** (`staticRoutes`). Both must be kept in sync with `App.tsx`.

---

## Canonical breadcrumb map

This is the source of truth. Update it whenever the routing table in `App.tsx` changes.

### Dynamic — property sub-pages

Pattern: `/property/:id[/:sub]`

| Sub-path segment | Breadcrumb label      |
|------------------|-----------------------|
| *(none)*         | `<Property Name>`     |
| `edit`           | Property Assumptions  |
| `research`       | Research              |
| `photos`         | Photos                |
| `criteria`       | Research Criteria     |

Full trail: **Dashboard → Properties → \<Property Name\> [→ Sub-page]**

Sub-label additions live in the `SUB_LABELS` record inside the `propertyMatch` block.

### Dynamic — operating structure

Pattern: `/structures[/:id]`

| Variant            | Trail                                                |
|--------------------|------------------------------------------------------|
| `/structures`      | Dashboard → Operating Structure                      |
| `/structures/:id`  | Dashboard → Properties → \<Property Name\> → Operating Structure |

### Static routes

| Route                     | Trail                                              |
|---------------------------|----------------------------------------------------|
| `/`                       | Dashboard                                          |
| `/portfolio`              | Dashboard → Properties                             |
| `/company`                | Dashboard → Management Co.                         |
| `/company/assumptions`    | Dashboard → Management Co. → Assumptions           |
| `/company/research`       | Dashboard → Management Co. → Research              |
| `/company/guidance`       | Dashboard → Management Co. → Guidance              |
| `/company/icp-definition` | Dashboard → Management Co. → ICP Bracket Mix       |
| `/admin`                  | Dashboard → Admin                                  |
| `/intelligence`           | Dashboard → AI Intelligence                        |
| `/lb-slides`              | Dashboard → Slide Decks                            |
| `/profile`                | Dashboard → My Profile                             |
| `/scenarios`              | Dashboard → Scenarios                              |
| `/property-finder`        | Dashboard → Property Finder                        |
| `/analysis`               | Dashboard → Analysis                               |
| `/map`                    | Dashboard → Map View                               |
| `/help`                   | Dashboard → Help                                   |

**Redirect routes do NOT need breadcrumb entries** — they never render a page.

---

## Update protocol

### When you add a new route in `App.tsx`

1. Determine the route type:
   - **Redirect** (`<Redirect to="…" />`) → no breadcrumb entry needed. Stop here.
   - **Dynamic with `:id`** → add a regex match block or extend `SUB_LABELS`.
   - **Static** → add one line to `staticRoutes` in `Breadcrumbs.tsx`.

2. Decide the breadcrumb trail:
   - For a top-level page (no parent section): `[HOME, { label: "Page Name" }]`
   - For a page nested under an existing section (e.g. Management Co.): use the shared ancestor shorthand and append `{ label: "Sub-page Label" }`.

3. Add the entry to the appropriate block in `Breadcrumbs.tsx`.

4. Update this skill's canonical map table above.

### When you rename or remove a route

1. Find the matching entry in `staticRoutes` (or the dynamic block) and update/delete it.
2. If the route was a parent used by child routes (e.g. `/company`), update the ancestor shorthand label too.
3. Update this skill's canonical map table above.

### When you add a new section with sub-routes

Example: adding `/ops` as a new top-level section with children `/ops/summary` and `/ops/detail`:

```typescript
// Shorthand ancestor
const OPS: BreadcrumbEntry = { label: "Operations", href: "/ops" };

// In staticRoutes:
"/ops":          [HOME, { label: "Operations" }],
"/ops/summary":  [HOME, OPS, { label: "Summary" }],
"/ops/detail":   [HOME, OPS, { label: "Detail" }],
```

---

## Rules

- **Never add breadcrumb entries for redirect routes.** Redirects never render content, so a breadcrumb entry would only be reached during a flicker — it would show briefly and then disappear.
- **The last entry in every trail has no `href`.** It is the current page — making it a link would be redundant.
- **Parent links always carry an `href`.** If an ancestor is clickable, include its path.
- **Dynamic property name resolution** uses `useProperty(id)` (API) with a store fallback. The `routePropertyId` variable must be unconditionally initialised before any early returns to satisfy the React hooks rule (hooks cannot be called conditionally).
- **Admin and AI Intelligence internal tabs** (selected via query params / hash inside `/admin` and `/intelligence`) do NOT get separate URL routes, so they do NOT need separate breadcrumb entries.
- **The fallback** `[HOME, { label: path.slice(1) }]` catches any unregistered path so the app never shows an empty or broken breadcrumb. When you notice the fallback firing for a real page, add a proper entry.

---

## Typecheck verification

After any change, confirm types are clean:

```bash
pnpm --filter @workspace/hospitality-business-portal run typecheck
```
