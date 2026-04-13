---
name: tour
description: Interactive guided tour/walkthrough for new users. Covers step-by-step feature highlights and workflow order. Use when modifying tour steps or onboarding flow.
---

# Guided Tour / Walkthrough

## Purpose
Interactive step-by-step tour for new users. Highlights key features and explains the recommended workflow order.

## File Map
| File | Purpose |
|------|---------|
| `client/src/components/GuidedWalkthrough.tsx` | Full component: Zustand store, steps, overlay, tooltip, prompt dialog |

## Zustand Store (`useWalkthroughStore`)
Persisted via `walkthrough-store` localStorage key.

| Field | Type | Purpose |
|-------|------|---------|
| `shownThisSession` | `boolean` | Prevents auto-prompt more than once per session |
| `tourActive` | `boolean` | True while step-by-step tour is running |
| `promptVisible` | `boolean` | True while "Would you like a tour?" dialog is open |

Setters: `setShownThisSession`, `setTourActive`, `setPromptVisible`.

## Tour Steps (9 total)
| # | Title | Target Selector | Description |
|---|-------|----------------|-------------|
| 0 | Welcome! | `[href="/"]` | Dashboard overview |
| 1 | Define Your Properties | `[href="/portfolio"]` | Add properties, fill assumptions |
| 2 | Management Company | `[href="/company"]` | Staffing, compensation, fees |
| 3 | Systemwide Assumptions | `[href="/settings"]` | Taxes, inflation, depreciation |
| 4 | Save & Compare Scenarios | `[href="/scenarios"]` | Create/compare strategy models |
| 5 | Analysis Tools | `[href="/analysis"]` | Sensitivity, executive summary, timelines |
| 6 | User Manual & Help | `[href="/help"]` | Documentation and Checker Manual |
| 7 | Quick Navigation | `[data-testid="button-search"]` | Ctrl+K search |
| 8 | Stay Informed | `[data-testid="button-notifications"]` | Alerts and verification results |

## API Endpoint
- **`PATCH /api/profile/tour-prompt`** — Body: `{ hide: boolean }` — persists "Do not show again" preference on the user's `hideTourPrompt` field.

## Key Constants
- **Auto-start delay:** 800ms after page load
- **Spotlight padding:** 6px
- **Z-index stack:** Tooltip=9999, Overlay=9998, Backdrop=9997
- **Missing target:** Auto-skips to next step (handles conditional nav items)

## Interaction with Rebecca Chat
Both `tourActive` and `promptVisible` must be `false` for the Rebecca chat panel to appear.

## How to Restart
Users can restart the tour from the Help page → Guided Tour tab.

## How to Add a Step
1. Add entry to `getTourSteps()` array in `GuidedWalkthrough.tsx`
2. Provide `title`, `content`, and `selector` (CSS attribute selector targeting a DOM element)
3. Test that the target element exists for all user roles (or the step auto-skips)
