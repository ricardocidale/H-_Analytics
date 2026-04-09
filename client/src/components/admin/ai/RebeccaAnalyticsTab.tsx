import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { IconMessageCircle, IconUser, IconTrendingUp, IconZap } from "@/components/icons";
import { motion } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

interface AnalyticsData {
  totalConversations: number;
  totalMessages: number;
  uniqueUsers: number;
  avgTurnsPerConversation: number;
  singleTurnRate: number;
  deepConversationRate: number;
  contextBreakdown: Record<string, number>;
  dailyVolumes: Array<{ date: string; conversations: number; messages: number }>;
  feedbackBreakdown: Record<string, number>;
  totalFeedback: number;
}

const CHART_COLORS = ["#0091AE", "#112548", "#FDB817", "#4ade80", "#f97316", "#8b5cf6"];

function StatCard({ label, value, icon: Icon, sub }: { label: string; value: string | number; icon: React.ElementType; sub?: string }) {
  return (
    <Card className="bg-card border border-border/80 shadow-sm">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-display font-bold text-foreground leading-tight" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>{value}</p>
          <p className="text-[11px] text-muted-foreground font-medium">{label}</p>
          {sub && <p className="text-[10px] text-muted-foreground/60">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function formatDateShort(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function RebeccaAnalyticsTab() {
  const { data, isLoading } = useQuery<AnalyticsData>({
    queryKey: ["rebecca-analytics"],
    queryFn: async () => {
      const res = await fetch("/api/rebecca/analytics", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
        <Skeleton className="h-64 rounded-lg" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <Card className="bg-card border border-border/80 shadow-sm">
        <CardContent className="py-12 text-center">
          <p className="text-sm text-muted-foreground">No analytics data available.</p>
        </CardContent>
      </Card>
    );
  }

  const contextPieData = Object.entries(data.contextBreakdown).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value,
  }));

  const feedbackPieData = Object.entries(data.feedbackBreakdown).map(([name, value]) => ({
    name: name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
    value,
  }));

  const dailyData = data.dailyVolumes.map(d => ({
    ...d,
    label: formatDateShort(d.date),
  }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-5"
      data-testid="rebecca-analytics-tab"
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Conversations" value={data.totalConversations} icon={IconMessageCircle} />
        <StatCard label="Messages" value={data.totalMessages} icon={IconZap} />
        <StatCard label="Unique Users" value={data.uniqueUsers} icon={IconUser} />
        <StatCard label="Avg Turns" value={data.avgTurnsPerConversation} icon={IconTrendingUp} sub="messages per conversation" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="bg-card border border-border/80 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="min-w-0">
              <p className="text-lg font-display font-bold text-foreground">{data.singleTurnRate}%</p>
              <p className="text-[11px] text-muted-foreground font-medium">Single-Turn Rate</p>
              <p className="text-[10px] text-muted-foreground/60">Conversations with ≤ 2 messages</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border border-border/80 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="min-w-0">
              <p className="text-lg font-display font-bold text-foreground">{data.deepConversationRate}%</p>
              <p className="text-[11px] text-muted-foreground font-medium">Deep Conversation Rate</p>
              <p className="text-[10px] text-muted-foreground/60">Conversations with ≥ 6 messages</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border border-border/80 shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="min-w-0">
              <p className="text-lg font-display font-bold text-foreground">{data.totalFeedback}</p>
              <p className="text-[11px] text-muted-foreground font-medium">Total Feedback</p>
              <p className="text-[10px] text-muted-foreground/60">User-submitted reports</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border border-border/80 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold text-foreground">Daily Volume</CardTitle>
              <CardDescription className="label-text mt-0.5">Conversations and messages over the last 30 days</CardDescription>
            </div>
            <Badge variant="secondary" className="text-xs">{dailyData.length} days</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {dailyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dailyData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid var(--border)" }}
                  labelStyle={{ fontWeight: 600 }}
                />
                <Bar dataKey="conversations" name="Conversations" fill="#0091AE" radius={[3, 3, 0, 0]} />
                <Bar dataKey="messages" name="Messages" fill="#112548" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">No daily data yet.</div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-card border border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">Context Breakdown</CardTitle>
            <CardDescription className="label-text mt-0.5">Conversation topics by context type</CardDescription>
          </CardHeader>
          <CardContent>
            {contextPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={contextPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                    style={{ fontSize: 10 }}
                  >
                    {contextPieData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground">No context data yet.</div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border border-border/80 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">Feedback Breakdown</CardTitle>
            <CardDescription className="label-text mt-0.5">User feedback by category</CardDescription>
          </CardHeader>
          <CardContent>
            {feedbackPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={feedbackPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                    style={{ fontSize: 10 }}
                  >
                    {feedbackPieData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[(i + 2) % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground">No feedback yet.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
