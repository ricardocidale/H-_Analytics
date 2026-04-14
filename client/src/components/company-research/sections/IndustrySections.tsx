import { motion } from "framer-motion";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  LineChart, Line,
} from "recharts";
import {
  IconDollarSign, IconPercent, IconLayers, IconTrendingUp, IconUsers,
  IconTarget, IconBuilding2, IconGlobe, IconZap, IconBed, IconBarChart2,
  IconHeart, IconShield,
} from "@/components/icons";
import { EmptyState, MetricCard, SectionTitle, CustomTooltip, stagger } from "../shared";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function HospitalityOverview({ content, hasData, onGenerate }: { content: any; hasData: boolean; onGenerate: () => void }) {
  if (!hasData) return <EmptyState title="Hospitality Overview" description="Generate research to see industry KPIs and investment sentiment." onGenerate={onGenerate} />;

  const yoyData = [
    { metric: "RevPAR", current: 128, prior: 118 }, { metric: "ADR", current: 185, prior: 172 },
    { metric: "Occupancy", current: 69, prior: 65 }, { metric: "Transaction Vol", current: 42, prior: 38 },
  ];

  const sentimentAngle = 135;

  return (
    <motion.div variants={stagger.container} initial="hidden" animate="visible" className="space-y-6">
      <motion.div variants={stagger.item} className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard icon={IconBed} label="RevPAR Index" value="$128" sub="+8.5% YoY" />
        <MetricCard icon={IconDollarSign} label="Transaction Volume" value="$42B" sub="+10.5% YoY" />
        <MetricCard icon={IconPercent} label="Avg Cap Rate" value="7.2%" sub="Down 30bps" />
        <MetricCard icon={IconBarChart2} label="Occupancy" value="69.2%" sub="+4.0pp YoY" />
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <motion.div variants={stagger.item} className="bg-card/80 backdrop-blur-xl rounded-xl border border-border p-5">
          <SectionTitle icon={IconBarChart2} title="Year-over-Year Comparison" />
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={yoyData}>
              <XAxis dataKey="metric" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="prior" name="Prior Year" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} barSize={20} />
              <Bar dataKey="current" name="Current Year" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div variants={stagger.item} className="bg-card/80 backdrop-blur-xl rounded-xl border border-border p-5 flex flex-col items-center justify-center">
          <SectionTitle icon={IconTarget} title="Investment Sentiment" />
          <svg viewBox="0 0 200 120" className="w-48 h-28 mt-2">
            <defs>
              <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="hsl(var(--destructive))" /><stop offset="50%" stopColor="hsl(var(--warning))" /><stop offset="100%" stopColor="hsl(var(--success))" />
              </linearGradient>
            </defs>
            <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="hsl(var(--border))" strokeWidth="14" strokeLinecap="round" />
            <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="url(#gaugeGrad)" strokeWidth="14" strokeLinecap="round" strokeDasharray="251" strokeDashoffset={251 - (sentimentAngle / 180) * 251} />
            <line x1="100" y1="100" x2={100 + 55 * Math.cos(Math.PI - (sentimentAngle / 180) * Math.PI)} y2={100 - 55 * Math.sin(Math.PI - (sentimentAngle / 180) * Math.PI)}
              stroke="hsl(var(--foreground))" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="100" cy="100" r="5" fill="hsl(var(--foreground))" />
            <text x="20" y="116" className="fill-muted-foreground text-[8px]">Bearish</text>
            <text x="88" y="78" className="fill-muted-foreground text-[8px]">Neutral</text>
            <text x="155" y="116" className="fill-muted-foreground text-[8px]">Bullish</text>
          </svg>
          <p className="text-sm font-semibold font-display mt-2 text-primary">Moderately Bullish</p>
          <p className="text-[10px] text-muted-foreground">Based on cap rate compression and transaction velocity</p>
        </motion.div>
      </div>
    </motion.div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function SupplyDemand({ content, hasData, onGenerate }: { content: any; hasData: boolean; onGenerate: () => void }) {
  if (!hasData) return <EmptyState title="Supply & Demand" description="Generate research to see construction pipeline and absorption analysis." onGenerate={onGenerate} />;

  const pipelineData = [
    { year: "2024", luxury: 12, upscale: 28, midscale: 45, economy: 20 },
    { year: "2025", luxury: 15, upscale: 32, midscale: 50, economy: 18 },
    { year: "2026", luxury: 18, upscale: 35, midscale: 42, economy: 15 },
    { year: "2027", luxury: 14, upscale: 30, midscale: 38, economy: 12 },
  ];

  const absorptionData = [
    { month: "Jan", rate: 2.1 }, { month: "Mar", rate: 2.4 }, { month: "May", rate: 3.2 },
    { month: "Jul", rate: 3.8 }, { month: "Sep", rate: 3.5 }, { month: "Nov", rate: 2.8 },
  ];

  return (
    <motion.div variants={stagger.container} initial="hidden" animate="visible" className="space-y-6">
      <motion.div variants={stagger.item} className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <MetricCard icon={IconBuilding2} label="Rooms Under Construction" value="198K" sub="US market" />
        <MetricCard icon={IconTrendingUp} label="Absorption Rate" value="3.2%" sub="Current quarter" />
        <MetricCard icon={IconPercent} label="Supply Growth" value="1.8%" sub="YoY new rooms" />
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <motion.div variants={stagger.item} className="bg-card/80 backdrop-blur-xl rounded-xl border border-border p-5">
          <SectionTitle icon={IconBuilding2} title="Construction Pipeline (000s Rooms)" />
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={pipelineData}>
              <XAxis dataKey="year" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="economy" name="Economy" stackId="a" fill="hsl(var(--muted-foreground))" />
              <Bar dataKey="midscale" name="Midscale" stackId="a" fill="hsl(var(--chart-3))" />
              <Bar dataKey="upscale" name="Upscale" stackId="a" fill="hsl(var(--chart-1))" />
              <Bar dataKey="luxury" name="Luxury" stackId="a" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div variants={stagger.item} className="bg-card/80 backdrop-blur-xl rounded-xl border border-border p-5">
          <SectionTitle icon={IconTrendingUp} title="Absorption Rate Trend" />
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={absorptionData}>
              <defs>
                <linearGradient id="gradAbsorb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} /><stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0} /></linearGradient>
              </defs>
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="rate" name="Absorption %" stroke="hsl(var(--chart-2))" strokeWidth={2.5} dot={{ r: 4, fill: "hsl(var(--chart-2))" }} />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>
      </div>
    </motion.div>
  );
}

export function EconomicClimate({ hasData, onGenerate }: { hasData: boolean; onGenerate: () => void }) {
  if (!hasData) return <EmptyState title="Economic Climate" description="Generate research to see macroeconomic indicators affecting hospitality." onGenerate={onGenerate} />;

  const macroData = [
    { period: "Q1'25", interestRate: 5.25, cpi: 3.1, travelIndex: 108 },
    { period: "Q2'25", interestRate: 5.0, cpi: 2.9, travelIndex: 112 },
    { period: "Q3'25", interestRate: 4.75, cpi: 2.7, travelIndex: 118 },
    { period: "Q4'25", interestRate: 4.5, cpi: 2.5, travelIndex: 115 },
    { period: "Q1'26", interestRate: 4.25, cpi: 2.4, travelIndex: 120 },
  ];

  return (
    <motion.div variants={stagger.container} initial="hidden" animate="visible" className="space-y-6">
      <motion.div variants={stagger.item} className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard icon={IconPercent} label="Fed Funds Rate" value="4.25%" sub="Trending down" />
        <MetricCard icon={IconTrendingUp} label="CPI (YoY)" value="2.4%" sub="Approaching target" />
        <MetricCard icon={IconUsers} label="Hospitality Jobs" value="+42K" sub="Monthly additions" />
        <MetricCard icon={IconGlobe} label="Travel Index" value="120" sub="Above pre-pandemic" />
      </motion.div>

      <motion.div variants={stagger.item} className="bg-card/80 backdrop-blur-xl rounded-xl border border-border p-5">
        <SectionTitle icon={IconTrendingUp} title="Macroeconomic Indicators" />
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={macroData}>
            <XAxis dataKey="period" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
            <Tooltip content={<CustomTooltip />} />
            <Line yAxisId="left" type="monotone" dataKey="interestRate" name="Interest Rate" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ r: 3 }} />
            <Line yAxisId="left" type="monotone" dataKey="cpi" name="CPI" stroke="hsl(var(--warning))" strokeWidth={2} dot={{ r: 3 }} />
            <Line yAxisId="right" type="monotone" dataKey="travelIndex" name="Travel Index" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
        <div className="flex items-center justify-center gap-6 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-destructive rounded" />Interest Rate (L)</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-accent-pop rounded" />CPI (L)</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-line-3 rounded" />Travel Index (R)</span>
        </div>
      </motion.div>

      <motion.div variants={stagger.item} className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-card/80 backdrop-blur-xl rounded-xl border border-border p-5">
          <SectionTitle icon={IconUsers} title="Labor Market Outlook" />
          <div className="space-y-3">
            {[
              { label: "Hospitality Unemployment", value: "4.8%", trend: "Declining" },
              { label: "Avg Hourly Wage Growth", value: "+5.2%", trend: "Accelerating" },
              { label: "Open Positions (Industry)", value: "1.2M", trend: "Stabilizing" },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                <span className="text-xs text-muted-foreground">{item.label}</span>
                <div className="text-right">
                  <span className="text-sm font-semibold">{item.value}</span>
                  <span className="text-[10px] text-muted-foreground ml-2">{item.trend}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card/80 backdrop-blur-xl rounded-xl border border-border p-5">
          <SectionTitle icon={IconShield} title="Lending Environment" />
          <div className="space-y-3">
            {[
              { label: "CMBS Spreads", value: "185bps", trend: "Tightening" },
              { label: "Bank Lending Standards", value: "Moderate", trend: "Easing" },
              { label: "Construction Financing", value: "65% LTC", trend: "Stable" },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                <span className="text-xs text-muted-foreground">{item.label}</span>
                <div className="text-right">
                  <span className="text-sm font-semibold">{item.value}</span>
                  <span className="text-[10px] text-muted-foreground ml-2">{item.trend}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function TrendsInnovation({ hasData, onGenerate }: { hasData: boolean; onGenerate: () => void }) {
  if (!hasData) return <EmptyState title="Trends & Innovation" description="Generate research to see emerging trends and technology adoption in hospitality." onGenerate={onGenerate} />;

  const trends = [
    { icon: IconZap, title: "AI-Powered Revenue Management", impact: "High", adoption: 45, desc: "Dynamic pricing engines using ML to optimize RevPAR across seasons and segments" },
    { icon: IconHeart, title: "Wellness Integration", impact: "High", adoption: 60, desc: "Properties embedding wellness into core experience — not just a spa add-on" },
    { icon: IconGlobe, title: "Sustainable Operations", impact: "Medium", adoption: 55, desc: "ESG reporting, carbon-neutral targets, and green certifications driving guest preference" },
    { icon: IconUsers, title: "Bleisure & Remote Work", impact: "High", adoption: 70, desc: "Extended stays blending business and leisure — co-working spaces in lobbies" },
    { icon: IconLayers, title: "Modular Construction", impact: "Medium", adoption: 25, desc: "Prefabricated hotel modules reducing build time by 40% and costs by 20%" },
    { icon: IconShield, title: "Cybersecurity & Data Privacy", impact: "High", adoption: 35, desc: "PCI-DSS 4.0, guest data governance, and ransomware prevention protocols" },
  ];

  return (
    <motion.div variants={stagger.container} initial="hidden" animate="visible">
      <SectionTitle icon={IconZap} title="Emerging Trends & Technology" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {trends.map((t, i) => (
          <motion.div key={t.title} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
            className="bg-card/80 backdrop-blur-xl rounded-xl border border-border p-5 hover:shadow-lg transition-shadow">
            <div className="flex items-center gap-3 mb-3">
              <t.icon className="w-5 h-5 text-primary" />
              <h4 className="text-sm font-semibold font-display flex-1">{t.title}</h4>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${t.impact === "High" ? "text-primary bg-primary/10" : "text-accent-pop bg-accent-pop/10"}`}>{t.impact}</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{t.desc}</p>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">Adoption:</span>
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${t.adoption}%` }} transition={{ delay: i * 0.07 + 0.3, duration: 0.5 }}
                  className="h-full bg-primary rounded-full" />
              </div>
              <span className="text-[10px] font-semibold">{t.adoption}%</span>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
