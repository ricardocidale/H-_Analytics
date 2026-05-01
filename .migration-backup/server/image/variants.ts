import type { FitEnum } from "sharp";

export interface VariantSpec {
  name: string;
  width: number;
  height: number | null;
  quality: number;
  fit: keyof FitEnum;
}

export const IMAGE_VARIANTS: VariantSpec[] = [
  { name: "thumb", width: 400, height: 300, quality: 70, fit: "cover" },
  { name: "card", width: 800, height: 600, quality: 80, fit: "cover" },
  { name: "hero", width: 1600, height: 1000, quality: 85, fit: "cover" },
  { name: "full", width: 2400, height: null, quality: 90, fit: "inside" },
];

export type VariantName = "thumb" | "card" | "hero" | "full" | "original";

export interface ImageVariants {
  thumb?: string;
  card?: string;
  hero?: string;
  full?: string;
  original?: string;
}

export function buildVariantPath(
  propertyId: number,
  photoId: number,
  variant: string,
  format: string,
): string {
  return `photos/${propertyId}/${photoId}/${variant}.${format}`;
}

export function buildOriginalPath(
  propertyId: number,
  photoId: number,
  extension: string,
): string {
  return `photos/${propertyId}/${photoId}/original.${extension}`;
}
