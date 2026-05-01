import type { ThemeColor } from "./types";
import { hexToHslString, hexToRgbString, contrastHsl } from "./color-utils";

export const MANAGED_CSS_VARS = [
  "--primary", "--primary-foreground", "--primary-rgb",
  "--secondary", "--secondary-foreground",
  "--background", "--card", "--card-foreground",
  "--popover", "--popover-foreground",
  "--foreground",
  "--muted", "--muted-foreground",
  "--accent", "--accent-foreground",
  "--accent-pop", "--accent-pop-foreground",
  "--accent-pop-2", "--accent-pop-2-foreground",
  "--border", "--input", "--ring",
  "--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5",
  "--line-1", "--line-2", "--line-3", "--line-4", "--line-5",
  "--sidebar-primary", "--sidebar-primary-foreground",
  "--sidebar-accent", "--sidebar-border", "--sidebar-ring",
];

function filterAndSort(colors: ThemeColor[], prefix: string): ThemeColor[] {
  return colors
    .filter(c => c.description?.startsWith(`${prefix}:`))
    .sort((a, b) => a.rank - b.rank);
}

export function applyThemeColors(
  colors: ThemeColor[],
  root: HTMLElement = document.documentElement,
): void {
  root.classList.remove("theme-indigo-blue");

  const palette = filterAndSort(colors, "PALETTE");
  const charts = filterAndSort(colors, "CHART");
  const accents = filterAndSort(colors, "ACCENT");
  const lines = filterAndSort(colors, "LINE");

  const set = (name: string, hsl: string) =>
    root.style.setProperty(name, hsl);

  const p1 = palette.find(c => c.rank === 1);
  if (p1) {
    const hsl = hexToHslString(p1.hexCode);
    const fg = contrastHsl(p1.hexCode);
    set("--primary", hsl);
    set("--primary-foreground", fg);
    set("--primary-rgb", hexToRgbString(p1.hexCode));
    set("--accent", hsl);
    set("--accent-foreground", fg);
    set("--ring", hsl);
  }

  const p2 = palette.find(c => c.rank === 2);
  if (p2) {
    set("--secondary", hexToHslString(p2.hexCode));
    set("--secondary-foreground", contrastHsl(p2.hexCode));
  }

  const p3 = palette.find(c => c.rank === 3);
  if (p3) {
    const hsl = hexToHslString(p3.hexCode);
    set("--background", hsl);
    set("--card", hsl);
    set("--popover", "0 0% 100%");
  }

  const p4 = palette.find(c => c.rank === 4);
  if (p4) {
    const hsl = hexToHslString(p4.hexCode);
    set("--foreground", hsl);
    set("--card-foreground", hsl);
    set("--popover-foreground", hsl);
  }

  const p5 = palette.find(c => c.rank === 5);
  if (p5) {
    set("--muted", hexToHslString(p5.hexCode));
    set("--muted-foreground", "0 0% 40%");
  }

  const p6 = palette.find(c => c.rank === 6);
  if (p6) {
    const hsl = hexToHslString(p6.hexCode);
    set("--border", hsl);
    set("--input", hsl);
  }

  const ac1 = accents.find(c => c.rank === 1);
  if (ac1) {
    set("--accent-pop", hexToHslString(ac1.hexCode));
    set("--accent-pop-foreground", contrastHsl(ac1.hexCode));
  }

  const ac2 = accents.find(c => c.rank === 2);
  if (ac2) {
    set("--accent-pop-2", hexToHslString(ac2.hexCode));
    set("--accent-pop-2-foreground", contrastHsl(ac2.hexCode));
  }

  charts.forEach((c, i) => {
    if (i < 5) set(`--chart-${i + 1}`, hexToHslString(c.hexCode));
  });

  lines.forEach((c, i) => {
    if (i < 5) set(`--line-${i + 1}`, hexToHslString(c.hexCode));
  });

  if (p1) {
    const hsl = hexToHslString(p1.hexCode);
    set("--sidebar-primary", hsl);
    set("--sidebar-primary-foreground", contrastHsl(p1.hexCode));
    set("--sidebar-ring", hsl);
  }
  if (p6) {
    set("--sidebar-border", hexToHslString(p6.hexCode));
  }
  if (p5) {
    set("--sidebar-accent", hexToHslString(p5.hexCode));
  }
}

export function resetThemeColors(
  root: HTMLElement = document.documentElement,
): void {
  root.classList.remove("theme-indigo-blue");
  MANAGED_CSS_VARS.forEach(v => root.style.removeProperty(v));
}
