import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  IconShield,
  IconCheckCircle2,
  IconXCircle,
} from "@/components/icons";
import { Loader2 } from "@/components/icons/themed-icons";
import { motion, AnimatePresence } from "framer-motion";

export interface ChecklistItem {
  label: string;
  ok: boolean;
  tab?: string;
}

export function StatusChecklist({
  items,
  onNavigate,
}: {
  items: ChecklistItem[];
  onNavigate: (tab: string) => void;
}) {
  return (
    <Card
      className="bg-card border border-border/80 shadow-sm"
      data-testid="card-agent-checklist"
    >
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
          <IconShield className="w-4 h-4 text-muted-foreground" />
          Agent Readiness
        </CardTitle>
        <CardDescription className="label-text mt-0.5">
          All systems must be green for full agent functionality.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {items.map((item) => (
            <Button
              key={item.label}
              type="button"
              variant="ghost"
              disabled={!item.tab}
              onClick={() => item.tab && onNavigate(item.tab)}
              className={`flex items-center gap-2.5 p-3 h-auto rounded-xl border text-left justify-start transition-all ${
                item.ok
                  ? "border-primary/20 bg-primary/10 text-primary"
                  : "border-destructive/20 bg-destructive/10 text-destructive"
              } ${item.tab ? "cursor-pointer hover:shadow-sm" : "cursor-default"}`}
              data-testid={`checklist-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {item.ok ? (
                <IconCheckCircle2 className="w-4 h-4 text-primary shrink-0" />
              ) : (
                <IconXCircle className="w-4 h-4 text-destructive/80 shrink-0" />
              )}
              <span className="text-xs font-medium">{item.label}</span>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export interface AgentCardProps {
  name: string;
  type: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  isActive: boolean;
  isEnabled: boolean;
  isSelected: boolean;
  onToggle: (enabled: boolean) => void;
  onSelect: () => void;
  isToggling?: boolean;
  accentFrom: string;
  accentTo: string;
  orbElement?: React.ReactNode;
}

export function AgentCard({
  name,
  type,
  description,
  icon: Icon,
  
  isEnabled,
  isSelected,
  onToggle,
  onSelect,
  isToggling,
  accentFrom,
  accentTo,
  orbElement,
}: AgentCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <Card
        className={cn(
          "relative overflow-hidden cursor-pointer transition-all duration-300",
          "bg-white/80 backdrop-blur-xl border",
          isSelected
            ? "border-primary/40 shadow-[0_0_24px_rgba(var(--primary-rgb,100,100,100),0.12)] ring-1 ring-primary/20"
            : "border-border/60 hover:border-border hover:shadow-md",
          !isEnabled && "opacity-70",
        )}
        onClick={onSelect}
        data-testid={`agent-card-${name.toLowerCase()}`}
      >
        <AnimatePresence>
          {isEnabled && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className={cn(
                "absolute inset-0 pointer-events-none",
                `bg-gradient-to-br ${accentFrom} ${accentTo}`,
              )}
            />
          )}
        </AnimatePresence>

        <CardContent className="relative p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3.5 min-w-0">
              <div
                className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300",
                  isEnabled
                    ? "bg-primary/10 shadow-sm"
                    : "bg-muted/60",
                )}
              >
                {orbElement || (
                  <Icon
                    className={cn(
                      "w-6 h-6 transition-colors duration-300",
                      isEnabled ? "text-primary" : "text-muted-foreground/60",
                    )}
                  />
                )}
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-display font-bold text-foreground">
                    {name}
                  </h3>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0",
                      isEnabled
                        ? "bg-primary/10 text-primary border-primary/20"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {type}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  {description}
                </p>

                <div className="flex items-center gap-1.5 mt-2.5">
                  <motion.div
                    className={cn(
                      "w-2 h-2 rounded-full",
                      isEnabled ? "bg-primary" : "bg-muted-foreground/30",
                    )}
                    animate={
                      isEnabled
                        ? { scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }
                        : {}
                    }
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  />
                  <span
                    className={cn(
                      "text-[11px] font-medium",
                      isEnabled ? "text-primary" : "text-muted-foreground/50",
                    )}
                  >
                    {isEnabled ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
            </div>

            <div
              className="shrink-0 pt-1"
              onClick={(e) => e.stopPropagation()}
            >
              {isToggling ? (
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              ) : (
                <Switch
                  checked={isEnabled}
                  onCheckedChange={onToggle}
                  data-testid={`switch-agent-${name.toLowerCase()}`}
                />
              )}
            </div>
          </div>
        </CardContent>

        <AnimatePresence>
          {isSelected && (
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              exit={{ scaleX: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary origin-left"
            />
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-muted animate-pulse" />
        <div>
          <div className="h-7 w-36 bg-muted animate-pulse rounded" />
          <div className="h-4 w-64 bg-muted animate-pulse rounded mt-2" />
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-card p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-muted animate-pulse" />
            <div className="space-y-2">
              <div className="h-5 w-28 bg-muted animate-pulse rounded" />
              <div className="h-3 w-48 bg-muted animate-pulse rounded" />
              <div className="h-3 w-16 bg-muted animate-pulse rounded" />
            </div>
          </div>
          <div className="w-10 h-6 bg-muted animate-pulse rounded-full" />
        </div>
      </div>

      {[1, 2, 3, 4].map((i) => (
        <Card key={i} className="bg-card border border-border/80">
          <CardHeader>
            <div className="h-6 w-48 bg-muted animate-pulse rounded" />
            <div className="h-4 w-72 bg-muted animate-pulse rounded mt-2" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="h-10 bg-muted animate-pulse rounded" />
              <div className="h-10 bg-muted animate-pulse rounded" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
