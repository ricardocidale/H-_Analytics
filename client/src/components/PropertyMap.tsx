import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "@/components/icons/themed-icons";

interface NearbyPOI {
  name: string;
  type: "hotel" | "airport" | "convention_center" | "tourist_attraction";
  lat: number;
  lng: number;
  vicinity: string;
  rating?: number;
  distance: number;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const POI_COLORS: Record<string, { color: string; label: string; emoji: string }> = {
  hotel: { color: "hsl(var(--destructive))", label: "Competing Hotels", emoji: "🏨" },
  airport: { color: "hsl(var(--chart-3))", label: "Airports", emoji: "✈️" },
  convention_center: { color: "hsl(var(--chart-5))", label: "Convention Centers", emoji: "🏛️" },
  tourist_attraction: { color: "hsl(var(--success))", label: "Attractions", emoji: "🎯" },
};

function makeRasterStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      "raster-tiles": {
        type: "raster",
        tiles: ["/api/tiles/osm/{z}/{x}/{y}"],
        tileSize: 256,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
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

function createPropertyMarker(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cursor = "pointer";
  el.innerHTML = `
    <div style="position:relative;width:40px;height:52px;">
      <div style="
        width:40px;height:40px;border-radius:50% 50% 50% 0;
        background:var(--primary);transform:rotate(-45deg);
        box-shadow:0 4px 12px rgba(0,0,0,0.3);
        border:3px solid white;
        display:flex;align-items:center;justify-content:center;
      ">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(45deg)">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          <polyline points="9 22 9 12 15 12 15 22"></polyline>
        </svg>
      </div>
    </div>
  `;
  return el;
}

function createPOIMarker(type: string): HTMLDivElement {
  const config = POI_COLORS[type] || { color: "hsl(var(--muted-foreground))", emoji: "📍" };
  const el = document.createElement("div");
  el.style.cursor = "pointer";
  el.innerHTML = `
    <div style="
      width:28px;height:28px;border-radius:50%;
      background:${config.color};
      box-shadow:0 2px 8px rgba(0,0,0,0.25);
      border:2px solid white;
      display:flex;align-items:center;justify-content:center;
      font-size:13px;line-height:1;
    ">${config.emoji}</div>
  `;
  return el;
}

interface PropertyMapProps {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  propertyName: string;
  propertyId: number;
}

export default function PropertyMap({ latitude, longitude, propertyName }: PropertyMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [showLegend, setShowLegend] = useState(true);
  const [activeTypes, setActiveTypes] = useState<Set<string>>(
    new Set(["hotel", "airport", "convention_center", "tourist_attraction"])
  );

  const hasCoords = latitude != null && longitude != null;

  const { data: pois = [], isLoading: poisLoading } = useQuery<NearbyPOI[]>({
    queryKey: ["/api/places/nearby", latitude, longitude],
    queryFn: async () => {
      if (!hasCoords) return [];
      const res = await fetch(`/api/places/nearby?lat=${latitude}&lng=${longitude}&radius=10`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: hasCoords,
    staleTime: 30 * 60 * 1000,
  });

  useEffect(() => {
    if (!mapContainerRef.current || !hasCoords) return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: makeRasterStyle(),
      center: [longitude!, latitude!],
      zoom: 12,
      pitch: 30,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

    mapRef.current = map;

    map.on("load", () => {
      const propEl = createPropertyMarker();
      new maplibregl.Marker({ element: propEl })
        .setLngLat([longitude!, latitude!])
        .setPopup(
          new maplibregl.Popup({ offset: 25, closeButton: false })
            .setHTML(`<div style="font-family:system-ui;padding:4px;"><strong>${escapeHtml(propertyName)}</strong><br/><span style="color:hsl(var(--muted-foreground));font-size:12px;">Your Property</span></div>`)
        )
        .addTo(map);

      if (pois.length > 0) {
        const bounds = new maplibregl.LngLatBounds();
        bounds.extend([longitude!, latitude!]);

        pois.forEach((poi) => {
          if (!activeTypes.has(poi.type)) return;
          bounds.extend([poi.lng, poi.lat]);

          const poiEl = createPOIMarker(poi.type);
          new maplibregl.Marker({ element: poiEl })
            .setLngLat([poi.lng, poi.lat])
            .setPopup(
              new maplibregl.Popup({ offset: 15, closeButton: false, maxWidth: "220px" })
                .setHTML(`
                  <div style="font-family:system-ui;padding:4px;">
                    <strong style="font-size:13px;">${escapeHtml(poi.name)}</strong>
                    <br/><span style="color:hsl(var(--muted-foreground));font-size:11px;">${escapeHtml(poi.vicinity)}</span>
                    <br/><span style="color:hsl(var(--muted-foreground) / 0.7);font-size:11px;">${poi.distance.toFixed(1)} mi away${poi.rating ? ` · ⭐ ${escapeHtml(String(poi.rating))}` : ""}</span>
                  </div>
                `)
            )
            .addTo(map);
        });

        map.fitBounds(bounds, {
          padding: { top: 60, bottom: 60, left: 60, right: 60 },
          maxZoom: 13,
          duration: 1000,
        });
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [hasCoords, latitude, longitude, propertyName, pois, activeTypes]);

  if (!hasCoords) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center" data-testid="property-map-no-coords">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted-foreground">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        </div>
        <p className="text-sm text-muted-foreground font-medium">No location data available</p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          This property hasn't been geocoded yet. Add coordinates to see the map.
        </p>
      </div>
    );
  }

  const toggleType = (type: string) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const poiCountByType = pois.reduce((acc, poi) => {
    acc[poi.type] = (acc[poi.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="rounded-xl border border-border overflow-hidden bg-card" data-testid="property-map">
      <div className="relative" style={{ height: "400px" }}>
        <div ref={mapContainerRef} className="w-full h-full" />

        {poisLoading && (
          <div className="absolute top-3 left-3 bg-card/90 backdrop-blur-sm rounded-lg px-3 py-1.5 flex items-center gap-2 text-xs text-muted-foreground shadow-sm border border-border">
            <Loader2 className="w-3 h-3 animate-spin" />
            Loading nearby places...
          </div>
        )}

        {showLegend && (
          <div className="absolute bottom-3 left-3 bg-card/95 backdrop-blur-sm rounded-lg p-3 shadow-lg border border-border min-w-[180px]" data-testid="map-legend">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Legend</span>
              <button
                onClick={() => setShowLegend(false)}
                className="text-muted-foreground hover:text-foreground text-xs"
                data-testid="button-close-legend"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-4 h-4 rounded-full flex items-center justify-center" style={{ background: "hsl(var(--primary))" }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="white" stroke="white" strokeWidth="2">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                </svg>
              </div>
              <span className="text-[11px] text-foreground font-medium">This Property</span>
            </div>

            {Object.entries(POI_COLORS).map(([type, config]) => (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className={`flex items-center gap-2 w-full py-0.5 transition-opacity ${activeTypes.has(type) ? "opacity-100" : "opacity-40"}`}
                data-testid={`legend-toggle-${type}`}
              >
                <div className="w-4 h-4 rounded-full flex items-center justify-center text-[9px]" style={{ background: config.color }}>
                  {config.emoji}
                </div>
                <span className="text-[11px] text-foreground">
                  {config.label}
                  {poiCountByType[type] ? ` (${poiCountByType[type]})` : ""}
                </span>
              </button>
            ))}
          </div>
        )}

        {!showLegend && (
          <button
            onClick={() => setShowLegend(true)}
            className="absolute bottom-3 left-3 bg-card/95 backdrop-blur-sm rounded-lg px-3 py-1.5 shadow-lg border border-border text-xs text-muted-foreground hover:text-foreground"
            data-testid="button-show-legend"
          >
            Show Legend
          </button>
        )}
      </div>
    </div>
  );
}
