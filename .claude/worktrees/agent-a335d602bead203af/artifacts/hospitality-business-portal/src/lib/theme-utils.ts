export function getComputedThemeColor(cssVar: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
  if (!raw) return "hsl(0, 0%, 53%)";
  if (raw.startsWith("#") || raw.startsWith("rgb")) return raw;
  const parts = raw.split(/\s+/).map(Number);
  if (parts.length >= 3) {
    return `hsl(${parts[0]}, ${parts[1]}%, ${parts[2]}%)`;
  }
  return raw;
}
