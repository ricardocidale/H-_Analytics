import {
  escapeHtml,
  formatMoney,
  formatLocation,
  getPerformanceTier,
  statusColor,
  getMarketColorInternational,
  type ColorMode,
} from "@/lib/map-utils";
import type { PropertyResponse } from "@/lib/api/types";

export function createMarkerElement(property: PropertyResponse, isSelected: boolean, colorMode: ColorMode) {
  const perf = getPerformanceTier(property);
  const color = colorMode === "performance"
    ? perf.color
    : property.market === "North America" ? "var(--primary)" : getMarketColorInternational();
  const size = isSelected ? 42 : 32;
  const el = document.createElement("div");
  el.className = "map-marker-container";
  el.style.cursor = "pointer";
  el.style.transition = "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)";
  if (isSelected) el.style.transform = "scale(1.15)";
  el.innerHTML = `
    <div style="position:relative;width:${size}px;height:${size + 12}px;">
      <div style="
        width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;
        background:${color};transform:rotate(-45deg);
        box-shadow:0 4px 12px rgba(0,0,0,0.3);
        border:3px solid white;
        display:flex;align-items:center;justify-content:center;
        ${isSelected ? 'animation:marker-pulse 1.5s ease-in-out infinite;' : ''}
      ">
        <svg xmlns="http://www.w3.org/2000/svg" width="${size * 0.4}" height="${size * 0.4}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(45deg)">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          <polyline points="9 22 9 12 15 12 15 22"></polyline>
        </svg>
      </div>
      ${isSelected ? `<div style="
        position:absolute;top:-4px;left:-4px;right:-4px;bottom:8px;
        border-radius:50% 50% 50% 0;transform:rotate(-45deg);
        border:2px solid ${color};opacity:0.4;
        animation:marker-ring 1.5s ease-in-out infinite;
      "></div>` : ''}
    </div>
  `;
  return el;
}

export function createClusterMarker(count: number): HTMLDivElement {
  const size = Math.min(24 + count * 3, 50);
  const el = document.createElement("div");
  el.style.cursor = "pointer";
  el.innerHTML = `
    <div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:hsl(var(--primary));
      box-shadow:0 4px 12px rgba(0,0,0,0.3);
      border:3px solid white;
      display:flex;align-items:center;justify-content:center;
      font-family:system-ui;font-weight:700;font-size:${Math.max(11, size * 0.3)}px;color:white;
    ">${count}</div>
  `;
  return el;
}

export function createPopupHTML(property: any) {
  const sc = statusColor(property.status);
  const perf = getPerformanceTier(property);
  const safeName = escapeHtml(property.name || "");
  const safeLocation = escapeHtml(formatLocation(property));
  const safeMarket = escapeHtml(property.market || "");
  const safeStatus = escapeHtml(property.status || "");
  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;min-width:240px;padding:4px;">
      <h3 style="font-weight:700;font-size:15px;margin:0 0 4px;color:hsl(var(--foreground));">${safeName}</h3>
      <p style="color:hsl(var(--muted-foreground));font-size:12px;margin:0 0 10px;">${safeLocation}</p>
      <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;">
        <span style="background:hsl(var(--primary) / 0.12);color:hsl(var(--primary));font-size:11px;padding:3px 10px;border-radius:9999px;font-weight:600;">${safeMarket}</span>
        <span style="background:${sc.bg};color:${sc.text};font-size:11px;padding:3px 10px;border-radius:9999px;font-weight:600;">${safeStatus}</span>
        <span style="background:${perf.color}22;color:${perf.color};font-size:11px;padding:3px 10px;border-radius:9999px;font-weight:600;">${escapeHtml(perf.label)}</span>
      </div>
      <div style="display:flex;gap:16px;font-size:12px;color:hsl(var(--muted-foreground));padding-top:8px;border-top:1px solid hsl(var(--border));">
        <div style="display:flex;align-items:center;gap:4px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <strong>${property.roomCount}</strong> rooms
        </div>
        <div style="display:flex;align-items:center;gap:4px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          <strong>${formatMoney(property.startAdr)}</strong> ADR
        </div>
      </div>
      <div data-popup-risk-signals style="margin-top:10px;padding-top:8px;border-top:1px solid hsl(var(--border));display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
        <a
          href="/property/${property.id}/research#pipeline-str"
          data-testid="link-popup-risk-signals-${property.id}"
          style="display:inline-flex;align-items:center;gap:4px;background:hsl(var(--primary) / 0.10);color:hsl(var(--primary));font-size:11px;padding:3px 9px;border-radius:9999px;font-weight:600;text-decoration:none;border:1px solid hsl(var(--primary) / 0.20);"
          title="Submarket Supply Pipeline + STR Restriction Trends — sourced by Risk Intelligence"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/></svg>
          Pipeline + STR
        </a>
      </div>
      <div data-popup-actions style="margin-top:8px;display:flex;align-items:center;gap:8px;">
        <a href="/property/${property.id}" style="color:hsl(var(--primary));font-size:12px;font-weight:600;text-decoration:none;">View Details →</a>
      </div>
    </div>
  `;
}
