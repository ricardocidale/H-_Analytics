import { useState, useCallback, useRef } from "react";
import maplibregl from "maplibre-gl";
import { TOUR_PAUSE_MS, type GeoProperty } from "@/lib/map-utils";

interface UseMapTourOptions {
  geoProperties: GeoProperty[];
  mapRef: React.MutableRefObject<maplibregl.Map | null>;
  markersRef: React.MutableRefObject<Map<string, maplibregl.Marker>>;
  moveEndHandlerRef: React.MutableRefObject<(() => void) | null>;
  setSelectedId: (id: number | null) => void;
}

export function useMapTour({
  geoProperties,
  mapRef,
  markersRef,
  moveEndHandlerRef,
  setSelectedId,
}: UseMapTourOptions) {
  const [tourActive, setTourActive] = useState(false);
  const [tourPaused, setTourPaused] = useState(false);
  const [tourIndex, setTourIndex] = useState(0);
  const tourRef = useRef<{ active: boolean; paused: boolean; index: number; sessionId: number }>({
    active: false, paused: false, index: 0, sessionId: 0,
  });
  const tourTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPendingMoveEnd = useCallback(() => {
    const map = mapRef.current;
    if (map && moveEndHandlerRef.current) {
      map.off("moveend", moveEndHandlerRef.current);
      moveEndHandlerRef.current = null;
    }
  }, []);

  const cinematicFlyTo = useCallback((coords: [number, number], sessionId?: number, onComplete?: () => void) => {
    const map = mapRef.current;
    if (!map) return;

    cancelPendingMoveEnd();

    const currentZoom = map.getZoom();
    const currentBearing = map.getBearing();
    const targetBearing = currentBearing + 30 + Math.random() * 30;

    map.flyTo({
      center: coords,
      zoom: 16,
      pitch: 60,
      bearing: targetBearing,
      duration: currentZoom < 5 ? 4000 : 3000,
      essential: true,
      curve: 1.42,
      speed: 0.8,
    });

    if (onComplete) {
      const handler = () => {
        moveEndHandlerRef.current = null;
        if (sessionId !== undefined && tourRef.current.sessionId !== sessionId) return;
        onComplete();
      };
      moveEndHandlerRef.current = handler;
      map.once("moveend", handler);
    }
  }, [cancelPendingMoveEnd]);

  const stopTour = useCallback(() => {
    tourRef.current.active = false;
    tourRef.current.paused = false;
    tourRef.current.sessionId++;
    cancelPendingMoveEnd();
    if (tourTimerRef.current) {
      clearTimeout(tourTimerRef.current);
      tourTimerRef.current = null;
    }
    setTourActive(false);
    setTourPaused(false);
    setTourIndex(0);
  }, [cancelPendingMoveEnd]);

  const runTourStep = useCallback((index: number) => {
    if (!tourRef.current.active || index >= geoProperties.length) {
      stopTour();
      return;
    }

    if (tourRef.current.paused) return;

    const sid = tourRef.current.sessionId;
    tourRef.current.index = index;
    setTourIndex(index);

    const geo = geoProperties[index];
    setSelectedId(geo.property.id);

    markersRef.current.forEach(m => {
      if (m.getPopup()?.isOpen()) m.togglePopup();
    });

    cinematicFlyTo(geo.coords, sid, () => {
      if (!tourRef.current.active || tourRef.current.sessionId !== sid) return;

      const marker = markersRef.current.get(`prop-${geo.property.id}`);
      if (marker && !marker.getPopup()?.isOpen()) {
        marker.togglePopup();
      }

      tourTimerRef.current = setTimeout(() => {
        if (tourRef.current.active && !tourRef.current.paused && tourRef.current.sessionId === sid) {
          runTourStep(index + 1);
        }
      }, TOUR_PAUSE_MS);
    });
  }, [geoProperties, cinematicFlyTo, stopTour]);

  const startTour = useCallback(() => {
    if (geoProperties.length === 0) return;
    stopTour();
    const newSessionId = tourRef.current.sessionId + 1;
    tourRef.current = { active: true, paused: false, index: 0, sessionId: newSessionId };
    setTourActive(true);
    setTourPaused(false);
    setTourIndex(0);
    runTourStep(0);
  }, [geoProperties, runTourStep, stopTour]);

  const toggleTourPause = useCallback(() => {
    if (!tourRef.current.active) return;
    const newPaused = !tourRef.current.paused;
    tourRef.current.paused = newPaused;
    setTourPaused(newPaused);

    if (!newPaused) {
      runTourStep(tourRef.current.index);
    } else {
      cancelPendingMoveEnd();
      if (tourTimerRef.current) {
        clearTimeout(tourTimerRef.current);
        tourTimerRef.current = null;
      }
    }
  }, [runTourStep, cancelPendingMoveEnd]);

  return {
    tourActive,
    tourPaused,
    tourIndex,
    startTour,
    stopTour,
    toggleTourPause,
    cinematicFlyTo,
    cancelPendingMoveEnd,
  };
}
