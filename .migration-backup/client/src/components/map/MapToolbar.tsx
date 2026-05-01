import { IconMountain, IconGlobe, IconMap, IconPlay, IconPause, IconNavigation } from "@/components/icons";
import { ArrowLeft } from "@/components/icons/themed-icons";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import type { GeoProperty, ColorMode } from "@/lib/map-utils";

export const MAP_CSS = `
  @keyframes marker-pulse {
    0%, 100% { box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
    50% { box-shadow: 0 4px 20px rgba(0,0,0,0.5), 0 0 0 4px rgba(var(--primary-rgb,159,188,164),0.2); }
  }
  @keyframes marker-ring {
    0%, 100% { opacity: 0.4; transform: rotate(-45deg) scale(1); }
    50% { opacity: 0.1; transform: rotate(-45deg) scale(1.3); }
  }
  .map-popup-custom .maplibregl-popup-content {
    border-radius: 12px !important;
    box-shadow: 0 8px 30px rgba(0,0,0,0.15) !important;
    padding: 14px !important;
    border: 1px solid rgba(0,0,0,0.06) !important;
  }
  .map-popup-custom .maplibregl-popup-tip {
    border-top-color: white !important;
  }
  .maplibregl-ctrl-group { border-radius: 10px !important; box-shadow: 0 2px 10px rgba(0,0,0,0.1) !important; }
  .tour-progress-bar {
    transition: width 0.3s ease;
  }
`;

interface MapToolbarProps {
  geoProperties: GeoProperty[];
  countryCount: number;
  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;
  globeMode: boolean;
  setGlobeMode: (v: boolean) => void;
  satelliteMode: boolean;
  setSatelliteMode: (v: boolean) => void;
  terrain3d: boolean;
  setTerrain3d: (v: boolean) => void;
  tourActive: boolean;
  tourPaused: boolean;
  tourIndex: number;
  startTour: () => void;
  stopTour: () => void;
  toggleTourPause: () => void;
  fitAll: () => void;
}

export function MapToolbar({
  geoProperties, countryCount,
  colorMode, setColorMode,
  globeMode, setGlobeMode,
  satelliteMode, setSatelliteMode,
  terrain3d, setTerrain3d,
  tourActive, tourPaused, tourIndex,
  startTour, stopTour, toggleTourPause, fitAll,
}: MapToolbarProps) {
  const [, navigate] = useLocation();

  return (
    <>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            data-testid="button-back-dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
            Dashboard
          </Button>
          <div className="w-px h-6 bg-border" />
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground" data-testid="map-view-title">
              Portfolio Map
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {geoProperties.length} {geoProperties.length === 1 ? "property" : "properties"} across {countryCount} {countryCount === 1 ? "country" : "countries"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant={colorMode === "performance" ? "default" : "outline"} size="sm" onClick={() => setColorMode(colorMode === "performance" ? "market" : "performance")} className="flex items-center gap-1.5 text-xs" data-testid="button-color-mode">
            {colorMode === "performance" ? "📊 Performance" : "🌍 By Market"}
          </Button>
          <Button variant={globeMode ? "default" : "outline"} size="sm" onClick={() => setGlobeMode(!globeMode)} className="flex items-center gap-1.5 text-xs" data-testid="button-globe-toggle">
            <IconGlobe className="w-3.5 h-3.5" />{globeMode ? "Globe" : "Flat"}
          </Button>
          <Button variant={satelliteMode ? "default" : "outline"} size="sm" onClick={() => setSatelliteMode(!satelliteMode)} className="flex items-center gap-1.5 text-xs" data-testid="button-satellite-toggle">
            <IconMap className="w-3.5 h-3.5" />{satelliteMode ? "Satellite" : "Standard"}
          </Button>
          <Button variant={terrain3d ? "default" : "outline"} size="sm" onClick={() => setTerrain3d(!terrain3d)} className="flex items-center gap-1.5 text-xs" data-testid="button-3d-terrain">
            <IconMountain className="w-3.5 h-3.5" />3D Terrain
          </Button>
          <div className="w-px h-6 bg-border" />
          {!tourActive ? (
            <Button variant="outline" size="sm" onClick={startTour} disabled={geoProperties.length === 0} className="flex items-center gap-1.5 text-xs" data-testid="button-start-tour">
              <IconPlay className="w-3.5 h-3.5" />Tour
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={toggleTourPause} className="flex items-center gap-1.5 text-xs" data-testid="button-pause-tour">
                {tourPaused ? <IconPlay className="w-3.5 h-3.5" /> : <IconPause className="w-3.5 h-3.5" />}
                {tourPaused ? "Resume" : "Pause"}
              </Button>
              <Button variant="outline" size="sm" onClick={stopTour} className="flex items-center gap-1.5 text-xs text-destructive hover:text-destructive" data-testid="button-stop-tour">
                Stop
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={fitAll} className="flex items-center gap-1.5 text-xs" data-testid="button-fit-all">
            <IconNavigation className="w-3.5 h-3.5" />Fit All
          </Button>
        </div>
      </div>

      {tourActive && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 flex items-center gap-3" data-testid="tour-progress">
          <span className="text-xs font-semibold text-primary">{tourPaused ? "Tour Paused" : "Touring"}</span>
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full tour-progress-bar" style={{ width: `${((tourIndex + 1) / geoProperties.length) * 100}%` }} />
          </div>
          <span className="text-xs text-muted-foreground font-medium">{tourIndex + 1} / {geoProperties.length}</span>
          <span className="text-[10px] text-muted-foreground">ESC to stop · Space to {tourPaused ? "resume" : "pause"}</span>
        </div>
      )}
    </>
  );
}

interface MapLegendProps {
  perfCounts: { strong: number; moderate: number; watch: number };
}

export function MapLegend({ perfCounts }: MapLegendProps) {
  return (
    <div className="absolute bottom-3 left-3 bg-card/95 backdrop-blur-sm rounded-lg p-3 shadow-lg border border-border" data-testid="performance-legend">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Performance Tier</div>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ background: "hsl(var(--success))" }} />
          <span className="text-[11px] text-foreground">Strong DSCR &gt; 1.5 ({perfCounts.strong})</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ background: "hsl(var(--warning))" }} />
          <span className="text-[11px] text-foreground">Moderate 1.2–1.5 ({perfCounts.moderate})</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ background: "hsl(var(--destructive))" }} />
          <span className="text-[11px] text-foreground">Watch &lt; 1.2 ({perfCounts.watch})</span>
        </div>
      </div>
    </div>
  );
}
