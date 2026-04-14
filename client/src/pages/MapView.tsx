import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import DOMPurify from "dompurify";
import { useProperties } from "@/lib/api";
import { IconBuilding2 } from "@/components/icons";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { AnimatedPage } from "@/components/graphics/AnimatedPage";
import Supercluster from "supercluster";
import {
  resolveCoords,
  getPerformanceTier,
  MAP_STYLES,
  type GeoProperty,
  type ColorMode,
} from "@/lib/map-utils";
import { createMarkerElement, createClusterMarker, createPopupHTML } from "@/components/map/map-elements";
import { MapPropertySidebar } from "@/components/map/MapPropertySidebar";
import { MapToolbar, MapLegend, MAP_CSS } from "@/components/map/MapToolbar";
import { useMapTour } from "@/components/map/useMapTour";

export default function MapView() {
  const { data: properties = [] } = useProperties();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [terrain3d, setTerrain3d] = useState(true);
  const [colorMode, setColorMode] = useState<ColorMode>("performance");
  const [globeMode, setGlobeMode] = useState(false);
  const [satelliteMode, setSatelliteMode] = useState(false);
  const moveEndHandlerRef = useRef<(() => void) | null>(null);
  const flyToHandlerRef = useRef<((id: number) => void) | null>(null);
  const styleTransitionRef = useRef(0);
  const selectedIdRef = useRef<number | null>(null);
  selectedIdRef.current = selectedId;

  const geoProperties: GeoProperty[] = useMemo(() =>
    properties
      .filter(p => p.isActive !== false)
      .map(p => {
        const coords = resolveCoords(p);
        return coords ? { property: p, coords } : null;
      })
      .filter((g): g is GeoProperty => g !== null),
    [properties]
  );

  const unmappedCount = properties.length - geoProperties.length;

  const {
    tourActive, tourPaused, tourIndex,
    startTour, stopTour, toggleTourPause,
    cinematicFlyTo,
  } = useMapTour({ geoProperties, mapRef, markersRef, moveEndHandlerRef, setSelectedId });

  const clusterIndex = useMemo(() => {
    const index = new Supercluster({
      radius: 60,
      maxZoom: 14,
    });

    const points: Supercluster.PointFeature<{ propertyId: number; property: any }>[] = geoProperties.map(({ property, coords }) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: coords },
      properties: { propertyId: property.id, property },
    }));

    index.load(points);
    return index;
  }, [geoProperties]);

  const updateMarkers = useCallback((selected: number | null) => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current.clear();

    const zoom = Math.floor(map.getZoom());
    const bounds = map.getBounds();
    const bbox: [number, number, number, number] = [
      bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()
    ];

    const clusters = clusterIndex.getClusters(bbox, zoom);

    clusters.forEach((feature) => {
      const [lng, lat] = feature.geometry.coordinates;

      if (feature.properties.cluster) {
        const count = feature.properties.point_count;
        const el = createClusterMarker(count);
        const clusterId = feature.properties.cluster_id;

        el.addEventListener("click", () => {
          const expansionZoom = clusterIndex.getClusterExpansionZoom(clusterId);
          map.flyTo({ center: [lng, lat], zoom: expansionZoom, duration: 800 });
        });

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([lng, lat])
          .addTo(map);

        markersRef.current.set(`cluster-${clusterId}`, marker);
      } else {
        const property = feature.properties.property;
        const el = createMarkerElement(property, property.id === selected, colorMode);

        const popupContent = document.createElement("div");
        popupContent.innerHTML = DOMPurify.sanitize(createPopupHTML(property));

        const flyToBtn = document.createElement("button");
        flyToBtn.setAttribute("data-testid", `popup-flyto-${property.id}`);
        flyToBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg> Fly To`;
        flyToBtn.style.cssText = "display:inline-flex;align-items:center;gap:4px;margin-top:6px;padding:4px 10px;border:1px solid hsl(var(--border));border-radius:6px;background:hsl(var(--card));color:hsl(var(--primary));font-size:11px;font-weight:600;cursor:pointer;font-family:system-ui;";
        flyToBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          flyToHandlerRef.current?.(property.id);
        });

        const actionsRow = popupContent.querySelector("[data-popup-actions]");
        if (actionsRow) {
          actionsRow.prepend(flyToBtn);
        } else {
          popupContent.firstElementChild?.appendChild(flyToBtn);
        }

        const popup = new maplibregl.Popup({
          offset: 25,
          closeButton: true,
          closeOnClick: false,
          maxWidth: "300px",
          className: "map-popup-custom",
        }).setDOMContent(popupContent);

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([lng, lat])
          .setPopup(popup)
          .addTo(map);

        el.addEventListener("click", () => {
          setSelectedId(property.id);
        });

        markersRef.current.set(`prop-${property.id}`, marker);
      }
    });
  }, [clusterIndex, colorMode]);

  useEffect(() => {
    if (!mapContainerRef.current || geoProperties.length === 0) return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const bounds = new maplibregl.LngLatBounds();
    geoProperties.forEach(({ coords }) => bounds.extend(coords));
    const center = bounds.getCenter();

    const styleKey = satelliteMode ? "satellite" : "standard";
    const style = MAP_STYLES[styleKey]();

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style,
      center: [center.lng, center.lat],
      zoom: globeMode ? 1.8 : 3,
      pitch: terrain3d ? 50 : 0,
      bearing: terrain3d ? -10 : 0,
      maxPitch: 85,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.FullscreenControl(), "top-right");

    mapRef.current = map;

    map.on("load", () => {
      if (globeMode) {
        map.setProjection({ type: "globe" });
        map.setSky({
          "sky-color": "hsl(214, 87%, 71%)",
          "sky-horizon-blend": 0.5,
          "horizon-color": "hsl(207, 100%, 89%)",
          "horizon-fog-blend": 0.2,
          "fog-color": "hsl(210, 47%, 80%)",
          "fog-ground-blend": 0.1,
        });
      }
      if (terrain3d) {
        try {
          map.addSource("terrainSource", {
            type: "raster-dem",
            tiles: ["/api/tiles/terrain/{z}/{x}/{y}"],
            encoding: "terrarium",
            tileSize: 256,
            maxzoom: 15,
          });

          map.setTerrain({ source: "terrainSource", exaggeration: 1.5 });

          map.addLayer({
            id: "hillshading",
            source: "terrainSource",
            type: "hillshade",
            paint: {
              "hillshade-illumination-direction": 315,
              "hillshade-exaggeration": 0.6,
              "hillshade-shadow-color": "rgba(0,0,0,0.3)",
              "hillshade-highlight-color": "rgba(255,255,255,0.5)",
            },
          });
        } catch {
          // Hillshading layer may already exist on re-render — not critical.
        }
      }

      updateMarkers(selectedId);

      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, {
          padding: { top: 80, bottom: 80, left: 80, right: 80 },
          maxZoom: globeMode ? 4 : 6,
          duration: 2500,
          essential: true,
        });
      }
    });

    map.on("moveend", () => updateMarkers(selectedId));
    map.on("zoomend", () => updateMarkers(selectedId));

    return () => {
      stopTour();
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
  }, [geoProperties.length, terrain3d]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const transitionId = ++styleTransitionRef.current;

    const applyModeSettings = () => {
      if (styleTransitionRef.current !== transitionId) return;

      if (globeMode) {
        map.setProjection({ type: "globe" });
        map.setSky({
          "sky-color": "hsl(214, 87%, 71%)",
          "sky-horizon-blend": 0.5,
          "horizon-color": "hsl(207, 100%, 89%)",
          "horizon-fog-blend": 0.2,
          "fog-color": "hsl(210, 47%, 80%)",
          "fog-ground-blend": 0.1,
        });
      } else {
        map.setProjection({ type: "mercator" });
      }

      if (terrain3d) {
        try {
          if (!map.getSource("terrainSource")) {
            map.addSource("terrainSource", {
              type: "raster-dem",
              tiles: ["/api/tiles/terrain/{z}/{x}/{y}"],
              encoding: "terrarium",
              tileSize: 256,
              maxzoom: 15,
            });
          }
          map.setTerrain({ source: "terrainSource", exaggeration: 1.5 });
          if (!map.getLayer("hillshading")) {
            map.addLayer({
              id: "hillshading",
              source: "terrainSource",
              type: "hillshade",
              paint: {
                "hillshade-illumination-direction": 315,
                "hillshade-exaggeration": 0.6,
                "hillshade-shadow-color": "rgba(0,0,0,0.3)",
                "hillshade-highlight-color": "rgba(255,255,255,0.5)",
              },
            });
          }
        } catch {
          // Terrain/hillshade layer already exists on style reload — not critical.
        }
      }

      updateMarkers(selectedIdRef.current);
    };

    if (!map.loaded()) {
      map.once("load", applyModeSettings);
      return () => { styleTransitionRef.current++; };
    }

    const styleKey = satelliteMode ? "satellite" : "standard";
    const newStyle = MAP_STYLES[styleKey]();
    map.setStyle(newStyle);

    const onStyleLoad = () => applyModeSettings();
    map.once("style.load", onStyleLoad);

    return () => {
      styleTransitionRef.current++;
      map.off("style.load", onStyleLoad);
    };
  }, [globeMode, satelliteMode, terrain3d, updateMarkers]);

  useEffect(() => {
    if (tourActive) return;

    updateMarkers(selectedId);

    if (selectedId && mapRef.current) {
      const geo = geoProperties.find(g => g.property.id === selectedId);
      if (geo) {
        mapRef.current.flyTo({
          center: geo.coords,
          zoom: Math.max(mapRef.current.getZoom(), terrain3d ? 8 : 6),
          pitch: terrain3d ? 55 : 0,
          bearing: terrain3d ? mapRef.current.getBearing() + 15 : 0,
          duration: 1800,
          essential: true,
        });

        const marker = markersRef.current.get(`prop-${selectedId}`);
        if (marker && !marker.getPopup()?.isOpen()) {
          marker.togglePopup();
        }
      }
    }
  }, [selectedId, updateMarkers, colorMode, tourActive]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (tourActive) {
          stopTour();
        }
        return;
      }

      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        if (geoProperties.length === 0) return;
        const currentIdx = selectedId
          ? geoProperties.findIndex(g => g.property.id === selectedId)
          : -1;
        const nextIdx = (currentIdx + 1) % geoProperties.length;
        setSelectedId(geoProperties[nextIdx].property.id);
      }

      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        if (geoProperties.length === 0) return;
        const currentIdx = selectedId
          ? geoProperties.findIndex(g => g.property.id === selectedId)
          : 0;
        const prevIdx = (currentIdx - 1 + geoProperties.length) % geoProperties.length;
        setSelectedId(geoProperties[prevIdx].property.id);
      }

      if (e.key === " " && tourActive) {
        e.preventDefault();
        toggleTourPause();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [geoProperties, selectedId, tourActive, stopTour, toggleTourPause]);

  const handleFlyTo = useCallback((propertyId: number) => {
    const geo = geoProperties.find(g => g.property.id === propertyId);
    if (!geo) return;
    setSelectedId(propertyId);

    markersRef.current.forEach(m => {
      if (m.getPopup()?.isOpen()) m.togglePopup();
    });

    cinematicFlyTo(geo.coords, undefined, () => {
      updateMarkers(propertyId);
      const marker = markersRef.current.get(`prop-${propertyId}`);
      if (marker && !marker.getPopup()?.isOpen()) {
        marker.togglePopup();
      }
    });
  }, [geoProperties, cinematicFlyTo, updateMarkers]);

  useEffect(() => {
    flyToHandlerRef.current = handleFlyTo;
  }, [handleFlyTo]);

  const fitAll = () => {
    if (!mapRef.current || geoProperties.length === 0) return;
    stopTour();
    const bounds = new maplibregl.LngLatBounds();
    geoProperties.forEach(({ coords }) => bounds.extend(coords));
    mapRef.current.fitBounds(bounds, {
      padding: { top: 80, bottom: 80, left: 80, right: 80 },
      maxZoom: globeMode ? 4 : 6,
      duration: 1500,
    });
    setSelectedId(null);
  };

  const countryCount = new Set(geoProperties.map(g => g.property.country)).size;

  const perfCounts = useMemo(() => {
    const counts = { strong: 0, moderate: 0, watch: 0 };
    geoProperties.forEach(({ property }) => {
      const t = getPerformanceTier(property).tier;
      counts[t as keyof typeof counts]++;
    });
    return counts;
  }, [geoProperties]);

  return (
    <AnimatedPage>
    <div data-testid="map-view" className="flex flex-col h-[calc(100vh-4rem)] px-4 pt-4 pb-2">
      <style>{MAP_CSS}</style>

      <MapToolbar
        geoProperties={geoProperties}
        countryCount={countryCount}
        colorMode={colorMode}
        setColorMode={setColorMode}
        globeMode={globeMode}
        setGlobeMode={setGlobeMode}
        satelliteMode={satelliteMode}
        setSatelliteMode={setSatelliteMode}
        terrain3d={terrain3d}
        setTerrain3d={setTerrain3d}
        tourActive={tourActive}
        tourPaused={tourPaused}
        tourIndex={tourIndex}
        startTour={startTour}
        stopTour={stopTour}
        toggleTourPause={toggleTourPause}
        fitAll={fitAll}
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mt-4 flex-1 min-h-0">
        <div className="lg:col-span-3 min-h-0">
          <div className="rounded-xl border border-primary/20 overflow-hidden shadow-xl bg-muted relative h-full">
            {geoProperties.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10">
                <IconBuilding2 className="w-12 h-12 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No properties to display on map</p>
              </div>
            )}
            <div ref={mapContainerRef} className="w-full h-full" />

            {colorMode === "performance" && geoProperties.length > 0 && (
              <MapLegend perfCounts={perfCounts} />
            )}
          </div>
        </div>

        <MapPropertySidebar
          geoProperties={geoProperties}
          unmappedCount={unmappedCount}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          colorMode={colorMode}
          tourActive={tourActive}
          tourIndex={tourIndex}
          onFlyTo={handleFlyTo}
        />
      </div>
    </div>
    </AnimatedPage>
  );
}
