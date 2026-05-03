/**
 * ThemesTab.tsx — UI color theme management.
 *
 * A thin wrapper that renders the ThemeManager feature component inside
 * the admin panel. ThemeManager provides:
 *   • A list of saved themes (named color palettes)
 *   • Create / edit / delete themes
 *   • Live preview of each theme's primary, secondary, accent, and
 *     background colors
 *   • Assign a theme as the platform default or to specific user groups
 *
 * Themes control CSS custom properties (--primary, --secondary, etc.)
 * at the :root level, enabling instant visual customization without
 * modifying any component code.
 */
import { ThemeManager } from "@/features/design-themes";

export default function ThemesTab() {
  return <ThemeManager />;
}