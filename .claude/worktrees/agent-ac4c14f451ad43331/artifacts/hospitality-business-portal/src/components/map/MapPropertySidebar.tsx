import { Link } from "wouter";
import { IconBuilding2, IconDollarSign, IconNavigation } from "@/components/icons";
import {
  formatMoney, formatLocation, getPerformanceTier, statusColor,
  getMarketColorInternational, type GeoProperty, type ColorMode,
} from "@/lib/map-utils";

interface MapPropertySidebarProps {
  geoProperties: GeoProperty[];
  unmappedCount: number;
  selectedId: number | null;
  setSelectedId: (id: number) => void;
  colorMode: ColorMode;
  tourActive: boolean;
  tourIndex: number;
  onFlyTo: (id: number) => void;
}

export function MapPropertySidebar({
  geoProperties, unmappedCount, selectedId, setSelectedId,
  colorMode, tourActive, tourIndex, onFlyTo,
}: MapPropertySidebarProps) {
  return (
    <div className="lg:col-span-1 space-y-2 overflow-y-auto pr-1">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-1 mb-1">
        Properties ({geoProperties.length})
      </div>
      {geoProperties.map(({ property }, idx) => {
        const isSelected = selectedId === property.id;
        const isTourCurrent = tourActive && tourIndex === idx;
        const perf = getPerformanceTier(property);
        const pinColor = colorMode === "performance"
          ? perf.color
          : property.market === "North America" ? "var(--primary)" : getMarketColorInternational();
        const sc = statusColor(property.status);
        return (
          <div
            key={property.id}
            className={`rounded-xl border p-3.5 cursor-pointer transition-all duration-300 ${
              isTourCurrent
                ? "border-primary bg-primary/10 shadow-lg ring-2 ring-primary/30"
                : isSelected
                ? "border-primary bg-primary/5 shadow-lg ring-1 ring-primary/20"
                : "border-border bg-card hover:border-primary/30 hover:shadow-md"
            }`}
            onClick={() => setSelectedId(property.id)}
            data-testid={`card-property-${property.id}`}
          >
            <div className="flex items-start gap-2.5 mb-2">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                style={{ backgroundColor: `${pinColor}20` }}
              >
                <IconBuilding2 size={14} style={{ color: pinColor }} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-sm text-foreground truncate" data-testid={`text-name-${property.id}`}>
                  {property.name}
                </h3>
                <p className="text-[11px] text-muted-foreground truncate">
                  {formatLocation(property)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: sc.bg, color: sc.text }}
              >
                {property.status}
              </span>
              {colorMode === "performance" && (
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: `${perf.color}22`, color: perf.color }}
                >
                  {perf.tier}
                </span>
              )}
              <span className="text-[10px] text-muted-foreground">
                {property.market}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><IconBuilding2 size={11} /> {property.roomCount} rooms</span>
              <span className="flex items-center gap-1"><IconDollarSign size={11} /> {formatMoney(property.startAdr)}</span>
            </div>
            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/50">
              <button
                onClick={(e) => { e.stopPropagation(); onFlyTo(property.id); }}
                className="text-[11px] text-primary font-medium hover:underline flex items-center gap-1"
                data-testid={`button-flyto-${property.id}`}
              >
                <IconNavigation size={11} />
                Fly To
              </button>
              {isSelected && (
                <Link href={`/property/${property.id}`}>
                  <span className="text-[11px] text-primary font-medium hover:underline" data-testid={`link-view-${property.id}`}>
                    View Details →
                  </span>
                </Link>
              )}
            </div>
          </div>
        );
      })}
      {unmappedCount > 0 && (
        <div className="text-[11px] text-muted-foreground/70 px-1 pt-2">
          {unmappedCount} {unmappedCount === 1 ? "property" : "properties"} not shown (missing location data)
        </div>
      )}
    </div>
  );
}
