import { formatMoney } from "@/lib/financialEngine";
import type { MarketContextResponse } from "@/lib/api/types";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconBuilding2 } from "@/components/icons";

interface Props {
  data: MarketContextResponse | undefined;
  isLoading: boolean;
  location: string;
}

export function MarketContextPanel({ data, isLoading, location }: Props) {
  if (isLoading) {
    return (
      <div className="bg-card rounded-lg shadow-sm border border-border p-6" data-testid="panel-market-context-loading">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading hotel market data for {location}...</span>
        </div>
      </div>
    );
  }

  if (!data || (!data.hotelSnapshot && !data.regionalMedians && data.topHotelRates.length === 0)) {
    return null;
  }

  const { hotelSnapshot, topHotelRates, regionalMedians } = data;

  return (
    <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden" data-testid="panel-market-context">
      <div className="h-1 bg-gradient-to-r from-primary via-primary/60 to-primary/30" />
      <div className="p-5 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
            <IconBuilding2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-display font-bold text-foreground text-sm">Hotel Market Context</h3>
            <p className="text-xs text-muted-foreground">Live comp data for conversion analysis</p>
          </div>
        </div>

        {hotelSnapshot && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <MetricCard
                label="Hotels Tracked"
                value={String(hotelSnapshot.sampleSize)}
                testId="text-hotel-count"
              />
              <MetricCard
                label="Avg Nightly Low"
                value={hotelSnapshot.avgPriceMin ? formatMoney(hotelSnapshot.avgPriceMin) : "—"}
                testId="text-avg-low"
              />
              <MetricCard
                label="Avg Nightly High"
                value={hotelSnapshot.avgPriceMax ? formatMoney(hotelSnapshot.avgPriceMax) : "—"}
                testId="text-avg-high"
              />
            </div>

            {hotelSnapshot.topHotels.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Top Comparable Hotels</p>
                <div className="space-y-1.5">
                  {hotelSnapshot.topHotels.map((hotel, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-xs bg-muted/30 rounded-md px-3 py-2"
                      data-testid={`row-hotel-comp-${i}`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-foreground font-medium truncate">{hotel.name}</span>
                        {hotel.rating && (
                          <span className="text-amber-500 flex-shrink-0">★ {hotel.rating.toFixed(1)}</span>
                        )}
                      </div>
                      <div className="text-muted-foreground flex-shrink-0 ml-2">
                        {hotel.priceMin && hotel.priceMax
                          ? `${formatMoney(hotel.priceMin)}–${formatMoney(hotel.priceMax)}/night`
                          : hotel.type}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {topHotelRates.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Live Rates (Tonight)
            </p>
            <div className="space-y-2">
              {topHotelRates.map((hotel, i) => (
                <div key={i} className="bg-muted/30 rounded-md px-3 py-2" data-testid={`row-live-rate-${i}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-foreground truncate">{hotel.name}</span>
                    {hotel.avgRate && (
                      <span className="text-xs font-semibold text-primary">{formatMoney(hotel.avgRate)} avg</span>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {hotel.rates.map((r, j) => (
                      <span
                        key={j}
                        className="inline-flex items-center gap-1 text-[11px] bg-background rounded px-2 py-0.5 border border-border"
                      >
                        <span className="text-muted-foreground">{r.name}:</span>
                        <span className="font-medium text-foreground">{formatMoney(r.rate)}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {regionalMedians && regionalMedians.medians.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Regional Median Listing Prices
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {regionalMedians.medians.slice(0, 8).map((m, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-xs bg-muted/30 rounded px-2.5 py-1.5"
                  data-testid={`row-median-${i}`}
                >
                  <span className="text-muted-foreground truncate">{m.city}, {m.stateCode}</span>
                  <span className="font-medium text-foreground ml-1">{formatMoney(m.medianListingPrice)}</span>
                </div>
              ))}
            </div>
            {regionalMedians.avgMedian && (
              <div className="mt-2 text-xs text-center text-muted-foreground">
                Regional average: <span className="font-semibold text-foreground" data-testid="text-regional-avg">{formatMoney(regionalMedians.avgMedian)}</span>
              </div>
            )}
          </div>
        )}

        <div className="text-[10px] text-muted-foreground/60 text-right">
          Sources: Xotelo (Booking.com, Agoda, Trip.com, Vio.com) · Realtor.com
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="bg-muted/30 rounded-md p-3 text-center">
      <div className="text-lg font-bold font-display text-foreground" data-testid={testId}>{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}
