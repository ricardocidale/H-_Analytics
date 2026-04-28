import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatMoney } from "@/lib/financialEngine";
import { usePropertyValue, useMarketContext } from "@/lib/api";
import type { PropertyFinderResult } from "@/lib/api/types";
import { Loader2 } from "@/components/icons/themed-icons";
import {
  IconMapPin, IconBed, IconBath, IconRuler, IconTrees,
  IconExternalLink, IconTrendingUp, IconBuilding, IconStar,
  IconClipboardList,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  DD_WORKSTREAM_LABELS,
  DD_TEMPLATE_VERSION,
  type DdWorkstream,
} from "@shared/dd-template";
import type { DdTemplateItemRow } from "@shared/schema";

type Tab = "listing" | "value" | "comps" | "dd";

const MAX_ESTIMATES_SHOWN = 12;
const MAX_OTA_CHANNELS_SHOWN = 6;

interface Props {
  property: PropertyFinderResult;
  onClose: () => void;
}

export function PropertyDetailDrawer({ property, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("listing");

  const cityForComps = property.city || property.address.split(",")[0]?.trim() || null;
  const stateForComps = property.state || undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" data-testid="drawer-property-detail">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-card rounded-t-2xl sm:rounded-2xl shadow-xl border border-border max-h-[90vh] overflow-y-auto">
        <div className="h-1 bg-gradient-to-r from-primary via-primary/60 to-primary/30 rounded-t-2xl" />

        <div className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <IconMapPin className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h3 className="font-display font-bold text-foreground text-sm">Property Details</h3>
                <p className="text-xs text-muted-foreground truncate max-w-[380px]">{property.address}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} data-testid="btn-close-detail-drawer">
              <span className="text-lg leading-none">×</span>
            </Button>
          </div>

          <div className="flex gap-1 bg-muted/50 rounded-lg p-1" data-testid="detail-tabs">
            {(["listing", "value", "comps", "dd"] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium transition-all ${
                  activeTab === tab
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`tab-${tab}`}
              >
                {tab === "listing"
                  ? "Listing"
                  : tab === "value"
                    ? "Value History"
                    : tab === "comps"
                      ? "Hotel Comps"
                      : "Due Diligence"}
              </button>
            ))}
          </div>

          {activeTab === "listing" && <ListingPane property={property} />}
          {activeTab === "value" && <ValuePane propertyId={property.externalId} />}
          {activeTab === "comps" && <CompsPane city={cityForComps} state={stateForComps} />}
          {activeTab === "dd" && <DdPreviewPane />}
        </div>
      </div>
    </div>
  );
}

function ListingPane({ property }: { property: PropertyFinderResult }) {
  return (
    <div className="space-y-4" data-testid="pane-listing">
      {property.imageUrl && (
        <div className="rounded-xl overflow-hidden border border-border">
          <img src={property.imageUrl} alt={property.address} className="w-full h-48 object-cover" />
        </div>
      )}

      <p className="text-2xl font-bold text-foreground">
        {property.price ? formatMoney(property.price) : "—"}
      </p>

      <div className="flex flex-wrap items-center gap-4 py-2.5 px-3 bg-primary/5 rounded-xl border border-primary/10">
        <div className="flex items-center gap-1.5">
          <IconBed className="w-3.5 h-3.5 text-primary" />
          <span className="text-sm text-foreground">{property.beds ?? "—"} beds</span>
        </div>
        <div className="w-px h-4 bg-primary/20" />
        <div className="flex items-center gap-1.5">
          <IconBath className="w-3.5 h-3.5 text-primary" />
          <span className="text-sm text-foreground">{property.baths ?? "—"} baths</span>
        </div>
        <div className="w-px h-4 bg-primary/20" />
        <div className="flex items-center gap-1.5">
          <IconRuler className="w-3.5 h-3.5 text-primary" />
          <span className="text-sm text-foreground">{property.sqft ? property.sqft.toLocaleString() : "—"} sqft</span>
        </div>
        <div className="w-px h-4 bg-primary/20" />
        <div className="flex items-center gap-1.5">
          <IconTrees className="w-3.5 h-3.5 text-primary" />
          <span className="text-sm font-semibold text-secondary">{property.lotSizeAcres ?? "—"} acres</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <DetailRow label="City" value={property.city} />
        <DetailRow label="State" value={property.state} />
        <DetailRow label="ZIP" value={property.zipCode} />
        <DetailRow label="Type" value={property.propertyType?.replace(/_/g, " ")} />
      </div>

      {property.listingUrl && (
        <a
          href={property.listingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-secondary font-medium"
          data-testid="link-listing"
        >
          View Original Listing <IconExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
}

function ValuePane({ propertyId }: { propertyId: string }) {
  const { data: history, isLoading, error } = usePropertyValue(propertyId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" data-testid="pane-value">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8" data-testid="pane-value-error">
        <IconTrendingUp className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Unable to load value history</p>
        <p className="text-xs text-muted-foreground/60 mt-1">The property value service may be temporarily unavailable.</p>
      </div>
    );
  }

  if (!history || (history.currentEstimate == null && history.estimates.length === 0)) {
    return (
      <div className="text-center py-8" data-testid="pane-value-empty">
        <IconTrendingUp className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No value history available</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Cotality estimates not found for this property.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="pane-value">
      <div className="grid grid-cols-3 gap-3">
        <Metric
          label="Current Estimate"
          value={history.currentEstimate != null ? formatMoney(history.currentEstimate) : "—"}
        />
        <Metric
          label="12-Mo Change"
          value={history.appreciation12mo != null ? `${history.appreciation12mo > 0 ? "+" : ""}${history.appreciation12mo.toFixed(1)}%` : "—"}
          color={history.appreciation12mo != null ? (history.appreciation12mo >= 0 ? "text-emerald-600" : "text-red-500") : undefined}
        />
        <Metric
          label="24-Mo Change"
          value={history.appreciation24mo != null ? `${history.appreciation24mo > 0 ? "+" : ""}${history.appreciation24mo.toFixed(1)}%` : "—"}
          color={history.appreciation24mo != null ? (history.appreciation24mo >= 0 ? "text-emerald-600" : "text-red-500") : undefined}
        />
      </div>

      {history.estimates.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recent Estimates</p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {history.estimates.slice(0, MAX_ESTIMATES_SHOWN).map((est, i) => (
              <div key={i} className="flex items-center justify-between text-xs bg-muted/30 rounded px-3 py-1.5" data-testid={`detail-estimate-${i}`}>
                <span className="text-muted-foreground">{new Date(est.date).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground/60">{est.source}</span>
                  <span className="font-medium text-foreground">{formatMoney(est.estimate)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-[10px] text-muted-foreground/60 text-right">Source: Cotality (CoreLogic) via US Real Estate API</div>
    </div>
  );
}

function CompsPane({ city, state }: { city: string | null; state?: string }) {
  const { data: ctx, isLoading, error } = useMarketContext(city, state);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" data-testid="pane-comps">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <span className="ml-2 text-sm text-muted-foreground">Loading hotel comps…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8" data-testid="pane-comps-error">
        <IconBuilding className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Unable to load hotel comp data</p>
        <p className="text-xs text-muted-foreground/60 mt-1">The market data service may be temporarily unavailable.</p>
      </div>
    );
  }

  const snapshot = ctx?.hotelSnapshot;
  const rates = ctx?.topHotelRates;

  if (!snapshot && (!rates || rates.length === 0)) {
    return (
      <div className="text-center py-8" data-testid="pane-comps">
        <IconBuilding className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No hotel comp data available</p>
        <p className="text-xs text-muted-foreground/60 mt-1">{city ? `No Xotelo data for ${city}` : "Location data unavailable"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="pane-comps">
      {snapshot && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Metric label="Hotels Tracked" value={String(snapshot.sampleSize)} />
            <Metric label="Avg Low" value={snapshot.avgPriceMin != null ? formatMoney(snapshot.avgPriceMin) : "—"} />
            <Metric label="Avg High" value={snapshot.avgPriceMax != null ? formatMoney(snapshot.avgPriceMax) : "—"} />
          </div>

          {snapshot.topHotels?.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Top Hotels — {snapshot.location}</p>
              {snapshot.topHotels.map((h, i) => (
                <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/40 border border-border/50" data-testid={`detail-hotel-${i}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-mono text-muted-foreground w-5 text-right">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{h.name}</p>
                      <p className="text-xs text-muted-foreground">{h.type}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {h.rating != null && (
                      <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                        <IconStar className="w-3 h-3" /> {h.rating.toFixed(1)}
                      </span>
                    )}
                    <span className="text-sm font-semibold text-foreground whitespace-nowrap">
                      {h.priceMin != null && h.priceMax != null
                        ? `$${h.priceMin}–$${h.priceMax}`
                        : h.priceMin != null ? `$${h.priceMin}+` : "—"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {rates && rates.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Live OTA Rates (Tonight)</p>
          {rates.map((hotel, i) => (
            <div key={i} className="py-3 px-3 rounded-lg bg-muted/40 border border-border/50" data-testid={`detail-rate-${i}`}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-foreground">{hotel.name}</p>
                <span className="text-sm font-bold text-primary">{hotel.avgRate != null ? formatMoney(hotel.avgRate) : "—"} avg</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {hotel.rates.slice(0, MAX_OTA_CHANNELS_SHOWN).map((r, j) => (
                  <span key={j} className="px-2 py-0.5 rounded-md text-xs bg-primary/8 border border-primary/15 text-foreground">
                    {r.name}: ${r.rate}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-[10px] text-muted-foreground/60 text-right">Source: Xotelo Free API</div>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-muted/30 rounded-md p-3 text-center">
      <div className={`text-base font-bold font-display ${color ?? "text-foreground"}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="bg-muted/30 rounded-md px-3 py-2">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm font-medium text-foreground capitalize">{value ?? "—"}</p>
    </div>
  );
}

/**
 * Read-only preview of the canonical hospitality DD checklist that this
 * target would inherit if added to the portfolio as an acquisition
 * candidate. Per-property tracking (status, owner, vendor, cost,
 * findings) lives on the PropertyDetail "Due Diligence" tab and requires
 * a saved property record; finder targets are external listings that
 * don't have one yet.
 */
function DdPreviewPane() {
  // Read the live admin-edited template (not the code constant) so any
  // edits in Constants → Due Diligence Template show up here. Falls back
  // to a "loading" / "unavailable" message if the API is unreachable.
  const { data, isLoading, error } = useQuery<{ items: DdTemplateItemRow[] }>({
    queryKey: ["/api/dd-template"],
    queryFn: async () => {
      const res = await fetch("/api/dd-template", { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load DD template (${res.status})`);
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" data-testid="pane-dd">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-8" data-testid="pane-dd-error">
        <IconClipboardList className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Unable to load the due-diligence template</p>
      </div>
    );
  }

  const activeItems = data.items.filter((it) => !it.archived);
  const grouped = new Map<DdWorkstream, DdTemplateItemRow[]>();
  for (const item of activeItems) {
    const ws = item.workstream as DdWorkstream;
    const bucket = grouped.get(ws);
    if (bucket) {
      bucket.push(item);
    } else {
      grouped.set(ws, [item]);
    }
  }
  const liveVersion = activeItems[0]?.templateVersion ?? DD_TEMPLATE_VERSION;

  return (
    <div className="space-y-4" data-testid="pane-dd">
      <div className="rounded-lg border border-border/60 bg-muted/30 p-3 flex items-start gap-3">
        <IconClipboardList className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-foreground">Hospitality due-diligence template (v{liveVersion})</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add this target to the portfolio to start tracking status, owner, vendor, cost, and
            findings on every item below. The same canonical checklist seeds onto every
            acquisition target.
          </p>
        </div>
      </div>

      <div className="space-y-3" data-testid="dd-preview-workstreams">
        {Array.from(grouped.entries()).map(([ws, items]) => (
          <div
            key={ws}
            className="rounded-lg border border-border/60 p-3"
            data-testid={`dd-preview-workstream-${ws}`}
          >
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              {DD_WORKSTREAM_LABELS[ws]}
              <span className="ml-2 text-[10px] font-normal normal-case tracking-normal">
                ({items.length} items)
              </span>
            </p>
            <ul className="space-y-1">
              {items.map((item) => (
                <li
                  key={item.key}
                  className="flex items-start gap-2 text-sm"
                  data-testid={`dd-preview-item-${item.key}`}
                >
                  <span className="text-muted-foreground mt-1">•</span>
                  <span className="text-foreground">
                    {item.label}
                    {item.isStopGate && (
                      <span className="ml-2 text-[10px] uppercase font-semibold text-destructive">
                        Stop gate
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
