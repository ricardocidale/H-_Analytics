import { motion } from "framer-motion";
import { IconTarget, IconBuilding, IconStar } from "@/components/icons";
import { MarketRateBenchmark } from "@/components/property-research/MarketRateBenchmark";
import { ProvenanceBadge } from "@/components/property-research/ProvenanceBadge";
import { SourceCitations } from "@/components/property-research/SourceCitations";
import { PropertyStatus } from "@shared/constants";
import { useMarketContext } from "@/lib/api";
import { formatMoney } from "@/lib/financialEngine";
import { Loader2 } from "@/components/icons/themed-icons";
import {
  ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  BarChart, Bar, XAxis, YAxis, Tooltip, AreaChart, Area,
  PieChart, Pie, Cell, CartesianGrid,
} from "recharts";
import {
  COLORS, card, stagger, fadeUp,
  ChartTooltip, MetricCard, EmptySection, CapRateGauge, BenchmarkBanner,
} from "./research-chart-shared";

const MAX_OTA_CHANNELS_SHOWN = 6;

interface Competitor {
  name?: string;
  adr?: number;
  occupancy?: number;
  revpar?: number;
  roomCount?: number;
  quality?: number;
  reviewScore?: number;
}

interface SupplyPipelineItem {
  name?: string;
  rooms?: number;
  units?: number;
  status?: string;
}

interface DemandDriver {
  name?: string;
  driver?: string;
  distance?: string;
  impact?: number;
  impactScore?: number;
}

interface AdrProjection {
  year?: string;
  adr?: number;
  base?: number;
  upside?: number;
  downside?: number;
}

interface OccupancyRampPoint {
  month?: string;
  label?: string;
  occupancy?: number;
  value?: number;
}

interface DepartmentCost {
  name?: string;
  department?: string;
  labor?: number;
  other?: number;
  expenses?: number;
}

interface BenchmarkValue {
  value: number;
  source: string;
}

interface ResearchSourceItem {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
}

interface GroundedResearchResult {
  query?: string;
  answer?: string;
  fetchedAt?: string;
  sources?: ResearchSourceItem[];
}

interface MarketIntelligenceMeta {
  groundedResearch?: GroundedResearchResult[];
  errors?: string[];
  benchmarks?: {
    submarket?: string;
    revpar?: BenchmarkValue;
    adr?: BenchmarkValue;
    occupancy?: BenchmarkValue;
    capRate?: BenchmarkValue;
  };
}

interface ResearchTabContent {
  marketOverview?: {
    supplyPipeline?: SupplyPipelineItem[];
    demandDrivers?: DemandDriver[];
    positioning?: string;
  };
  competitiveSet?: { competitors?: Competitor[] };
  adrAnalysis?: {
    recommendedAdr?: number;
    confidence?: number;
    revpar?: number;
    projections?: AdrProjection[];
  };
  occupancyAnalysis?: {
    stabilizedOccupancy?: number;
    ramp?: OccupancyRampPoint[];
  };
  cateringAnalysis?: {
    foodAndBevRevenue?: number;
    cateringRevenue?: number;
  };
  eventDemand?: unknown;
  capRateAnalysis?: {
    recommendedCapRate?: number;
    capRate?: number;
    marketRange?: { low?: number; high?: number };
    rangeMin?: number;
    rangeMax?: number;
    sensitivity?: {
      capRateUp?: number;
      capRateDown?: number;
      adrUp?: number;
      adrDown?: number;
      occUp?: number;
      occDown?: number;
    };
    ltv?: number;
    dscr?: number;
    debtYield?: number;
  };
  landValueAllocation?: { ltv?: number; dscr?: number };
  operatingCosts?: {
    departments?: DepartmentCost[];
    roomsLabor?: number; roomsOther?: number;
    fbLabor?: number; fbOther?: number;
    adminLabor?: number; adminOther?: number;
    maintLabor?: number; maintOther?: number;
    mktLabor?: number; mktOther?: number;
    laborPct?: number; totalLabor?: number;
    utilitiesPct?: number; utilities?: number;
    costPerRoom?: number;
    laborPerKey?: number;
    staffingRatios?: Record<string, number | string>;
  };
  propertyValueCosts?: {
    propertyTax?: number;
    propertyTaxPct?: number;
  };
  _marketIntelligence?: MarketIntelligenceMeta;
}

function HotelCompSection({ location }: { location: string }) {
  const parts = location.split(",").map((s) => s.trim());
  const city = parts[0] || location;
  const state = parts[1];
  const { data: ctx, isLoading, error } = useMarketContext(city, state);

  if (isLoading) {
    return (
      <motion.div variants={fadeUp} className={`${card} p-6`}>
        <h3 className="font-display text-lg font-semibold mb-4 flex items-center gap-2">
          <IconBuilding className="w-5 h-5 text-primary" /> Hotel Comps
        </h3>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <span className="ml-2 text-sm text-muted-foreground">Loading hotel comps for {city}…</span>
        </div>
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div variants={fadeUp} className={`${card} p-6`}>
        <h3 className="font-display text-lg font-semibold mb-4 flex items-center gap-2">
          <IconBuilding className="w-5 h-5 text-primary" /> Hotel Comps
        </h3>
        <p className="text-sm text-muted-foreground" data-testid="hotel-comp-error">Unable to load hotel comp data for {city}. The market data service may be temporarily unavailable.</p>
      </motion.div>
    );
  }

  const snapshot = ctx?.hotelSnapshot;
  const rates = ctx?.topHotelRates;
  if (!snapshot && (!rates || rates.length === 0)) return null;

  return (
    <motion.div variants={fadeUp} className={`${card} p-6`}>
      <h3 className="font-display text-lg font-semibold mb-1 flex items-center gap-2">
        <IconBuilding className="w-5 h-5 text-primary" /> Hotel Comps — {snapshot?.location || city}
      </h3>
      <p className="text-xs text-muted-foreground mb-4">
        Live rate data from {snapshot?.sampleSize ?? 0} hotels via Xotelo
      </p>

      {snapshot && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <div className="bg-primary/5 rounded-xl p-3 border border-primary/10">
            <p className="text-xs text-muted-foreground">Hotels Tracked</p>
            <p className="text-lg font-bold text-foreground">{snapshot.sampleSize}</p>
          </div>
          <div className="bg-primary/5 rounded-xl p-3 border border-primary/10">
            <p className="text-xs text-muted-foreground">Avg Low</p>
            <p className="text-lg font-bold text-foreground">{snapshot.avgPriceMin != null ? formatMoney(snapshot.avgPriceMin) : "—"}</p>
          </div>
          <div className="bg-primary/5 rounded-xl p-3 border border-primary/10">
            <p className="text-xs text-muted-foreground">Avg High</p>
            <p className="text-lg font-bold text-foreground">{snapshot.avgPriceMax != null ? formatMoney(snapshot.avgPriceMax) : "—"}</p>
          </div>
          <div className="bg-primary/5 rounded-xl p-3 border border-primary/10">
            <p className="text-xs text-muted-foreground">Top Hotels</p>
            <p className="text-lg font-bold text-foreground">{snapshot.topHotels?.length ?? 0}</p>
          </div>
        </div>
      )}

      {snapshot?.topHotels && snapshot.topHotels.length > 0 && (
        <div className="space-y-2 mb-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Top Rated Hotels</p>
          {snapshot.topHotels.map((h, i) => (
            <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/40 border border-border/50" data-testid={`hotel-comp-${i}`}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-mono text-muted-foreground w-5 text-right">{i + 1}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{h.name}</p>
                  <p className="text-xs text-muted-foreground">{h.type}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 flex-shrink-0">
                {h.rating != null && (
                  <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                    <IconStar className="w-3 h-3" /> {h.rating.toFixed(1)}
                    {h.reviewCount != null && <span className="text-muted-foreground">({h.reviewCount.toLocaleString()})</span>}
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

      {rates && rates.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Live OTA Rates (Tonight)</p>
          {rates.map((hotel, i) => (
            <div key={i} className="py-3 px-3 rounded-lg bg-muted/40 border border-border/50" data-testid={`hotel-rate-${i}`}>
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
    </motion.div>
  );
}

export function MarketTab({ content, propertyLocation }: { content: ResearchTabContent; propertyLocation?: string }) {
  const mo = content?.marketOverview;
  const cs = content?.competitiveSet;
  if (!mo && !cs && !propertyLocation) return <EmptySection />;

  const compRadar = cs?.competitors?.slice(0, 6).map((c: Competitor) => ({
    subject: c.name?.slice(0, 14) || "Comp",
    ADR: c.adr ?? 0, Occupancy: c.occupancy ?? 0, RevPAR: c.revpar ?? 0,
    Rooms: c.roomCount ?? 0, Quality: c.quality ?? 50, Reviews: c.reviewScore ?? 50,
  })) || [];

  const supplyData = mo?.supplyPipeline?.map((s: SupplyPipelineItem, i: number) => ({
    name: s.name || `Pipeline ${i + 1}`, rooms: s.rooms ?? s.units ?? 0, status: s.status || PropertyStatus.PLANNED,
  })) || [];

  const drivers: DemandDriver[] = mo?.demandDrivers?.slice(0, 5) || [];

  return (
    <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-6">
      <motion.div variants={fadeUp}>
        <MarketRateBenchmark compact applicableRates={[]} />
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div variants={fadeUp} className={`${card} p-6`}>
          <h3 className="font-display text-lg font-semibold mb-4">Competitive Set Radar</h3>
          {compRadar.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={compRadar}>
                <PolarGrid stroke="hsl(var(--primary)/0.15)" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
                <Radar name="ADR" dataKey="ADR" stroke={COLORS[0]} fill={COLORS[0]} fillOpacity={0.2} />
                <Radar name="Occupancy" dataKey="Occupancy" stroke={COLORS[1]} fill={COLORS[1]} fillOpacity={0.15} />
                <Tooltip content={<ChartTooltip />} />
              </RadarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-muted-foreground">No competitive set data available.</p>}
        </motion.div>

        <motion.div variants={fadeUp} className={`${card} p-6`}>
          <h3 className="font-display text-lg font-semibold mb-4">Supply Pipeline</h3>
          {supplyData.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={supplyData} layout="vertical" margin={{ left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--primary)/0.08)" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={55} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="rooms" fill={COLORS[2]} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-muted-foreground">No supply pipeline data.</p>}
        </motion.div>
      </div>

      {drivers.length > 0 && (
        <motion.div variants={fadeUp}>
          <h3 className="font-display text-lg font-semibold mb-3">Demand Drivers</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {drivers.map((d: DemandDriver, i: number) => (
              <motion.div key={i} variants={fadeUp} className={`${card} p-4`}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${COLORS[i % COLORS.length]}22` }}>
                    <IconTarget className="w-4 h-4" style={{ color: COLORS[i % COLORS.length] }} />
                  </div>
                  <p className="text-sm font-semibold truncate">{d.name || d.driver || `Driver ${i + 1}`}</p>
                </div>
                {d.distance && <p className="text-xs text-muted-foreground">{d.distance}</p>}
                {(d.impact || d.impactScore) && (
                  <div className="mt-2 h-1.5 rounded-full bg-primary/10 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(d.impact ?? d.impactScore ?? 50)}%`, background: COLORS[i % COLORS.length] }} />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {mo?.positioning && (
        <motion.div variants={fadeUp} className={`${card} p-6`}>
          <h3 className="font-display text-lg font-semibold mb-2">Market Positioning</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{mo.positioning}</p>
        </motion.div>
      )}

      {propertyLocation && <HotelCompSection location={propertyLocation} />}
    </motion.div>
  );
}

export function RevenueTab({ content }: { content: ResearchTabContent }) {
  const adr = content?.adrAnalysis;
  const occ = content?.occupancyAnalysis;
  const cat = content?.cateringAnalysis;
  if (!adr && !occ && !cat) return <EmptySection />;

  const adrProj = adr?.projections?.map((p: AdrProjection, i: number) => ({
    year: p.year || `Y${i + 1}`, base: p.base ?? p.adr ?? 0,
    upside: p.upside ?? (p.base ?? p.adr ?? 0) * 1.1,
    downside: p.downside ?? (p.base ?? p.adr ?? 0) * 0.9,
  })) || (adr?.recommendedAdr ? [
    { year: "Y1", base: adr.recommendedAdr, upside: adr.recommendedAdr * 1.08, downside: adr.recommendedAdr * 0.92 },
    { year: "Y2", base: adr.recommendedAdr * 1.03, upside: adr.recommendedAdr * 1.12, downside: adr.recommendedAdr * 0.94 },
    { year: "Y3", base: adr.recommendedAdr * 1.06, upside: adr.recommendedAdr * 1.16, downside: adr.recommendedAdr * 0.95 },
  ] : []);

  const occRamp = occ?.ramp?.map((r: OccupancyRampPoint, i: number) => ({
    month: r.month || r.label || `M${i + 1}`, occupancy: r.occupancy ?? r.value ?? 0,
  })) || (occ?.stabilizedOccupancy ? [
    { month: "M1", occupancy: (occ.stabilizedOccupancy * 0.4) },
    { month: "M6", occupancy: (occ.stabilizedOccupancy * 0.7) },
    { month: "M12", occupancy: (occ.stabilizedOccupancy * 0.9) },
    { month: "M18", occupancy: occ.stabilizedOccupancy },
  ] : []);

  const mixData: { name: string; value: number }[] = [];
  if (adr?.recommendedAdr) mixData.push({ name: "Rooms", value: 65 });
  if (cat?.foodAndBevRevenue || cat?.cateringRevenue) mixData.push({ name: "F&B", value: 20 });
  if (content?.eventDemand) mixData.push({ name: "Events", value: 10 });
  if (mixData.length) mixData.push({ name: "Other", value: 100 - mixData.reduce((s, d) => s + d.value, 0) });

  return (
    <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-6">
      <BenchmarkBanner
        content={content}
        metrics={[
          { key: "adr", label: "ADR", format: (v) => `$${Math.round(v)}` },
          { key: "revpar", label: "RevPAR", format: (v) => `$${Math.round(v)}` },
          { key: "occupancy", label: "Occupancy", format: (v) => `${(v * 100).toFixed(1)}%` },
        ]}
      />

      <motion.div variants={stagger} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {adr?.recommendedAdr && <MetricCard label="Recommended ADR" value={`$${Math.round(adr.recommendedAdr)}`} sub={adr.confidence ? `${adr.confidence}% confidence` : undefined} />}
        {occ?.stabilizedOccupancy && <MetricCard label="Stabilized Occupancy" value={`${Math.round(occ.stabilizedOccupancy)}%`} />}
        {adr?.revpar && <MetricCard label="RevPAR" value={`$${Math.round(adr.revpar)}`} />}
        {cat?.cateringRevenue && <MetricCard label="Catering Revenue" value={`$${Math.round(cat.cateringRevenue / 1000)}K`} />}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div variants={fadeUp} className={`${card} p-6`}>
          <h3 className="font-display text-lg font-semibold mb-4">ADR Projection</h3>
          {adrProj.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={adrProj}>
                <defs>
                  <linearGradient id="adrGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS[0]} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={COLORS[0]} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--primary)/0.08)" />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="upside" stroke={COLORS[1]} fill={COLORS[1]} fillOpacity={0.08} strokeDasharray="4 2" name="Upside" />
                <Area type="monotone" dataKey="base" stroke={COLORS[0]} fill="url(#adrGrad)" strokeWidth={2} name="Base" />
                <Area type="monotone" dataKey="downside" stroke={COLORS[5]} fill={COLORS[5]} fillOpacity={0.06} strokeDasharray="4 2" name="Downside" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-muted-foreground">No ADR projection data.</p>}
        </motion.div>

        <motion.div variants={fadeUp} className={`${card} p-6`}>
          <h3 className="font-display text-lg font-semibold mb-4">Occupancy Ramp</h3>
          {occRamp.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={occRamp}>
                <defs>
                  <linearGradient id="occGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS[1]} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={COLORS[1]} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--primary)/0.08)" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="stepAfter" dataKey="occupancy" stroke={COLORS[1]} fill="url(#occGrad)" strokeWidth={2} name="Occupancy %" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-muted-foreground">No occupancy ramp data.</p>}
        </motion.div>
      </div>

      {mixData.length > 0 && (
        <motion.div variants={fadeUp} className={`${card} p-6`}>
          <h3 className="font-display text-lg font-semibold mb-4">Revenue Mix</h3>
          <div className="flex items-center justify-center gap-8">
            <ResponsiveContainer width={220} height={220}>
              <PieChart>
                <Pie data={mixData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={3} strokeWidth={0}>
                  {mixData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {mixData.map((d, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="text-muted-foreground">{d.name}</span>
                  <span className="font-semibold">{d.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

export function FinancialTab({ content }: { content: ResearchTabContent }) {
  const cap = content?.capRateAnalysis;
  const land = content?.landValueAllocation;
  if (!cap && !land) return <EmptySection />;

  const capValue = cap?.recommendedCapRate ?? cap?.capRate ?? 7.5;
  const capMin = cap?.marketRange?.low ?? cap?.rangeMin ?? capValue - 2;
  const capMax = cap?.marketRange?.high ?? cap?.rangeMax ?? capValue + 2;

  const sensFactors = [
    { factor: "Cap Rate +50bp", impact: -(cap?.sensitivity?.capRateUp ?? 8) },
    { factor: "Cap Rate -50bp", impact: cap?.sensitivity?.capRateDown ?? 10 },
    { factor: "ADR +5%", impact: cap?.sensitivity?.adrUp ?? 6 },
    { factor: "ADR -5%", impact: -(cap?.sensitivity?.adrDown ?? 5) },
    { factor: "Occupancy +3%", impact: cap?.sensitivity?.occUp ?? 4 },
    { factor: "Occupancy -3%", impact: -(cap?.sensitivity?.occDown ?? 3) },
  ];

  const holds = [5, 7];
  const exitCaps = [capValue - 0.5, capValue, capValue + 0.5];

  return (
    <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-6">
      <BenchmarkBanner
        content={content}
        metrics={[
          { key: "capRate", label: "Cap Rate", format: (v) => `${v.toFixed(1)}%` },
        ]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div variants={fadeUp} className={`${card} p-6 flex flex-col items-center`}>
          <h3 className="font-display text-lg font-semibold mb-4 self-start">Cap Rate</h3>
          <CapRateGauge value={capValue} min={capMin} max={capMax} />
          <p className="text-xs text-muted-foreground mt-2">Market range: {capMin.toFixed(1)}% – {capMax.toFixed(1)}%</p>
        </motion.div>

        <motion.div variants={fadeUp} className="lg:col-span-2 grid grid-cols-3 gap-4">
          <MetricCard label="LTV" value={`${cap?.ltv ?? land?.ltv ?? 65}%`} sub="Loan-to-Value" />
          <MetricCard label="DSCR" value={`${(cap?.dscr ?? land?.dscr ?? 1.35).toFixed(2)}x`} sub="Debt Service Coverage" />
          <MetricCard label="Debt Yield" value={`${(cap?.debtYield ?? 9.5).toFixed(1)}%`} sub="NOI / Loan Amount" />
        </motion.div>
      </div>

      <motion.div variants={fadeUp} className={`${card} p-6`}>
        <h3 className="font-display text-lg font-semibold mb-4">IRR Sensitivity</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={sensFactors} layout="vertical" margin={{ left: 90 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--primary)/0.08)" />
            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v > 0 ? "+" : ""}${v}%`} />
            <YAxis dataKey="factor" type="category" tick={{ fontSize: 11 }} width={85} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="impact" radius={[4, 4, 4, 4]} name="IRR Impact %">
              {sensFactors.map((d, i) => (
                <Cell key={i} fill={d.impact >= 0 ? COLORS[1] : COLORS[5]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </motion.div>

      <motion.div variants={fadeUp} className={`${card} p-6 overflow-x-auto`}>
        <h3 className="font-display text-lg font-semibold mb-4">Exit Scenarios</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-primary/10">
              <th className="text-left py-2 text-muted-foreground font-medium">Exit Cap Rate</th>
              {holds.map((h) => <th key={h} className="text-right py-2 text-muted-foreground font-medium">{h}-Year Hold</th>)}
            </tr>
          </thead>
          <tbody>
            {exitCaps.map((ec) => (
              <tr key={ec} className="border-b border-primary/5">
                <td className="py-2.5 font-medium">{ec.toFixed(1)}%</td>
                {holds.map((h) => {
                  const mult = (1 + (capValue / 100)) ** h / (ec / 100) * (capValue / 100);
                  return <td key={h} className="text-right py-2.5 font-mono">{mult.toFixed(2)}x</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </motion.div>
    </motion.div>
  );
}

export function OperatingTab({ content }: { content: ResearchTabContent }) {
  const ops = content?.operatingCosts;
  const pv = content?.propertyValueCosts;
  if (!ops && !pv) return <EmptySection />;

  const depts = ops?.departments?.map((d: DepartmentCost) => ({
    name: d.name || d.department, labor: d.labor ?? 0, other: d.other ?? d.expenses ?? 0,
  })) || (ops ? [
    { name: "Rooms", labor: ops.roomsLabor ?? 25, other: ops.roomsOther ?? 10 },
    { name: "F&B", labor: ops.fbLabor ?? 18, other: ops.fbOther ?? 12 },
    { name: "Admin", labor: ops.adminLabor ?? 10, other: ops.adminOther ?? 8 },
    { name: "Maint.", labor: ops.maintLabor ?? 6, other: ops.maintOther ?? 5 },
    { name: "Marketing", labor: ops.mktLabor ?? 3, other: ops.mktOther ?? 4 },
  ] : []);

  const costPie: { name: string; value: number }[] = [];
  if (ops?.laborPct || ops?.totalLabor) costPie.push({ name: "Labor", value: ops.laborPct ?? 45 });
  if (ops?.utilitiesPct || ops?.utilities) costPie.push({ name: "Utilities", value: ops.utilitiesPct ?? 8 });
  if (pv?.propertyTax) costPie.push({ name: "Property Tax", value: pv.propertyTaxPct ?? 7 });
  if (costPie.length) costPie.push({ name: "Other", value: Math.max(5, 100 - costPie.reduce((s, d) => s + d.value, 0)) });

  return (
    <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-6">
      <motion.div variants={stagger} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {ops?.costPerRoom && <MetricCard label="Cost per Room" value={`$${Math.round(ops.costPerRoom).toLocaleString()}`} />}
        {ops?.laborPerKey && <MetricCard label="Labor per Key" value={`$${Math.round(ops.laborPerKey).toLocaleString()}`} />}
        {pv?.propertyTax && <MetricCard label="Property Tax" value={`$${Math.round(pv.propertyTax).toLocaleString()}`} sub="Annual" />}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div variants={fadeUp} className={`${card} p-6`}>
          <h3 className="font-display text-lg font-semibold mb-4">USALI Department Costs</h3>
          {depts.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={depts} layout="vertical" margin={{ left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--primary)/0.08)" />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={55} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="labor" stackId="a" fill={COLORS[0]} name="Labor %" radius={[0, 0, 0, 0]} />
                <Bar dataKey="other" stackId="a" fill={COLORS[2]} name="Other %" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-muted-foreground">No department data.</p>}
        </motion.div>

        <motion.div variants={fadeUp} className={`${card} p-6`}>
          <h3 className="font-display text-lg font-semibold mb-4">Cost Composition</h3>
          {costPie.length ? (
            <div className="flex items-center justify-center gap-6">
              <ResponsiveContainer width={200} height={200}>
                <PieChart>
                  <Pie data={costPie} cx="50%" cy="50%" innerRadius={50} outerRadius={85} dataKey="value" paddingAngle={2} strokeWidth={0}>
                    {costPie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {costPie.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-muted-foreground">{d.name}</span>
                    <span className="font-semibold">{d.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <p className="text-sm text-muted-foreground">No cost data.</p>}
        </motion.div>
      </div>

      {ops?.staffingRatios && (
        <motion.div variants={fadeUp}>
          <h3 className="font-display text-lg font-semibold mb-3">Staffing Ratios</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(ops.staffingRatios).slice(0, 4).map(([k, v]) => (
              <MetricCard key={k} label={k.replace(/([A-Z])/g, " $1").trim()} value={typeof v === "number" ? v.toFixed(2) : String(v)} sub="per room" />
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

export function SourcesTab({ content }: { content: ResearchTabContent }) {
  const sources = content?._marketIntelligence?.groundedResearch || [];
  const benchmarkSource = content?._marketIntelligence?.benchmarks;
  const rateErrors = content?._marketIntelligence?.errors || [];

  const allSources: ResearchSourceItem[] = [];
  for (const result of sources) {
    if (result.sources) {
      allSources.push(...result.sources);
    }
  }

  const uniqueSources = allSources.filter(
    (s, i, arr) => arr.findIndex((a) => a.url === s.url) === i
  );

  return (
    <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-6">
      {benchmarkSource && (
        <motion.div variants={fadeUp} className={`${card} p-6`}>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="font-display text-lg font-semibold">Hospitality Benchmarks</h3>
            <ProvenanceBadge provenance="verified" />
          </div>
          <p className="text-sm text-muted-foreground">
            Submarket: {benchmarkSource.submarket}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
            {benchmarkSource.revpar && (
              <MetricCard label="RevPAR" value={`$${Math.round(benchmarkSource.revpar.value)}`} sub={benchmarkSource.revpar.source} />
            )}
            {benchmarkSource.adr && (
              <MetricCard label="ADR" value={`$${Math.round(benchmarkSource.adr.value)}`} sub={benchmarkSource.adr.source} />
            )}
            {benchmarkSource.occupancy && (
              <MetricCard label="Occupancy" value={`${(benchmarkSource.occupancy.value * 100).toFixed(1)}%`} sub={benchmarkSource.occupancy.source} />
            )}
            {benchmarkSource.capRate && (
              <MetricCard label="Cap Rate" value={`${benchmarkSource.capRate.value.toFixed(1)}%`} sub={benchmarkSource.capRate.source} />
            )}
          </div>
        </motion.div>
      )}

      {uniqueSources.length > 0 && (
        <motion.div variants={fadeUp} className={`${card} p-6`}>
          <SourceCitations sources={uniqueSources} title="Web Research Sources" />
        </motion.div>
      )}

      {sources.length > 0 && (
        <motion.div variants={fadeUp} className={`${card} p-6`}>
          <h3 className="font-display text-lg font-semibold mb-3">Research Queries</h3>
          <div className="space-y-4">
            {sources.map((result: GroundedResearchResult, i: number) => (
              <div key={i} className="p-4 rounded-xl bg-chart-1/10 dark:bg-chart-1/5 border border-chart-1/15 dark:border-chart-1/10">
                <div className="flex items-center gap-2 mb-2">
                  <ProvenanceBadge provenance="cited" />
                  <span className="text-xs text-muted-foreground">{result.fetchedAt ? new Date(result.fetchedAt).toLocaleDateString() : ""}</span>
                </div>
                <p className="text-sm font-medium text-foreground mb-1">{result.query}</p>
                {result.answer && (
                  <p className="text-xs text-muted-foreground line-clamp-4">{result.answer}</p>
                )}
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {!benchmarkSource && uniqueSources.length === 0 && sources.length === 0 && (
        <motion.div variants={fadeUp}>
          <EmptySection message="No external sources available. Regenerate research to fetch grounded data from FRED, STR, and web sources." />
        </motion.div>
      )}

      {rateErrors.length > 0 && (
        <motion.div variants={fadeUp} className={`${card} p-4`}>
          <p className="text-xs text-muted-foreground">
            Some data sources were unavailable: {rateErrors.join("; ")}
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}
