---
name: ui-page-patterns
description: Build or fix UI pages to match the app's established visual and behavioral patterns. Use when creating a new page, fixing a page that feels visually inconsistent, or reviewing a page before shipping. Covers page classification, canonical reference discovery, component reuse scan, required states (loading/empty/error), action button discipline, screen real estate, and quality gates. Works for any React + Tailwind app.
---

# UI Page Patterns Skill

Build pages that look and behave like they belong in the app — not like they were bolted on. Every page in a well-maintained app shares the same visual language, component set, and interaction patterns. This skill teaches you to find that language in the existing codebase and apply it rather than inventing your own.

<HARD-GATE>
Do NOT write any page code until you have completed Phase 1 (classify + find canonical) and Phase 2 (component scan). Skipping these phases is the single most common cause of inconsistent pages that need to be re-done.
</HARD-GATE>

---

## Phase 1 — Classify and Find Canonical Pages

### Step 1a: Classify the page type

Every page in an app belongs to one of a small number of archetypes. Identify which archetype fits before writing a line of code.

**Report / Presentation page**
- Displays computed data, financial statements, charts, summaries
- Primary action: Export (PDF, Excel, PNG) and/or AI analysis
- Navigation: tabs that switch between views of the same data
- User edits nothing on this page — it's read-only
- Examples in a typical app: Dashboard, Portfolio view, Property Detail, Analysis summary

**Form / Editor page**
- Allows the user to edit structured data organized by topic
- Primary actions: Save (per-tab or global), Analyst trigger (AI analysis of the saved data)
- Navigation: tabs that isolate different sections of the form
- Each tab has its own Save button — save is scoped to the active tab
- Examples: Assumptions editor, Admin config, AI settings, Onboarding wizard

**Hybrid page**
- Shows computed output AND allows assumption overrides on the same screen
- Has both save and export actions
- Rare — try hard to avoid; split into two pages if possible

### Step 1b: Find 2–3 canonical pages of the same type

Search the codebase for existing pages of the same archetype. These are your blueprints.

```
# Find pages that use the app's tab + action pattern:
grep -rl "Tabs\|TabsTrigger\|TabsContent" src/pages/ | head -10

# Find pages that use the export pattern:
grep -rl "ExportMenu\|ExportDialog\|useExportSave" src/pages/ | head -10

# Find pages that use the analyst/save pattern:
grep -rl "AnalystButton\|requestSave\|SaveDialog" src/pages/ | head -10
```

Pick the 2–3 results that are most similar in purpose to the page you're building. **Read them in full.** Pay attention to:
- Import list (which shared components do they use?)
- Page-level state variables and what they control
- Loading/error guard structure (how does the page render before data arrives?)
- Tab structure and naming conventions
- Where the action buttons are positioned (header vs. per-tab footer vs. floating)
- What the page's main data fetch looks like (custom hook? `useQuery`? inline?)

---

## Phase 2 — Component Scan Before Creating Anything

Search the component library before creating any new component.

```
# Search by function
grep -rl "export.*Button\|export.*Card\|export.*Table\|export.*Badge" src/components/ | head -20
ls src/components/ui/
ls src/components/

# Search by visual term  
grep -rl "skeleton\|spinner\|loading\|empty" src/components/ | head -10
```

**Rule: if a component exists that does 80% of what you need, use it and pass props.** Only create a new component if nothing in the library is close. When in doubt, use the existing one imperfectly and file a follow-up to extend it.

Common components that are almost always already in the app:
- `<Button variant="...">` — do not create custom button wrappers
- `<Tabs>`, `<CurrentThemeTab>`, `<TabsContent>` — use the canonical tab primitive. **Direct imports of `<TabsList>` or `<TabsTrigger>` outside `components/ui/tabs.tsx` are forbidden** (CLAUDE.md §13 Rule B, enforced by `scripts/src/check-ui-canonical.ts`). Use `<CurrentThemeTab>` for the strip; `<TabsContent>` remains the canonical panel wrapper.
- `<Skeleton>` / `<Loader2>` — loading state
- `<Card>`, `<CardHeader>`, `<CardContent>` — container
- `<Badge>` — status indicators
- `<Tooltip>` — field-level help text
- `<Layout>` — top-level page wrapper with nav

---

## Phase 3 — Build the Page

### Page structure

Follow this structure exactly. Every page in the app uses it.

```tsx
export default function MyPage() {
  // 1. Route params
  // 2. Data fetches (custom hooks or useQuery)
  // 3. Derived state (useMemo)
  // 4. Handlers (useCallback)
  // 5. Loading guard
  // 6. Error guard
  // 7. JSX — Layout > AnimatedPage > content

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState />;

  return (
    <Layout>
      <AnimatedPage>
        <PageHeader ... />
        <Tabs value={tab} onValueChange={setTab}>
          <CurrentThemeTab
            tabs={[{ value: "tab1", label: "Tab 1" }] satisfies CurrentThemeTabItem[]}
            activeTab={tab}
            onTabChange={setTab}
          />
          <TabsContent value="tab1">...</TabsContent>
        </Tabs>
      </AnimatedPage>
    </Layout>
  );
}
```

> **Canonical horizontal tabs (CLAUDE.md §13 Rule B):** `<CurrentThemeTab>` is the only allowed tab strip. It accepts `tabs`/`activeTab`/`onTabChange` plus optional `suffix` / `trailingIcon` / `disabled` + `tooltipTitle` / `responsive: { fallback: "select" }` / `variant: "default" | "drawer"`. Mechanically enforced by `scripts/node_modules/.bin/tsx scripts/src/check-ui-canonical.ts`. For Rule A (canonical "Analyst" CTA) see `.agents/skills/analyst-research-buttons/SKILL.md`.

### Required states — never skip these

Every page MUST handle three states. These are not optional polish; they are table stakes.

| State | When | What to render |
|---|---|---|
| **Loading** | Data fetch in flight | Skeleton cards or `<Loader2>` spinner matching the page layout |
| **Error** | Fetch failed or threw | Error message with retry button; never a blank page |
| **Empty** | Fetch succeeded, data is empty | Friendly empty state with a call-to-action (not just nothing) |

Loading and error guards go ABOVE the return, before JSX. They short-circuit the render.

```tsx
if (isLoading) return (
  <Layout><div className="flex items-center justify-center h-64"><Loader2 className="animate-spin" /></div></Layout>
);
if (isError) return (
  <Layout><div className="p-6 text-destructive">Failed to load data. <Button onClick={() => refetch()}>Retry</Button></div></Layout>
);
```

### Action button discipline

Each button type has exactly one purpose. Never mix them.

| Button | Purpose | What it does NOT do |
|---|---|---|
| **Save** | Persist the user's changes to the database | Does not trigger AI analysis |
| **Analyst / AI** | Trigger AI analysis of the current data | Does not save; requires a prior save |
| **Export** | Generate a download (PDF, Excel, PNG) | Does not save or trigger AI |
| **Refresh** | Re-fetch data or re-run a computation | Does not save |

If your page needs both Save and Analyst, show them as two separate buttons. The Analyst button should be disabled or show a warning if there are unsaved changes.

### Tab URL sync

When a page has tabs, mirror the active tab to the URL via a query param (`?tab=revenue`). This gives users deep links and preserves state on refresh.

```typescript
const search = useSearch();
const params = new URLSearchParams(search);
const activeTab = params.get("tab") ?? "overview";

function setActiveTab(tab: string) {
  history.pushState({}, "", `?tab=${tab}`);
}
```

### Screen real estate

- Use the full page width for data-heavy content. Don't center a narrow column in a wide viewport.
- Cards and sections should align to the same horizontal grid as the rest of the page.
- Avoid excessive vertical whitespace between sections. Match the rhythm of the nearest canonical page.
- Right-align action buttons (Save, Export) in headers and footers. Keep them sticky if the section is long enough to scroll.
- Use `grid` for side-by-side panels, not nested flexbox with magic `w-[49%]`.

### Icons

Use icons from the app's icon set. Do not import from an icon library that isn't already in use.

```tsx
// Check what the app uses first:
grep -r "from.*icons" src/components/ | head -5
// Usually one of: @/components/icons, lucide-react, @/components/icons/themed-icons
```

Always use the themed icon wrappers if the app has them — they apply the correct color and size tokens.

---

## Phase 4 — Quality Gate

Before declaring the page done, complete every item on this checklist. Do not ship until all pass.

### Visual consistency
- [ ] Opened a comparable page in the browser and compared layout rhythm (spacing, column widths, heading sizes)
- [ ] Action buttons are in the same position as on comparable pages
- [ ] Icons are from the app's icon set, not imported from a different library
- [ ] No inline `style=` properties — all styling uses Tailwind classes or design tokens

### State coverage
- [ ] Loading state renders (does not show blank page while data loads)
- [ ] Error state renders with a retry affordance
- [ ] Empty state renders with a call-to-action (not just nothing)

### Data wiring
- [ ] The correct query key / hook is used (search for how similar data is fetched on other pages)
- [ ] Cache invalidation is triggered after any mutation (not just optimistic local state update)
- [ ] No `any` types on API response shapes

### Behavior
- [ ] Active tab is reflected in the URL and survives a refresh
- [ ] Save button is data-only (does not trigger AI)
- [ ] Analyst/AI button requires a prior save (disabled or warns if unsaved changes)
- [ ] Keyboard accessibility: Tab key reaches all interactive elements
- [ ] Console has no errors or warnings when the page loads and while interacting

### Final check
- [ ] Took a screenshot of the finished page
- [ ] Compared screenshot side-by-side against the canonical page identified in Phase 1
- [ ] Differences are intentional and justified, not accidental

---

## Common Mistakes to Avoid

**Creating components that already exist.** Always scan `src/components/` before creating. The most common: custom spinner, custom card wrapper, custom badge — all already exist.

**Hardcoding colors or spacing.** `bg-blue-500` is not a design token. Use the app's color variables (`bg-primary`, `text-muted-foreground`) or Tailwind classes that match the existing palette.

**Skipping loading/empty/error states.** These are never optional. Every production page has them. If the canonical pages you read don't have them, that's a bug in the canonical pages — still add them to your new page.

**Mixing Save and Analyst into one button.** Users need to know what triggered what. Keep them separate.

**Declaring done before opening the browser.** A page that compiles is not a page that works. Always open it, interact with it, and compare it to a sibling page before marking complete.

---

## Related Skills

- `embedded-ai-agent` — when your page needs a chat/analyst panel
- `norfolk-code-review` (Norfolk project) — code review that checks UI consistency
- `ce-frontend-design` — when the page requires significant layout design work
- `ce-julik-frontend-races-reviewer` CE persona — catches race conditions in loading state logic
