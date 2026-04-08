import maplibregl from "maplibre-gl";
import { PropertyStatus } from "@shared/constants";
import { getComputedThemeColor } from "./theme-utils";

const KNOWN_COORDS: Record<string, [number, number]> = {
  "medellín, antioquia, colombia": [-75.6266, 6.2553],
  "medellin, antioquia, colombia": [-75.6266, 6.2553],
  "loch sheldrake, new york, united states": [-74.6571, 41.7701],
  "highmount, new york, united states": [-74.5025, 42.1363],
  "eden, utah, united states": [-111.8013, 41.3027],
  "huntsville, utah, united states": [-111.8007, 41.2687],
  "cartagena, bolívar, colombia": [-75.5465, 10.4235],
  "cartagena, bolivar, colombia": [-75.5465, 10.4235],
};

const REGION_COORDS: Record<string, [number, number]> = {
  "colombia": [-74.0, 4.6],
  "united states": [-98.5, 39.8],
  "mexico": [-102.5, 23.6],
  "costa rica": [-84.0, 9.9],
  "brazil": [-51.9, -14.2],
  "argentina": [-63.6, -38.4],
  "peru": [-75.0, -9.2],
  "chile": [-71.5, -35.7],
  "panama": [-80.0, 8.5],
  "dominican republic": [-70.2, 18.7],
  "jamaica": [-77.3, 18.1],
  "puerto rico": [-66.1, 18.2],
  "canada": [-106.3, 56.1],
  "united kingdom": [-3.4, 55.4],
  "spain": [-3.7, 40.5],
  "france": [-2.2, 46.6],
  "italy": [12.6, 41.9],
  "germany": [10.5, 51.2],
  "portugal": [-8.2, 39.4],
  "greece": [21.8, 39.1],
  "australia": [133.8, -25.3],
};

export function resolveCoords(property: any): [number, number] | null {
  if (property.latitude != null && property.longitude != null) {
    return [property.longitude, property.latitude];
  }

  const city = (property.city || "").toLowerCase().trim();
  const state = (property.stateProvince || "").toLowerCase().trim();
  const country = (property.country || "").toLowerCase().trim();

  if (!country) return null;

  const fullKey = [city, state, country].filter(Boolean).join(", ");
  if (KNOWN_COORDS[fullKey]) return KNOWN_COORDS[fullKey];

  const cityCountryKey = [city, country].filter(Boolean).join(", ");
  if (KNOWN_COORDS[cityCountryKey]) return KNOWN_COORDS[cityCountryKey];

  if (REGION_COORDS[country]) {
    const base = REGION_COORDS[country];
    const hash = fullKey.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const offsetLng = ((hash % 100) - 50) * 0.02;
    const offsetLat = ((hash % 73) - 36) * 0.02;
    return [base[0] + offsetLng, base[1] + offsetLat];
  }

  return null;
}

export function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export const formatMoney = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

const DSCR_TIER_COLORS = {
  get strong() { return getComputedThemeColor("--success") || "hsl(142, 71%, 45%)"; },
  get moderate() { return getComputedThemeColor("--warning") || "hsl(48, 96%, 53%)"; },
  get watch() { return getComputedThemeColor("--destructive") || "hsl(0, 84%, 60%)"; },
} as const;

export function getMarketColorInternational() { return getComputedThemeColor("--chart-3") || "hsl(217, 91%, 60%)"; }

export function getPerformanceTier(property: any): { color: string; label: string; tier: string } {
  const noi = property.startAdr * property.roomCount * (property.startOccupancy || 0.6) * 365;
  const totalInvestment = (property.purchasePrice || 0) + (property.buildingImprovements || 0);
  const debtService = totalInvestment * 0.065;
  const dscr = totalInvestment > 0 ? noi / debtService : 0;

  if (dscr > 1.5) return { color: DSCR_TIER_COLORS.strong, label: "Strong (DSCR > 1.5)", tier: "strong" };
  if (dscr > 1.2) return { color: DSCR_TIER_COLORS.moderate, label: "Moderate (DSCR 1.2–1.5)", tier: "moderate" };
  return { color: DSCR_TIER_COLORS.watch, label: "Watch (DSCR < 1.2)", tier: "watch" };
}

function getStatusColorMap(): Record<string, { bg: string; text: string }> {
  return {
    [PropertyStatus.OPERATING]: { bg: "hsl(var(--success) / 0.15)", text: getComputedThemeColor("--success") },
    [PropertyStatus.IMPROVEMENTS]: { bg: "hsl(var(--warning) / 0.15)", text: getComputedThemeColor("--warning") },
    [PropertyStatus.ACQUIRED]: { bg: "hsl(var(--chart-3) / 0.15)", text: getComputedThemeColor("--chart-3") },
    [PropertyStatus.IN_NEGOTIATION]: { bg: "hsl(var(--chart-5) / 0.15)", text: getComputedThemeColor("--chart-5") },
    [PropertyStatus.PIPELINE]: { bg: "hsl(var(--muted) / 0.3)", text: getComputedThemeColor("--muted-foreground") },
    [PropertyStatus.PLANNED]: { bg: "hsl(var(--accent-pop) / 0.15)", text: getComputedThemeColor("--accent-pop") },
  };
}

function getStatusColorDefault() { return { bg: "hsl(var(--muted) / 0.3)", text: getComputedThemeColor("--muted-foreground") }; }

export const statusColor = (status: string) =>
  getStatusColorMap()[status] ?? getStatusColorDefault();

export function formatLocation(property: any): string {
  const parts = [property.city];
  if (property.stateProvince) parts.push(property.stateProvince);
  parts.push(property.country);
  return parts.filter(Boolean).join(", ");
}

export type GeoProperty = {
  property: any;
  coords: [number, number];
};

export type ColorMode = "performance" | "market";

export function makeRasterStyle(tileUrl: string, attribution?: string): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      "raster-tiles": {
        type: "raster",
        tiles: [tileUrl],
        tileSize: 256,
        attribution: attribution || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      },
    },
    layers: [
      {
        id: "raster-layer",
        type: "raster",
        source: "raster-tiles",
        minzoom: 0,
        maxzoom: 19,
      },
    ],
  };
}

export const MAP_STYLES = {
  standard: () => makeRasterStyle("/api/tiles/osm/{z}/{x}/{y}"),
  satellite: () => makeRasterStyle("/api/tiles/satellite/{z}/{x}/{y}", '&copy; Esri, Maxar, Earthstar Geographics'),
};

export const TOUR_PAUSE_MS = 4000;

export interface LocationLinks {
  googleMapsUrl: string;
  googleEarth3dUrl: string;
}

export function buildLocationLinks(
  lat: number,
  lng: number,
  _name?: string,
): LocationLinks {
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  const googleEarth3dUrl = `https://earth.google.com/web/@${lat},${lng},500a,800d,35y,0h,60t,0r`;
  return { googleMapsUrl, googleEarth3dUrl };
}

export function hasCoordinates(property: { latitude?: number | null; longitude?: number | null }): boolean {
  return property.latitude != null && property.longitude != null &&
    Number.isFinite(property.latitude) && Number.isFinite(property.longitude);
}
