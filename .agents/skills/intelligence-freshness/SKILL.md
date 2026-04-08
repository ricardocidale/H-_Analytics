---
name: intelligence-freshness
description: Intelligence freshness lifecycle for H+ Analytics — staleness detection triggers, auto-refresh guard logic, computeFreshnessStatus semantics, IntelligenceStatusBar states, freshness API contract, sidebar badge pattern. Use when building, modifying, or debugging the freshness system, status bar, or research staleness detection.
---

# Intelligence Freshness System

## Purpose & Scope

The freshness system tracks how current AI research intelligence is for each property. It detects when research becomes stale (due to age or assumption changes), signals the status to users and admins, and optionally triggers auto-refresh when the estimated regeneration time is short.

---

## Architecture

### State Machine

```
                     ┌──────────┐
          ┌──────────│ MISSING  │◄────── No research exists
          │          └────┬─────┘
          │               │ Research runs
          │               ▼
          │          ┌──────────┐
  Refresh │          │ RUNNING  │◄────── isGenerating = true
          │          └────┬─────┘
          │               │ Complete
          │               ▼
          │          ┌──────────┐
          └──────────│ CURRENT  │◄────── Fresh, within threshold
                     └────┬─────┘
                          │ Age > threshold OR assumption changed
                          ▼
                     ┌──────────┐
                     │  STALE   │──────► Needs refresh
                     └──────────┘
```

### File Map

| Component | File | Purpose |
|-----------|------|---------|
| `computeFreshnessStatus` | `client/src/components/intelligence/IntelligenceStatusBar.tsx` | Pure function: computes status from timestamps |
| `IntelligenceStatusBar` | Same file | UI bar showing status + regenerate button |
| Sidebar badge | `client/src/components/admin/AdminSidebar.tsx` | Portfolio-level freshness count badge |
| Freshness counts API | `server/routes/admin/intelligence.ts` | `GET /api/admin/intelligence/freshness-counts` |
| Average duration API | `server/routes/admin/intelligence.ts` | `GET /api/admin/intelligence/avg-duration` |

---

## computeFreshnessStatus

The core pure function that determines freshness state:

```typescript
type FreshnessStatus = "current" | "stale" | "missing" | "running";

function computeFreshnessStatus(opts: {
  researchUpdatedAt: string | Date | null | undefined;
  lastAssumptionChangeAt: string | Date | null | undefined;
  isGenerating: boolean;
}): { status: FreshnessStatus; reason: string; daysAgo: number | null }
```

### Decision Logic (in priority order)

1. **`isGenerating === true`** → `"running"` — Research is actively being generated
2. **`researchUpdatedAt` is null** → `"missing"` — No research has ever been run
3. **`lastAssumptionChangeAt > researchUpdatedAt`** → `"stale"` — Assumptions changed since last research
4. **`daysAgo > STALE_THRESHOLD_DAYS` (7)** → `"stale"` — Research aged past threshold
5. **Otherwise** → `"current"` — All good

### Staleness Triggers (Assumption Changes)

When any of these property fields change, the system updates `lastAssumptionChangeAt`, which causes `computeFreshnessStatus` to return `"stale"`:

| Field | Why It Invalidates Research |
|-------|----------------------------|
| `starRating` | Changes the comparable tier entirely |
| `businessModel` | Hotel/Lodge/VRBO have different benchmarks |
| `hospitalityType` | Boutique vs Resort vs Extended Stay comp sets |
| `roomCount` | Scale affects operating ratios |
| `city` / `stateProvince` / `country` | Market-level data is location-specific |
| `startAdr` | Significant rate changes may shift comp tier |
| `revShareFB` / `revShareEvents` | Alters operating expense benchmarks |

---

## IntelligenceStatusBar States

| Status | Color | Icon | Label | Action |
|--------|-------|------|-------|--------|
| `current` | Emerald (green) | `IconCheckCircle` | "Current" | None (bar is informational) |
| `stale` | Amber | `IconClock` | "Stale" | Shows "Regenerate" button |
| `missing` | Red | `IconAlertTriangle` | "Missing" | Shows "Regenerate" button |
| `running` | Blue | `Loader2` (spinning) | "Running" | None (animation indicates progress) |

### Status Bar Props

```typescript
interface IntelligenceStatusBarProps {
  researchUpdatedAt: string | Date | null | undefined;
  lastAssumptionChangeAt: string | Date | null | undefined;
  isGenerating: boolean;
  onRunResearch: () => void;
  className?: string;
}
```

### Usage

```tsx
<IntelligenceStatusBar
  researchUpdatedAt={property.researchUpdatedAt}
  lastAssumptionChangeAt={property.updatedAt}
  isGenerating={isResearchRunning}
  onRunResearch={handleRunResearch}
  data-testid="intelligence-status-bar"
/>
```

---

## API Contract

### GET /api/admin/intelligence/freshness-counts

Returns portfolio-wide freshness aggregation:

```typescript
interface FreshnessCounts {
  total: number;     // Total property count
  current: number;   // Properties with current research
  stale: number;     // Properties with stale research
  missing: number;   // Properties with no research
  running: number;   // Properties with active research
}
```

Polled every 60 seconds by the admin sidebar.

### GET /api/admin/intelligence/avg-duration

Returns average research generation time across the portfolio. Used to determine whether auto-refresh is viable (< 30s threshold).

---

## Sidebar Badge Pattern

The admin sidebar displays a freshness count badge next to the "Intelligence Engine" group label:

```tsx
{freshnessCounts && (freshnessCounts.stale > 0 || freshnessCounts.missing > 0) && (
  <span className={cn(
    "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold",
    freshnessCounts.missing > 0
      ? "bg-red-500/15 text-red-600 dark:text-red-400"
      : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
  )}>
    {freshnessCounts.stale + freshnessCounts.missing}
  </span>
)}
```

**Color priority**: Red if any properties have missing research, amber if only stale.

---

## Auto-Refresh Guard Logic

When a key assumption changes:

1. System updates `lastAssumptionChangeAt` on the property
2. `computeFreshnessStatus` returns `"stale"`
3. System checks average research duration via `/api/admin/intelligence/avg-duration`
4. **If estimated time < 30 seconds**: Auto-regenerate research in the background
5. **If estimated time >= 30 seconds**: Surface the stale status to the admin for manual action

This prevents long-running research jobs from blocking the user's editing workflow.

---

## Configuration

| Parameter | Default | Location |
|-----------|---------|----------|
| `STALE_THRESHOLD_DAYS` | 7 | `IntelligenceStatusBar.tsx` (constant) |
| Auto-refresh time threshold | 30 seconds | Server-side guard logic |
| Sidebar poll interval | 60 seconds | `AdminSidebar.tsx` `refetchInterval` |

---

## Design Patterns

### Color Consistency

The freshness color scheme must be consistent across all surfaces:

| State | Color | Used In |
|-------|-------|---------|
| Current | Green (emerald) | Status bar, documentation, tour |
| Stale | Amber | Status bar, sidebar badge, documentation |
| Missing | Red | Status bar, sidebar badge, documentation |
| Running | Blue | Status bar, documentation |

### Testing

- `data-testid="intelligence-status-bar"` on the bar container
- `data-status={status}` attribute for state verification
- `data-testid="status-label"` on the label text
- `data-testid="button-regenerate-research"` on the regenerate button
- `data-testid="intelligence-freshness-badge"` on the sidebar badge

---

## Portability Notes

This freshness pattern is reusable for any AI-powered intelligence system:

1. **computeFreshnessStatus** is a pure function — extract and reuse with any timestamp-based freshness model
2. **Status bar component** is generic — swap icons/colors for any domain
3. **Sidebar badge** pattern works for any aggregate health indicator
4. **Auto-refresh guard** applies to any background computation with variable duration
5. **Staleness trigger list** is domain-specific but the pattern (field change → timestamp update → recompute) is universal
