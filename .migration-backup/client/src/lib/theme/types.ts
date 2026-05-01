export interface ThemeColor {
  rank: number;
  name: string;
  hexCode: string;
  description: string;
}

export interface ThemePreset {
  name: string;
  description: string;
  isDefault: boolean;
  colors: ThemeColor[];
}

export type ColorCategory = "PALETTE" | "CHART" | "ACCENT" | "LINE";
