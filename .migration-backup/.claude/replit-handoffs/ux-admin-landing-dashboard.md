# UX-Admin: Admin Landing Dashboard

**Status:** Ready for Replit  
**Supervised by:** Claude Code (review each step before next begins)  
**Scope:** Admin page landing view — the state before any sidebar item is clicked  
**Does NOT touch:** Any individual admin tab/section content, AdminSidebar nav items, route handlers

---

## Context

`client/src/pages/Admin.tsx` currently shows only a `<PageHeader>` when no section is selected. The sidebar has 25+ items across 6+ groups and users must click around blindly to find what they need. The fix: add an admin **dashboard grid** as the landing state — a scannable overview of all admin capabilities with their current health/status.

Key files:
- `client/src/pages/Admin.tsx` — target (landing state logic)
- `client/src/components/ui/stat-card.tsx` — use `variant="dashboard"` for KPI tiles
- `client/src/components/ui/card.tsx` — group section cards
- `client/src/components/ui/badge.tsx` — status indicators
- `client/src/components/admin/AdminSidebar.tsx` — read-only reference for section IDs

**Rule:** All components below are already installed. No `npx shadcn add` needed.

---

## Design Principles (binding for this packet)

1. **Groups as cards.** Each admin sidebar group becomes one `<Card>` with a header row (icon + group name + description) and a list of clickable items inside.
2. **Clickable items navigate.** Clicking any item inside a group card immediately activates that sidebar section — identical to clicking the sidebar item directly.
3. **Status at a glance.** Each item shows its current state via a `<Badge>` (e.g., "Configured", "Not set", "Active", count like "8 users").
4. **No new data fetches in this packet.** Derive all status display from what's already in existing queries (`useGlobalAssumptions`, `useQuery({ queryKey: ["specialists"] })`, etc.). If no data is available, show a neutral "—" badge.
5. **Framer Motion staggered grid.** Cards animate in with 60ms stagger using `variants` + `staggerChildren`. See example below.

---

## Step 1 — Create `AdminLandingDashboard` component

Create a new file: `client/src/components/admin/AdminLandingDashboard.tsx`

This component renders when no admin section is active. It receives a single prop:
```typescript
interface AdminLandingDashboardProps {
  onNavigate: (section: AdminSection) => void;
}
```

**Group structure** (6 groups, each as a Card):

```
Group 1 — Steady State Defaults
  Items: App Defaults (model-defaults), Management Company Defaults (defaults-management-company),
         Property Defaults (defaults-property), Market & Macro (defaults-market-macro), Constants (constants)
  Icon: IconSliders
  Description: "Seed values, model constants, and financial defaults for new entities"

Group 2 — Users & Operations
  Items: Users (users), Scenarios (scenarios), Notifications (notifications), Sidebar Visibility (sidebar-visibility)
  Icon: IconPeople
  Description: "User accounts, scenario management, and operational settings"

Group 3 — Brand & Appearance
  Items: Brand (brand)
  Icon: IconPalette
  Description: "Themes, logos, and company identity"

Group 4 — Intelligence & Research
  Items: Hospitality Benchmarks (benchmarks), Reference Ranges (reference-ranges),
         Data Sources (data-sources), Pipeline Config (pipeline-config),
         QA Sandbox (qa-sandbox), Scheduled Research (scheduled-research)
  Icon: IconBrain
  Description: "Market data, benchmarks, and AI research pipeline configuration"

Group 5 — Specialist Observation
  Items: Required Fields (required-fields) — summary link only; individual specialists are in AI Intelligence
  Icon: IconBot
  Description: "Read-only health and required-fields view for The Analyst's Specialists"

Group 6 — System Health
  Items: Verification (verification), Database (database), Observability (observability), Activity (activity)
  Icon: IconShield
  Description: "Audit, database health, and system monitoring"
```

**Status badge logic** (simple, no new fetches):
- Show `<Badge variant="outline">→</Badge>` as a "navigate" affordance on every item. Keep it minimal — this is a navigation dashboard, not a data dashboard.
- Add a subtle item count or state badge ONLY when it's already available from a parent query:
  - Users group: if `useQuery({ queryKey: ["users"] })` data is available in context, show "N users". Otherwise skip.
  - Verification group: show "UNQUALIFIED" in green or "⚠ Review" in amber if the verification state is in context.

If the query isn't available, just render the item name + description without a status badge. **No new API calls from this component.**

**Layout:**
```tsx
// 3-column grid on desktop, 1-column on mobile
<div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
  {groups.map(group => (
    <AdminGroupCard key={group.id} group={group} onNavigate={onNavigate} />
  ))}
</div>
```

**Framer Motion stagger:**
```tsx
import { motion } from "framer-motion";

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};
const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.2, ease: "easeOut" } },
};

// Wrap the grid:
<motion.div variants={containerVariants} initial="hidden" animate="show"
            className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
  {groups.map(group => (
    <motion.div key={group.id} variants={cardVariants}>
      <AdminGroupCard group={group} onNavigate={onNavigate} />
    </motion.div>
  ))}
</motion.div>
```

**`AdminGroupCard` inner structure:**
```tsx
<Card className="bg-card/80 border-primary/10 hover:border-primary/20 transition-colors h-full">
  <CardHeader className="pb-3">
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
        <GroupIcon className="w-4 h-4 text-primary" />
      </div>
      <div>
        <CardTitle className="text-sm font-semibold">{group.title}</CardTitle>
      </div>
    </div>
    <CardDescription className="text-xs">{group.description}</CardDescription>
  </CardHeader>
  <CardContent className="pt-0">
    <div className="space-y-1">
      {group.items.map(item => (
        <button
          key={item.section}
          onClick={() => onNavigate(item.section)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-md text-sm hover:bg-muted/60 text-left transition-colors group"
          data-testid={`admin-landing-item-${item.section}`}
        >
          <span className="text-foreground/80 group-hover:text-foreground">{item.label}</span>
          <div className="flex items-center gap-1.5">
            {item.badge && <Badge variant="outline" className="text-xs">{item.badge}</Badge>}
            <ChevronRight className="w-3 h-3 text-muted-foreground/40 group-hover:text-muted-foreground" />
          </div>
        </button>
      ))}
    </div>
  </CardContent>
</Card>
```

### Acceptance criteria
- [ ] File created at `client/src/components/admin/AdminLandingDashboard.tsx`
- [ ] 6 group cards rendered in 3-column grid
- [ ] Clicking any item fires `onNavigate(section)` with the correct section value
- [ ] Framer Motion stagger animation (200ms, 60ms between cards)
- [ ] `data-testid="admin-landing-item-{section}"` on every item button
- [ ] No new API calls from this component
- [ ] `npx tsc --noEmit` clean

---

## Step 2 — Wire the dashboard into Admin.tsx

In `client/src/pages/Admin.tsx`, find the section that renders when `activeSection` is null/undefined (the "no section selected" state). It currently renders just the `<PageHeader>`.

**Add a header intro banner and the dashboard grid:**

```tsx
// Find where adminContent is returned when no section is active
// (currently just renders the PageHeader + nothing else)
// Replace with:

if (!activeSection) {
  return (
    <Layout>
      <AnimatedPage>
        <div className="p-6 max-w-6xl mx-auto">
          <div className="mb-8">
            <h1 className="text-2xl font-bold font-display text-foreground">Admin</h1>
            <p className="text-muted-foreground mt-1">
              Configure app settings, intelligence pipelines, users, and system health.
            </p>
          </div>
          <AdminLandingDashboard onNavigate={setActiveSection} />
        </div>
      </AnimatedPage>
    </Layout>
  );
}
```

Import the new component at the top of `Admin.tsx`.

### Acceptance criteria
- [ ] Landing dashboard visible when navigating to `/admin` with no section selected
- [ ] Dashboard replaces the blank state (previously just the PageHeader)
- [ ] Clicking any group-card item navigates to that section (sidebar item highlights)
- [ ] Existing sidebar navigation still works independently
- [ ] No TS errors

---

## Step 3 — Page header when a section IS active (cleanup)

Currently the page header shows a title and subtitle but no breadcrumb back to the landing. Add a small breadcrumb link:

```tsx
// In the section-active render path, add above <PageHeader>:
<div className="px-6 pt-4">
  <button
    onClick={() => setActiveSection(undefined)}
    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
    data-testid="admin-back-to-landing"
  >
    <ChevronLeft className="w-3 h-3" /> Admin overview
  </button>
</div>
```

This gives users a clear way back to the dashboard from any section without using the sidebar.

### Acceptance criteria
- [ ] "← Admin overview" breadcrumb visible above every section's page header
- [ ] Clicking it returns to the landing dashboard
- [ ] Does not appear when already on the landing (no activeSection)

---

## Verification

After all 3 steps:

```bash
npx tsc --noEmit          # 0 errors
npm run lint              # 0 errors  
npm run test:file -- tests/audit/vocabulary-compliance.test.ts   # 11/11
npm run test:summary      # all pass
npm run verify:summary    # UNQUALIFIED
```

**Manual browser check:**
1. Navigate to `/admin` — landing dashboard grid visible, 6 group cards in 3-col grid
2. Cards animate in with stagger
3. Click any item → navigates to that section, sidebar highlights
4. "← Admin overview" breadcrumb visible in section view
5. Click breadcrumb → returns to landing grid

**Commit message:**
```
ux-admin: add landing dashboard grid (6 groups, 3-col, Framer Motion stagger)

Replaces the blank /admin landing with a scannable grid of all admin
capability groups. Each group is a Card with clickable items that
navigate to the corresponding sidebar section. No new API calls; status
badges use existing in-context data only.

Surfaces: S-admin-ui
```

---

## CC Review Gate

CC reviews before Replit starts the AI Intelligence packet. Send the commit SHA and screenshots to confirm:
1. All 6 groups render with correct items
2. Navigation from cards matches sidebar navigation
3. Breadcrumb works
4. Animation is smooth (200ms, no jank)
