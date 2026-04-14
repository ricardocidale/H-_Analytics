import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell, Treemap, AreaChart, Area,
  ScatterChart, Scatter, RadarChart, Radar,
  PolarGrid, PolarAngleAxis,
} from "recharts";
import {
  IconDollarSign, IconPercent, IconLayers, IconTrendingUp, IconUsers,
  IconTarget, IconPackage, IconShield, IconStar, IconZap,
  IconPieChart, IconBarChart2,
} from "@/components/icons";
import { EmptyState, MetricCard, SectionTitle, CustomTooltip, stagger, PIE_COLORS } from "../shared";

export function RevenueFees({ content, hasData, onGenerate }: { content: any; hasData: boolean; onGenerate: () => void }) {
  if (!hasData || !content?.managementFees) return <EmptyState title="Revenue & Fee Benchmarks" description="Generate research to see fee structures and revenue analysis." onGenerate={onGenerate} />;

  const fees = content.managementFees;
  const benchmarks = content.industryBenchmarks;
  const feeOverTime = useMemo(() => Array.from({ length: 5 }, (_, i) => ({
    year: `Year ${i + 1}`,
    baseFee: (fees?.baseFeeRange?.[0] ?? 3) + i * 0.1,
    incentiveFee: (fees?.incentiveFeeRange?.[0] ?? 8) + i * 0.3,
  })), [fees]);

  const benchmarkBars = useMemo(() => [
    { name: "Base Fee", company: fees?.baseFeeRange?.[1] ?? 4, industry: benchmarks?.avgBaseFee ?? 3.5 },
    { name: "Incentive", company: fees?.incentiveFeeRange?.[1] ?? 12, industry: benchmarks?.avgIncentiveFee ?? 10 },
    { name: "Total Fee", company: (fees?.baseFeeRange?.[1] ?? 4) + (fees?.incentiveFeeRange?.[1] ?? 12), industry: (benchmarks?.avgBaseFee ?? 3.5) + (benchmarks?.avgIncentiveFee ?? 10) },
  ], [fees, benchmarks]);

  const serviceBreakdown = [
    { name: "Base Mgmt Fee", value: 40 }, { name: "Incentive Fee", value: 25 },
    { name: "Accounting", value: 15 }, { name: "Technology & Reservations", value: 10 }, { name: "Procurement", value: 10 },
  ];

  return (
    <motion.div variants={stagger.container} initial="hidden" animate="visible" className="space-y-6">
      <motion.div variants={stagger.item} className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-card/80 backdrop-blur-xl rounded-xl border border-border p-5">
          <SectionTitle icon={IconDollarSign} title="Fee Revenue Over Time" />
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={feeOverTime}>
              <defs>
                <linearGradient id="gradBase" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.9} /><stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.5} /></linearGradient>
                <linearGradient id="gradIncentive" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.9} /><stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0.5} /></linearGradient>
              </defs>
              <XAxis dataKey="year" tick={{ fontSize: 11 }} stroke="hsl(var(--foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--foreground))" tickFormatter={v => `${v}%`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="baseFee" name="Base Fee %" stackId="a" fill="url(#gradBase)" radius={[0, 0, 0, 0]} />
              <Bar dataKey="incentiveFee" name="Incentive Fee %" stackId="a" fill="url(#gradIncentive)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card/80 backdrop-blur-xl rounded-xl border border-border p-5">
          <SectionTitle icon={IconPercent} title="Fee Benchmark Comparison" />
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={benchmarkBars} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={80} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="company" name="Company" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} barSize={14} />
              <Bar dataKey="industry" name="Industry Avg" fill="hsl(var(--muted-foreground))" radius={[0, 4, 4, 0]} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      <motion.div variants={stagger.item} className="bg-card/80 backdrop-blur-xl rounded-xl border border-border p-5">
        <SectionTitle icon={IconPieChart} title="Service Revenue Breakdown" />
        <div className="flex flex-col md:flex-row items-center gap-6">
          <ResponsiveContainer width={220} height={220}>
            <PieChart>
              <Pie data={serviceBreakdown} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={3} stroke="none">
                {serviceBreakdown.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-3">
            {serviceBreakdown.map((s, i) => (
              <div key={s.name} className="flex items-center gap-2 text-xs">
                <span className="w-3 h-3 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                <span className="text-muted-foreground">{s.name}</span>
                <span className="font-semibold">{s.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function CostStructure({ content, hasData, onGenerate }: { content: any; hasData: boolean; onGenerate: () => void }) {
  if (!hasData) return <EmptyState title="Cost Structure Analysis" description="Generate research to see overhead allocation and staffing benchmarks." onGenerate={onGenerate} />;

  const treemapData = [
    { name: "Salaries", size: 42, fill: "hsl(var(--chart-1))" }, { name: "Benefits", size: 12, fill: "hsl(var(--chart-5))" },
    { name: "Technology", size: 14, fill: "hsl(var(--chart-2))" }, { name: "Office/Admin", size: 10, fill: "hsl(var(--chart-3))" },
    { name: "Travel", size: 6, fill: "hsl(var(--accent-pop))" },
    { name: "Professional Svcs", size: 5, fill: "hsl(var(--chart-4))" }, { name: "Other", size: 3, fill: "hsl(var(--muted-foreground))" },
  ];

  const staffingData = Array.from({ length: 5 }, (_, i) => ({
    year: `Year ${i + 1}`,
    staffing: 280000 + i * 45000,
    overhead: 120000 + i * 15000,
  }));

  return (
    <motion.div variants={stagger.container} initial="hidden" animate="visible" className="space-y-6">
      <motion.div variants={stagger.item} className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard icon={IconUsers} label="Cost per Property" value="$48K" sub="Annual overhead allocation" />
        <MetricCard icon={IconPercent} label="Staff-to-Revenue" value="38%" sub="Below 40% benchmark" />
        <MetricCard icon={IconLayers} label="G&A Ratio" value="12.5%" sub="Industry avg: 14%" />
        <MetricCard icon={IconTrendingUp} label="Efficiency Score" value="A-" sub="Top quartile" />
      </motion.div>

      <motion.div variants={stagger.item} className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-card/80 backdrop-blur-xl rounded-xl border border-border p-5">
          <SectionTitle icon={IconLayers} title="Overhead Allocation" />
          <ResponsiveContainer width="100%" height={260}>
            <Treemap data={treemapData} dataKey="size" nameKey="name" stroke="hsl(var(--background))">
              <Tooltip content={<CustomTooltip />} />
            </Treemap>
          </ResponsiveContainer>
        </div>

        <div className="bg-card/80 backdrop-blur-xl rounded-xl border border-border p-5">
          <SectionTitle icon={IconUsers} title="Staffing Cost Trajectory" />
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={staffingData}>
              <defs>
                <linearGradient id="gradStaff" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} /><stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.02} /></linearGradient>
                <linearGradient id="gradOH" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} /><stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0.02} /></linearGradient>
              </defs>
              <XAxis dataKey="year" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="stepAfter" dataKey="staffing" name="Staffing" stroke="hsl(var(--chart-1))" fill="url(#gradStaff)" strokeWidth={2} />
              <Area type="stepAfter" dataKey="overhead" name="Overhead" stroke="hsl(var(--chart-2))" fill="url(#gradOH)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </motion.div>
    </motion.div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function VendorIntelligence({ content, hasData, onGenerate }: { content: any; hasData: boolean; onGenerate: () => void }) {
  if (!hasData) return <EmptyState title="Vendor Intelligence" description="Generate research to see make-vs-buy analysis and vendor benchmarks." onGenerate={onGenerate} />;

  const matrix = [
    { service: "Accounting", make: 85, buy: 65, decision: "Make", color: "text-primary bg-primary/10" },
    { service: "Technology & Reservations", make: 60, buy: 80, decision: "Buy", color: "text-chart-1 bg-chart-1/10" },
    { service: "Revenue Mgmt", make: 70, buy: 75, decision: "Buy", color: "text-chart-1 bg-chart-1/10" },
    { service: "HR/Payroll", make: 55, buy: 85, decision: "Buy", color: "text-chart-1 bg-chart-1/10" },
    { service: "Procurement", make: 80, buy: 60, decision: "Make", color: "text-primary bg-primary/10" },
    { service: "Marketing", make: 65, buy: 70, decision: "Hybrid", color: "text-accent-pop bg-accent-pop/10" },
  ];

  const vendorBenchmarks = [
    { name: "PMS", cost: 12, industry: 15 }, { name: "RMS", cost: 8, industry: 10 },
    { name: "Accounting", cost: 18, industry: 22 }, { name: "CRM", cost: 6, industry: 8 },
  ];

  return (
    <motion.div variants={stagger.container} initial="hidden" animate="visible" className="space-y-6">
      <motion.div variants={stagger.item} className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <MetricCard icon={IconPackage} label="Active Vendors" value="14" sub="Across all properties" />
        <MetricCard icon={IconDollarSign} label="Annual Vendor Spend" value="$425K" sub="Per property average" />
        <MetricCard icon={IconShield} label="Savings vs Industry" value="18%" sub="From consolidated buying" />
      </motion.div>

      <motion.div variants={stagger.item} className="bg-card/80 backdrop-blur-xl rounded-xl border border-border p-5">
        <SectionTitle icon={IconTarget} title="Make vs. Buy Decision Matrix" />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-3 text-muted-foreground font-medium">Service</th>
                <th className="text-center py-2 px-3 text-muted-foreground font-medium">In-House Score</th>
                <th className="text-center py-2 px-3 text-muted-foreground font-medium">Outsource Score</th>
                <th className="text-center py-2 px-3 text-muted-foreground font-medium">Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((row, i) => (
                <motion.tr key={row.service} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="py-2.5 px-3 font-medium">{row.service}</td>
                  <td className="py-2.5 px-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${row.make}%` }} /></div>
                      <span>{row.make}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full bg-chart-1 rounded-full" style={{ width: `${row.buy}%` }} /></div>
                      <span>{row.buy}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-center"><span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${row.color}`}>{row.decision}</span></td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      <motion.div variants={stagger.item} className="bg-card/80 backdrop-blur-xl rounded-xl border border-border p-5">
        <SectionTitle icon={IconBarChart2} title="Vendor Cost Benchmarks (per Room/Month)" />
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={vendorBenchmarks} layout="vertical">
            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} />
            <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={90} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="cost" name="Your Cost" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} barSize={12} />
            <Bar dataKey="industry" name="Industry Avg" fill="hsl(var(--muted-foreground))" radius={[0, 4, 4, 0]} barSize={12} />
          </BarChart>
        </ResponsiveContainer>
      </motion.div>
    </motion.div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function CompetitivePosition({ content, hasData, onGenerate }: { content: any; hasData: boolean; onGenerate: () => void }) {
  if (!hasData) return <EmptyState title="Competitive Positioning" description="Generate research to see competitive landscape analysis." onGenerate={onGenerate} />;

  const scatterData = [
    { x: 3, y: 4.2, z: 5, name: "Your Co." }, { x: 8, y: 3.8, z: 15, name: "Major REIT Mgr" },
    { x: 5, y: 5.0, z: 8, name: "Boutique A" }, { x: 12, y: 3.2, z: 25, name: "National Chain" },
    { x: 2, y: 4.8, z: 3, name: "Local Operator" }, { x: 7, y: 4.0, z: 12, name: "Regional Firm" },
  ];

  const comparisons = [
    { category: "Fee Competitiveness", you: 85, avg: 70 }, { category: "Service Breadth", you: 78, avg: 65 },
    { category: "Technology", you: 72, avg: 60 }, { category: "Track Record", you: 68, avg: 75 },
    { category: "Market Reach", you: 55, avg: 70 }, { category: "Brand Value", you: 62, avg: 68 },
  ];
  const radarData = comparisons.map(c => ({ subject: c.category, you: c.you, industry: c.avg }));

  return (
    <motion.div variants={stagger.container} initial="hidden" animate="visible" className="space-y-6">
      <motion.div variants={stagger.item} className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-card/80 backdrop-blur-xl rounded-xl border border-border p-5">
          <SectionTitle icon={IconTarget} title="Positioning Map (Fee % vs Portfolio Size)" />
          <ResponsiveContainer width="100%" height={280}>
            <ScatterChart>
              <XAxis dataKey="x" name="Properties" tick={{ fontSize: 11 }} label={{ value: "Properties", position: "bottom", fontSize: 10 }} />
              <YAxis dataKey="y" name="Fee %" tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return <div className="bg-card/95 backdrop-blur-xl border border-border rounded-lg px-3 py-2 shadow-xl text-xs"><p className="font-semibold">{d.name}</p><p className="text-muted-foreground">{d.x} properties, {d.y}% fee</p></div>;
              }} />
              <Scatter data={scatterData} fill="hsl(var(--chart-1))" fillOpacity={0.7} strokeWidth={0}>
                {scatterData.map((d, i) => <Cell key={i} fill={i === 0 ? "hsl(var(--chart-2))" : "hsl(var(--chart-1))"} r={d.z + 4} />)}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card/80 backdrop-blur-xl rounded-xl border border-border p-5">
          <SectionTitle icon={IconShield} title="Competitive Radar" />
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9 }} />
              <Radar name="Your Company" dataKey="you" stroke="hsl(var(--chart-2))" fill="hsl(var(--chart-2))" fillOpacity={0.2} strokeWidth={2} />
              <Radar name="Industry Avg" dataKey="industry" stroke="hsl(var(--foreground))" fill="hsl(var(--muted-foreground))" fillOpacity={0.1} strokeWidth={1.5} />
              <Tooltip content={<CustomTooltip />} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      <motion.div variants={stagger.item} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { icon: IconStar, title: "Boutique Expertise", desc: "Deep specialization in lifestyle and experiential hospitality segments" },
          { icon: IconShield, title: "Owner Alignment", desc: "Fee structure aligned with property performance, not just top-line revenue" },
          { icon: IconZap, title: "Tech-Forward", desc: "Proprietary analytics platform with real-time portfolio visibility" },
        ].map((card, i) => (
          <motion.div key={card.title} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.08 }}
            className="bg-gradient-to-br from-primary/5 to-transparent rounded-xl border border-primary/15 p-5 hover:shadow-lg hover:shadow-primary/5 transition-all">
            <card.icon className="w-5 h-5 text-primary mb-3" />
            <h4 className="text-sm font-semibold font-display mb-1">{card.title}</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">{card.desc}</p>
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
}
