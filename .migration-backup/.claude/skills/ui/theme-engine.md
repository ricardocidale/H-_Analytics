---
name: theme-engine
description: Multi-theme system with user-created themes. All UI components reference this engine. Use when building, switching, or creating themes.
---

# Theme Engine

## Purpose
Centralized theme system supporting built-in and user-created themes. Every UI component pulls its styling from the active theme rather than hardcoding colors.

## Built-in Themes

### 1. Dark Glass (default for dashboards, sidebar, tabs)
- Base: `#0a0a0f` (midnight)
- Accent: `#9FBCA4` (sage green)
- Secondary: `#257D41` (forest green)
- Text: `#FFF9F5` (cream)
- Glass: `white/8` overlays with `backdrop-blur-xl`
- Borders: `accent/20` glow lines

### 2. Light Cream (default for assumptions, research, discovery)
- Base: `#FFF9F5` (cream)
- Accent: `#9FBCA4` (sage green)
- Secondary: `#257D41` (forest green)
- Text: `#3D3D3D` (foreground)
- Cards: `white/95` with subtle shadows
- Borders: `border` token from CSS vars

### 3. Teal Header (page headers)
- Gradient: `#2d4a5e` → `#3d5a6a` → `#3a5a5e`
- Text: white
- Badge: `white/10` glass pill

## Theme Token Structure
Every theme defines these tokens:
```typescript
interface ThemeTokens {
  name: string;
  base: string;
  accent: string;
  secondary: string;
  text: string;
  textMuted: string;
  card: string;
  cardBorder: string;
  glass: string;
  glassBorder: string;
  destructive: string;
  chart: [string, string, string, string, string];
  headerGradient: [string, string, string];
  fontHeading: string;
  fontBody: string;
}
```

## Storage
- Built-in themes: `client/src/lib/themes.ts` (static)
- Design themes: Database table `design_themes` (id, name, description, colors JSON, isDefault, createdAt, updatedAt)
- Themes are standalone entities (not user-owned), assigned to User Groups
- Active theme: resolved from user's User Group → default theme fallback
- See `.claude/skills/architecture/multi-tenancy.md` for full branding architecture

## Applying Themes
- Theme tokens map to CSS custom properties on `:root`
- `ThemeProvider` component wraps app and sets CSS vars on mount/change
- Components use CSS var tokens (`bg-[hsl(var(--primary))]`) — never raw hex
- Dark mode is a theme variant, not a separate toggle

## Theme Management (Admin)
- Admin page has "Themes" tab for standalone CRUD
- Admin creates/edits themes with name, description, and color definitions
- At least one default theme always exists and cannot be deleted
- Themes are assigned to User Groups (not individual users)
- Users inherit their theme from their assigned User Group

## Component Theme Reference
Every UI skill specifies which theme context it uses:
- `dark-glass` → sidebar, tabs, command palette, notifications
- `light-cream` → content areas, assumptions, research pages
- `teal-header` → page headers
- `inherit` → uses parent container's theme context
