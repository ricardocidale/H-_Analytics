---
name: device-testing-checklist
description: Verification checklist for mobile and tablet testing across iPhone SE, iPhone 14, iPad Mini, and iPad Pro.
---

# Device Testing Checklist

## Purpose
Step-by-step checklist for verifying responsive design across all target devices. Use this after making any mobile/tablet responsive changes to ensure nothing is broken.

## Target Devices

### Phone Targets
| Device | Viewport | Key Concern |
|--------|----------|-------------|
| iPhone SE | 375×667 | Smallest width — everything must fit |
| iPhone 14 | 390×844 | Common size — primary testing target |
| iPhone 14 Pro Max | 430×932 | Largest phone — hits `sm:` breakpoint edge |

### Tablet Targets
| Device | Portrait | Landscape | Key Concern |
|--------|----------|-----------|-------------|
| iPad Mini | 768×1024 | 1024×768 | Hits `md:` exactly — sidebar behavior |
| iPad Air | 820×1180 | 1180×820 | Most common tablet |
| iPad Pro 11" | 834×1194 | 1194×834 | Sidebar + content must coexist |
| iPad Pro 12.9" | 1024×1366 | 1366×1024 | Near-desktop — `lg:` / `xl:` |

## Per-Page Checklist

### Dashboard
- [ ] Hero IRR gauge renders at correct size (128px mobile, 200px desktop)
- [ ] Property IRR bar chart has explicit height (220px), not collapsed
- [ ] Investment bar chart has explicit height (220px), not collapsed
- [ ] KPI cards (Equity Multiple, Cash-on-Cash, Equity, Exit) show 2×2 grid on mobile
- [ ] KPI card text doesn't overflow — values truncated with `truncate`
- [ ] Portfolio Summary cards stack properly
- [ ] Income/Cash Flow chart containers have explicit heights
- [ ] Financial tables scroll horizontally on small screens
- [ ] Tab bar is scrollable on mobile, all tabs accessible

### PropertyDetail
- [ ] Hero image height reduces (180px mobile vs 280px desktop)
- [ ] Property name doesn't overflow
- [ ] Location/rooms/status metadata wraps on mobile
- [ ] Action buttons (Map, Assumptions) wrap if needed
- [ ] KPIGrid shows 2 columns on mobile
- [ ] Chart cards have reduced padding and explicit heights
- [ ] Financial tables scroll horizontally

### Portfolio
- [ ] Property cards show 1 column on mobile, 2 on tablet, 3 on desktop
- [ ] Add Property dialog fits within viewport with scrolling
- [ ] Search/filter bar wraps on mobile
- [ ] Card images render at proper aspect ratio

### Settings / PropertyEdit
- [ ] Form fields stack to 1 column on mobile
- [ ] Percentage input fields are usable (not too narrow)
- [ ] Section headers readable
- [ ] Tab bar scrollable

### Company & Financial Pages
- [ ] Financial statement tables have horizontal scroll
- [ ] Year column headers remain readable
- [ ] Chart containers have explicit heights
- [ ] KPI summary rows don't overflow

### Admin
- [ ] Entity cards stack on mobile
- [ ] Table rows are scrollable horizontally
- [ ] Dialog modals fit within viewport
- [ ] Tab navigation accessible

### Login
- [ ] Login card has adequate padding (not too much on mobile)
- [ ] Logo/title sized appropriately
- [ ] Form inputs fill available width
- [ ] Button is full-width on mobile

### Profile
- [ ] Content container has appropriate padding
- [ ] Avatar section doesn't overflow
- [ ] Form fields are full-width

## Cross-Cutting Checks
- [ ] No horizontal scroll on page body (only within scroll containers)
- [ ] All text is readable (minimum 10px, prefer 12px+)
- [ ] Touch targets are at least 44×44px
- [ ] Charts render with correct height (not 0px)
- [ ] Rounded corners not oversized on mobile
- [ ] Cards have `overflow-hidden` when using absolute positioned children
- [ ] Sidebar collapses properly on phone, shows icons on tablet
- [ ] Dialogs/modals have `max-h-[85vh] overflow-y-auto`

## How to Test
1. Use browser DevTools → Device Toolbar
2. Select iPhone SE (375px) first — if it works here, larger phones will be fine
3. Check iPad Mini portrait (768px) — this is the `md:` breakpoint edge
4. Check iPad landscape (1024px) — this is the `lg:` breakpoint
5. Resize slowly from 320px to 1400px and watch for layout jumps

## Key Files
- `client/src/pages/Dashboard.tsx` — Most complex responsive page (hero, charts, KPIs, tables)
- `client/src/components/graphics/KPIGrid.tsx` — Reference responsive component
- `client/src/components/Layout.tsx` — Sidebar collapse and mobile menu
- `client/src/hooks/use-mobile.tsx` — Mobile detection hook (768px)

## Related Rules
- `rules/design-standards.md` — Every page must be graphics-rich on all devices

## Examples

### Quick Phone Check
1. Open DevTools → Device Toolbar → iPhone SE (375px)
2. Navigate to Dashboard — verify IRR gauge, charts, KPI cards render
3. Navigate to PropertyDetail — verify hero image, charts, tables
4. Navigate to Settings — verify form fields stack properly

### Quick Tablet Check
1. Switch to iPad Mini portrait (768px) — verify sidebar collapses to icons
2. Navigate to Company — verify financial tables scroll horizontally
3. Switch to iPad landscape (1024px) — verify sidebar expands with labels

## Common Failures & Root Causes
| Symptom | Root Cause | Fix |
|---------|-----------|-----|
| Chart shows as 0px height | `ResponsiveContainer height="100%"` with flex parent | Use explicit `height={220}` |
| Card text overflows border | Missing `overflow-hidden` on card | Add `overflow-hidden` to card container |
| Horizontal page scroll | Element with fixed width > viewport | Use `max-w-full` or responsive width |
| Buttons wrap oddly | Missing `flex-wrap` on button container | Add `flex-wrap` to parent |
| Grid columns too narrow | Too many `grid-cols` for viewport | Use breakpoint-based grid: `grid-cols-2 lg:grid-cols-4` |
| Sidebar overlaps content | Layout missing proper margin | Check `Layout.tsx` padding logic |
