import { type ThemeColorMap } from "../theme-resolver";
import { BRAND } from "../routes/premium-export-prompts";

export interface PdfTheme {
  primary: string;
  secondary: string;
  accent: string;
  foreground: string;
  border: string;
  muted: string;
  surface: string;
  background: string;
  white: string;
  negativeRed: string;
  chart: string[];
  line: string[];
}

export function themeFromColorMap(tc: ThemeColorMap): PdfTheme {
  const h = (hex: string) => hex.startsWith("#") ? hex : `#${hex}`;
  return {
    primary: h(tc.navy),
    secondary: h(tc.sage),
    accent: h(tc.darkGreen),
    foreground: h(tc.darkText),
    border: h(tc.gray),
    muted: h(tc.altRow),
    surface: h(tc.sectionBg),
    background: h(tc.white),
    white: h(tc.white),
    negativeRed: h(tc.negativeRed),
    chart: tc.chart.map(h),
    line: tc.line.map(h),
  };
}

export function defaultPdfTheme(): PdfTheme {
  return {
    primary: `#${BRAND.PRIMARY_HEX}`,
    secondary: `#${BRAND.SECONDARY_HEX}`,
    accent: `#${BRAND.ACCENT_HEX}`,
    foreground: `#${BRAND.FOREGROUND_HEX}`,
    border: `#${BRAND.BORDER_HEX}`,
    muted: `#${BRAND.SURFACE_HEX}`,
    surface: `#${BRAND.BACKGROUND_HEX}`,
    background: `#${BRAND.WHITE_HEX}`,
    white: `#${BRAND.WHITE_HEX}`,
    negativeRed: `#${BRAND.NEGATIVE_HEX}`,
    chart: [`#${BRAND.ACCENT_HEX}`, `#${BRAND.SECONDARY_HEX}`, `#${BRAND.PRIMARY_HEX}`, `#${BRAND.MUTED_HEX}`],
    line: [`#${BRAND.ACCENT_HEX}`, `#${BRAND.SECONDARY_HEX}`, `#${BRAND.PRIMARY_HEX}`, `#${BRAND.MUTED_HEX}`],
  };
}
