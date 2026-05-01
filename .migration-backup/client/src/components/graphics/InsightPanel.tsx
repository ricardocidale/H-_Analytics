import { motion } from "framer-motion";
import { IconSparkles, IconTrendingUp, IconTrendingDown, IconAlertTriangle, IconCheckCircle2 } from "@/components/icons";
import { type ReactNode } from "react";

export interface Insight {
  text: string;
  type?: "positive" | "negative" | "warning" | "neutral";
  metric?: string;
}

interface InsightPanelProps {
  insights: Insight[];
  title?: string;
  icon?: ReactNode;
  variant?: "glass" | "compact" | "inline";
  className?: string;
  "data-testid"?: string;
}

const typeConfig = {
  positive: { icon: <IconTrendingUp className="w-3.5 h-3.5" />, color: "text-primary", dot: "bg-primary" },
  negative: { icon: <IconTrendingDown className="w-3.5 h-3.5" />, color: "text-destructive", dot: "bg-destructive" },
  warning: { icon: <IconAlertTriangle className="w-3.5 h-3.5" />, color: "text-accent-pop", dot: "bg-accent-pop" },
  neutral: { icon: <IconCheckCircle2 className="w-3.5 h-3.5" />, color: "text-muted-foreground/60", dot: "bg-muted-foreground/40" },
};

export function InsightPanel({ insights, title, icon, variant = "glass", className, ...props }: InsightPanelProps) {
  if (variant === "inline") {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className={`flex flex-wrap gap-2 ${className || ""}`}
        data-testid={props["data-testid"]}
      >
        {insights.map((insight, i) => {
          const config = typeConfig[insight.type || "neutral"];
          return (
            <span key={i} className={`inline-flex items-center gap-1.5 text-xs ${config.color} bg-card/80 rounded-full px-3 py-1.5 border border-primary/10`}>
              {config.icon}
              {insight.text}
              {insight.metric && <span className="font-mono font-semibold">{insight.metric}</span>}
            </span>
          );
        })}
      </motion.div>
    );
  }

  if (variant === "compact") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className={`rounded-lg p-4 bg-primary/5 border border-primary/10 ${className || ""}`}
        data-testid={props["data-testid"]}
      >
        <div className="flex items-center gap-2 mb-2">
          {icon || <IconSparkles className="w-4 h-4 text-primary" />}
          <span className="text-sm font-medium text-foreground">{title || "Key Insights"}</span>
        </div>
        <div className="space-y-1.5">
          {insights.map((insight, i) => {
            const config = typeConfig[insight.type || "neutral"];
            return (
              <div key={i} className="flex items-start gap-2">
                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${config.dot}`} />
                <p className="text-xs text-muted-foreground/70">
                  {insight.text}
                  {insight.metric && <span className="font-mono font-semibold ml-1">{insight.metric}</span>}
                </p>
              </div>
            );
          })}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.4 }}
      className={`rounded-lg p-5 bg-card/80 border border-primary/10 shadow-[0_2px_8px_rgba(var(--primary-rgb,159,188,164),0.08)] ${className || ""}`}
      data-testid={props["data-testid"]}
    >
      <div className="flex items-center gap-2 mb-3">
        {icon || <IconSparkles className="w-4 h-4 text-primary" />}
        <h3 className="text-sm font-semibold text-foreground">{title || "Key Insights"}</h3>
      </div>
      <div className="space-y-2.5">
        {insights.map((insight, i) => {
          const config = typeConfig[insight.type || "neutral"];
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + i * 0.08 }}
              className="flex items-start gap-2.5"
            >
              <div className={`mt-0.5 ${config.color}`}>{config.icon}</div>
              <p className="text-sm text-muted-foreground/70">
                {insight.text}
                {insight.metric && <span className="font-mono font-semibold ml-1">{insight.metric}</span>}
              </p>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
