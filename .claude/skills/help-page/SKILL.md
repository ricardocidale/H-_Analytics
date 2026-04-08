---
name: help-page
description: Unified help page at /help with tabbed navigation. Consolidates User Manual, Checker Manual, and Guided Tour. Use when modifying help content or navigation.
---

# Help Page

## Purpose
Unified help page at `/help` with tabbed navigation. Consolidates User Manual, Checker Manual, and Guided Tour into one location.

## File Map
| File | Purpose |
|------|---------|
| `client/src/pages/Help.tsx` | Page component with 3 tabs |

## Tab Structure
| Tab | Visible To | Default | Content |
|-----|-----------|---------|---------|
| User Manual | All users | Yes | Embeds `UserManualPage` from `user-manual/index.tsx` |
| Checker Manual | Checker + Admin only | No | Embeds `CheckerManualPage` from `checker-manual/index.tsx` |
| Guided Tour | All users | No | Tour description + "Start Tour" button + "Do not show again" toggle |

## Role Gating
- `isAdmin` or user role includes "checker" → shows Checker Manual tab
- All authenticated users → see User Manual and Guided Tour tabs

## Guided Tour Tab
- "Start Tour" button calls `setTourActive(true)` from `useWalkthroughStore`
- "Do not show again" toggle calls `PATCH /api/profile/tour-prompt` with `{ hide: boolean }`
- Reads current preference from user's `hideTourPrompt` field

## Route
- `/help` — main route
- `/methodology` — redirects to `/help` (legacy route)

## Related Skills
- `tour/SKILL.md` — Guided Walkthrough details
- `.claude/manuals/user-manual/SKILL.md` — User Manual section map
- `.claude/manuals/checker-manual/SKILL.md` — Checker Manual section map
