import { type PdfTheme } from "./theme";
import type { DesignTokens } from "../report/types";

export const MM_TO_PT = 2.83465;
export const PAGE_LANDSCAPE: [number, number] = [406.4 * MM_TO_PT, 228.6 * MM_TO_PT];
export const PAGE_PORTRAIT: [number, number] = [215.9 * MM_TO_PT, 279.4 * MM_TO_PT];

export function tokensToTheme(t: DesignTokens): PdfTheme {
  return {
    primary: t.primary,
    secondary: t.secondary,
    accent: t.accent,
    foreground: t.foreground,
    border: t.border,
    muted: t.muted,
    surface: t.surface,
    background: t.background,
    white: t.white,
    negativeRed: t.negativeRed,
    chart: t.chart,
    line: t.line,
  };
}
