import { motion, type Variants, useMotionValue, useTransform } from "framer-motion";
import { type ReactNode, useRef } from "react";
import { Minus } from "@/components/icons/themed-icons";
import { IconTrendingUp, IconTrendingDown } from "@/components/icons";
import { AnimatedCounter } from "@/components/ui/animated";

export interface KPIItem {
  label: string;
  value: number;
  format?: (n: number) => string;
  trend?: "up" | "down" | "neutral";
  trendLabel?: string;
  icon?: ReactNode;
  sublabel?: string;
}

interface KPIGridProps {
  items: KPIItem[];
  columns?: 2 | 3 | 4 | 5;
  variant?: "glass" | "light" | "dark";
  className?: string;
  "data-testid"?: string;
}

const defaultFormat = (n: number) => n.toLocaleString();

const trendIcon = (trend?: "up" | "down" | "neutral") => {
  if (trend === "up") return <IconTrendingUp className="w-3.5 h-3.5 text-primary" />;
  if (trend === "down") return <IconTrendingDown className="w-3.5 h-3.5 text-destructive" />;
  return <Minus className="w-3.5 h-3.5 text-primary/40" />;
};

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.05 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
};

const colClass: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
  5: "grid-cols-2 lg:grid-cols-5",
};

export function KPIGrid({ items, columns = 4, className, ...props }: KPIGridProps) {
  return (
    <motion.div
      className={`grid gap-6 ${colClass[columns]} ${className || ""}`}
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      data-testid={props["data-testid"]}
    >
      {items.map((item) => (
        <KPICard key={item.label} item={item} />
      ))}
    </motion.div>
  );
}

function KPICard({ item }: { item: KPIItem }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useTransform(y, [-0.5, 0.5], [6, -6]);
  const rotateY = useTransform(x, [-0.5, 0.5], [-6, 6]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    x.set((e.clientX - rect.left) / rect.width - 0.5);
    y.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={ref}
      variants={itemVariants}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
      whileHover={{ scale: 1.02, y: -2, boxShadow: "0 8px 24px hsl(var(--primary) / 0.12)", transition: { duration: 0.2 } }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className="bg-card rounded-xl p-5 sm:p-6 shadow-[0_1px_4px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.04)] cursor-default"
    >
      <div className="flex items-start justify-between mb-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">
          {item.label}
        </p>
        {item.trend && (
          <span className="flex items-center gap-0.5 flex-shrink-0">
            {trendIcon(item.trend)}
            {item.trendLabel && (
              <span className={`text-xs font-medium ${item.trend === "up" ? "text-primary" : item.trend === "down" ? "text-destructive" : "text-muted-foreground/40"}`}>
                {item.trendLabel}
              </span>
            )}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="text-xl sm:text-2xl font-bold text-foreground truncate">
          <AnimatedCounter value={item.value} format={item.format || defaultFormat} />
        </span>
      </div>
      {item.sublabel && (
        <p className="text-xs mt-1 text-muted-foreground/40 truncate">{item.sublabel}</p>
      )}
    </motion.div>
  );
}
