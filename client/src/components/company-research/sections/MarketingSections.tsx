import { motion } from "framer-motion";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell,
} from "recharts";
import { IconLayers, IconTrendingUp, IconUsers, IconTarget,
  IconBriefcase, IconMapPin, IconStar, IconShield, IconPieChart,
  IconGlobe, IconHotel, IconHeart, IconMountain, IconBed,
} from "@/components/icons";
import { EmptyState, MetricCard, SectionTitle, CustomTooltip, stagger } from "../shared";

export function GuestPersonas({ hasData, onGenerate }: { hasData: boolean; onGenerate: () => void }) {
  if (!hasData) return <EmptyState title="Guest Personas" description="Generate research to see guest persona segmentation and seasonal patterns." onGenerate={onGenerate} />;

  const personas = [
    { icon: IconBriefcase, name: "Corporate Retreats", desc: "Mid-size companies booking team offsites and strategy sessions", spend: "$320/night", booking: "3-5 months ahead", share: 30, color: "hsl(var(--chart-1))" },
    { icon: IconHeart, name: "Wellness Seekers", desc: "Individuals and couples focused on yoga, spa, and mindfulness retreats", spend: "$275/night", booking: "1-3 months ahead", share: 25, color: "hsl(var(--chart-2))" },
    { icon: IconStar, name: "Luxury Leisure", desc: "High-net-worth travelers seeking boutique, curated experiences", spend: "$450/night", booking: "2-6 months ahead", share: 20, color: "hsl(var(--chart-3))" },
    { icon: IconUsers, name: "Family Groups", desc: "Multi-generational families booking extended stays and group activities", spend: "$260/night", booking: "4-8 months ahead", share: 15, color: "hsl(var(--chart-4))" },
    { icon: IconMountain, name: "Adventure Travelers", desc: "Active guests seeking outdoor activities integrated with lodging", spend: "$210/night", booking: "2-4 weeks ahead", share: 10, color: "hsl(var(--chart-5))" },
  ];

  const pieData = personas.map(p => ({ name: p.name, value: p.share }));

  const heatmapMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const heatmapData = [
    [30, 35, 50, 65, 80, 90, 95, 92, 75, 60, 40, 35],
    [40, 45, 55, 70, 75, 85, 80, 78, 70, 55, 45, 50],
    [25, 30, 45, 60, 85, 95, 100, 98, 80, 55, 30, 28],
  ];
  const heatmapLabels = ["Corporate", "Wellness", "Leisure"];

  return (
    <motion.div variants={stagger.container} initial="hidden" animate="visible" className="space-y-6">
      <motion.div variants={stagger.item} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {personas.map((p, i) => (
          <motion.div key={p.name} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
            className="bg-card/80 backdrop-blur-xl rounded-xl border border-border p-5 hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${p.color}15` }}>
                <p.icon className="w-5 h-5" style={{ color: p.color }} />
              </div>
              <div>
                <h4 className="text-sm font-semibold font-display">{p.name}</h4>
                <span className="text-[10px] text-muted-foreground">{p.share}% of guests</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{p.desc}</p>
            <div className="flex gap-4 text-[10px]">
              <span><strong className="text-foreground">Avg Spend:</strong> {p.spend}</span>
              <span><strong className="text-foreground">Lead Time:</strong> {p.booking}</span>
            </div>
          </motion.div>
        ))}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <motion.div variants={stagger.item} className="bg-card/80 backdrop-blur-xl rounded-xl border border-border p-5">
          <SectionTitle icon={IconPieChart} title="Segment Mix" />
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={85} dataKey="value" paddingAngle={3} stroke="none">
                {pieData.map((_, i) => <Cell key={i} fill={personas[i].color} />)}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div variants={stagger.item} className="bg-card/80 backdrop-blur-xl rounded-xl border border-border p-5">
          <SectionTitle icon={IconBed} title="Seasonal Demand Heatmap" />
          <div className="space-y-2">
            <div className="flex gap-1 ml-20">
              {heatmapMonths.map(m => <span key={m} className="w-8 text-center text-[9px] text-muted-foreground">{m}</span>)}
            </div>
            {heatmapData.map((row, ri) => (
              <div key={ri} className="flex items-center gap-1">
                <span className="w-20 text-[10px] text-muted-foreground text-right pr-2">{heatmapLabels[ri]}</span>
                {row.map((val, ci) => (
                  <div key={ci} className="w-8 h-6 rounded" style={{ background: `hsl(var(--chart-1) / ${val / 100 * 0.8 + 0.1})` }} title={`${heatmapLabels[ri]} - ${heatmapMonths[ci]}: ${val}%`} />
                ))}
              </div>
            ))}
            <div className="flex items-center gap-2 mt-2 ml-20">
              <span className="text-[9px] text-muted-foreground">Low</span>
              <div className="flex gap-0.5">{[0.15, 0.3, 0.5, 0.7, 0.9].map(o => <div key={o} className="w-4 h-2 rounded-sm" style={{ background: `hsl(var(--chart-1) / ${o})` }} />)}</div>
              <span className="text-[9px] text-muted-foreground">High</span>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

export function CapitalInvestor({ hasData, onGenerate }: { hasData: boolean; onGenerate: () => void }) {
  if (!hasData) return <EmptyState title="Capital & Investor Profiles" description="Generate research to see investor archetypes and deal structure analysis." onGenerate={onGenerate} />;

  const archetypes = [
    { icon: IconBriefcase, name: "Private Equity", check: "$10-50M", hold: "3-7 yr", irr: "18-22%", color: "hsl(var(--chart-1))", desc: "Value-add strategies, active asset management, platform acquisitions" },
    { icon: IconHotel, name: "Family Offices", check: "$5-25M", hold: "7-10 yr", irr: "15%+", color: "hsl(var(--chart-2))", desc: "Patient capital, generational wealth, direct co-investment preferred" },
    { icon: IconHotel, name: "REITs", check: "$25M+", hold: "5+ yr", irr: "Yield", color: "hsl(var(--chart-3))", desc: "Scale acquisitions, portfolio fit, strong operational track record required" },
    { icon: IconStar, name: "Angel / HNW", check: "$500K-5M", hold: "5-10 yr", irr: "12-18%", color: "hsl(var(--chart-4))", desc: "Lifestyle assets, passion-driven, relationships over returns" },
    { icon: IconShield, name: "Debt Providers", check: "60-75% LTV", hold: "5-10 yr", irr: "6-9%", color: "hsl(var(--chart-5))", desc: "Banks, CMBS, SBA 504/7a, bridge lenders for transitional assets" },
  ];

  const capitalFlow = [
    { quarter: "Q1", pe: 120, family: 80, reit: 200, other: 50 },
    { quarter: "Q2", pe: 150, family: 90, reit: 180, other: 65 },
    { quarter: "Q3", pe: 180, family: 110, reit: 220, other: 70 },
    { quarter: "Q4", pe: 140, family: 100, reit: 250, other: 80 },
  ];

  const dealStructure = [
    { name: "Senior Debt", value: 60 }, { name: "Mezzanine", value: 15 }, { name: "Equity", value: 25 },
  ];

  return (
    <motion.div variants={stagger.container} initial="hidden" animate="visible" className="space-y-6">
      <motion.div variants={stagger.item} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {archetypes.map((a, i) => (
          <motion.div key={a.name} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
            className="bg-card/80 backdrop-blur-xl rounded-xl border border-border p-5 hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${a.color}15` }}>
                <a.icon className="w-5 h-5" style={{ color: a.color }} />
              </div>
              <h4 className="text-sm font-semibold font-display">{a.name}</h4>
            </div>
            <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{a.desc}</p>
            <div className="grid grid-cols-3 gap-2 text-[10px]">
              <div><span className="text-muted-foreground block">Check Size</span><span className="font-semibold">{a.check}</span></div>
              <div><span className="text-muted-foreground block">Hold Period</span><span className="font-semibold">{a.hold}</span></div>
              <div><span className="text-muted-foreground block">Target IRR</span><span className="font-semibold">{a.irr}</span></div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <motion.div variants={stagger.item} className="bg-card/80 backdrop-blur-xl rounded-xl border border-border p-5">
          <SectionTitle icon={IconTrendingUp} title="Capital Flow by Investor Type ($M)" />
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={capitalFlow}>
              <XAxis dataKey="quarter" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v}M`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="pe" name="PE" stackId="a" fill="hsl(var(--chart-1))" />
              <Bar dataKey="family" name="Family Office" stackId="a" fill="hsl(var(--chart-2))" />
              <Bar dataKey="reit" name="REIT" stackId="a" fill="hsl(var(--chart-3))" />
              <Bar dataKey="other" name="Other" stackId="a" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div variants={stagger.item} className="bg-card/80 backdrop-blur-xl rounded-xl border border-border p-5">
          <SectionTitle icon={IconPieChart} title="Typical Deal Structure" />
          <div className="flex items-center gap-6">
            <ResponsiveContainer width={200} height={200}>
              <PieChart>
                <Pie data={dealStructure} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3} stroke="none">
                  <Cell fill="hsl(var(--chart-1))" /><Cell fill="hsl(var(--chart-3))" /><Cell fill="hsl(var(--chart-2))" />
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-3">
              {dealStructure.map((d, i) => (
                <div key={d.name} className="flex items-center gap-2 text-xs">
                  <span className="w-3 h-3 rounded-full" style={{ background: ["hsl(var(--chart-1))", "hsl(var(--chart-3))", "hsl(var(--chart-2))"][i] }} />
                  <span className="text-muted-foreground">{d.name}</span>
                  <span className="font-bold">{d.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

export function MarketSizing({ content, hasData, onGenerate }: { content: any; hasData: boolean; onGenerate: () => void }) {
  if (!hasData) return <EmptyState title="Market Sizing" description="Generate research to see TAM/SAM/SOM analysis and regional breakdown." onGenerate={onGenerate} />;

  const funnel = [
    { label: "TAM", value: "$2.1T", sub: "Global hospitality market", width: 100, color: "hsl(var(--chart-1))" },
    { label: "SAM", value: "$85B", sub: "Boutique & lifestyle segment", width: 65, color: "hsl(var(--chart-5))" },
    { label: "SOM", value: "$1.2B", sub: "Addressable with current strategy", width: 35, color: "hsl(var(--chart-2))" },
  ];

  const regionalData = [
    { region: "Northeast US", value: 380, growth: 4.2 }, { region: "Southeast US", value: 290, growth: 5.8 },
    { region: "West Coast", value: 420, growth: 3.1 }, { region: "Mountain West", value: 180, growth: 7.2 },
    { region: "Caribbean", value: 150, growth: 6.5 }, { region: "Mexico", value: 120, growth: 8.1 },
  ];

  return (
    <motion.div variants={stagger.container} initial="hidden" animate="visible" className="space-y-6">
      <motion.div variants={stagger.item} className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard icon={IconGlobe} label="Global TAM" value="$2.1T" sub="2026 estimate" />
        <MetricCard icon={IconTarget} label="Segment SAM" value="$85B" sub="Boutique & lifestyle" />
        <MetricCard icon={IconTrendingUp} label="Growth CAGR" value="6.2%" sub="5-year projected" />
        <MetricCard icon={IconStar} label="Market Share Goal" value="0.14%" sub="SOM capture target" />
      </motion.div>

      <motion.div variants={stagger.item} className="bg-card/80 backdrop-blur-xl rounded-xl border border-border p-6">
        <SectionTitle icon={IconLayers} title="Market Funnel" />
        <div className="flex flex-col items-center gap-3 py-4">
          {funnel.map((f, i) => (
            <motion.div key={f.label} initial={{ opacity: 0, scaleX: 0.5 }} animate={{ opacity: 1, scaleX: 1 }} transition={{ delay: i * 0.15, duration: 0.5 }}
              className="rounded-xl flex items-center justify-between px-6 py-3" style={{ width: `${f.width}%`, background: `${f.color}15`, border: `1px solid ${f.color}30` }}>
              <div>
                <span className="text-xs font-bold" style={{ color: f.color }}>{f.label}</span>
                <p className="text-[10px] text-muted-foreground">{f.sub}</p>
              </div>
              <span className="text-lg font-bold font-display" style={{ color: f.color }}>{f.value}</span>
            </motion.div>
          ))}
        </div>
      </motion.div>

      <motion.div variants={stagger.item} className="bg-card/80 backdrop-blur-xl rounded-xl border border-border p-5">
        <SectionTitle icon={IconMapPin} title="Regional Market Size ($M Revenue)" />
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={regionalData}>
            <defs>
              <linearGradient id="gradRegion" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.9} /><stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.4} /></linearGradient>
            </defs>
            <XAxis dataKey="region" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v}M`} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="value" name="Market Size" fill="url(#gradRegion)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </motion.div>
    </motion.div>
  );
}

export function RegionalOpportunities({ hasData, onGenerate }: { hasData: boolean; onGenerate: () => void }) {
  if (!hasData) return <EmptyState title="Regional Opportunities" description="Generate research to see regional opportunity scoring and analysis." onGenerate={onGenerate} />;

  const regions = [
    { name: "Hudson Valley, NY", score: 92, revpar: "$185", supply: "Low", demand: "High", color: "hsl(var(--chart-2))" },
    { name: "Catskills, NY", score: 88, revpar: "$165", supply: "Low", demand: "High", color: "hsl(var(--chart-2))" },
    { name: "Berkshires, MA", score: 85, revpar: "$195", supply: "Moderate", demand: "High", color: "hsl(var(--chart-1))" },
    { name: "Asheville, NC", score: 82, revpar: "$155", supply: "Moderate", demand: "High", color: "hsl(var(--chart-1))" },
    { name: "Sedona, AZ", score: 78, revpar: "$220", supply: "Moderate", demand: "Moderate", color: "hsl(var(--chart-3))" },
    { name: "Tulum, MX", score: 75, revpar: "$140", supply: "High", demand: "High", color: "hsl(var(--chart-3))" },
    { name: "Joshua Tree, CA", score: 72, revpar: "$175", supply: "Moderate", demand: "Moderate", color: "hsl(var(--chart-3))" },
    { name: "Big Sur, CA", score: 68, revpar: "$280", supply: "Low", demand: "Moderate", color: "hsl(var(--chart-4))" },
  ];

  return (
    <motion.div variants={stagger.container} initial="hidden" animate="visible">
      <SectionTitle icon={IconMapPin} title="Regional Opportunity Scoring" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {regions.map((r, i) => (
          <motion.div key={r.name} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
            className="bg-card/80 backdrop-blur-xl rounded-xl border border-border p-4 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold font-display">{r.name}</h4>
              <span className="text-lg font-bold" style={{ color: r.color }}>{r.score}</span>
            </div>
            <div className="w-full h-2 bg-muted rounded-full mb-3 overflow-hidden">
              <motion.div initial={{ width: 0 }} animate={{ width: `${r.score}%` }} transition={{ delay: i * 0.06 + 0.3, duration: 0.6 }}
                className="h-full rounded-full" style={{ background: r.color }} />
            </div>
            <div className="grid grid-cols-3 gap-1 text-[10px]">
              <div><span className="text-muted-foreground block">RevPAR</span><span className="font-semibold">{r.revpar}</span></div>
              <div><span className="text-muted-foreground block">Supply</span><span className="font-semibold">{r.supply}</span></div>
              <div><span className="text-muted-foreground block">Demand</span><span className="font-semibold">{r.demand}</span></div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
