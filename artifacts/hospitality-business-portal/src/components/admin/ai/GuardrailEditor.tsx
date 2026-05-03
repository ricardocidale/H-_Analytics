import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  IconShield,
  IconAlertTriangle,
  IconRefreshCw,
} from "@/components/icons";
import { Loader2 } from "@/components/icons/themed-icons";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface Guardrail {
  id: number;
  label: string;
  rule: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function GuardrailEditor() {
  const { data: guardrails, isLoading, isError, refetch } = useQuery<Guardrail[]>({
    queryKey: ["rebeccaGuardrails"],
    queryFn: async () => {
      const res = await fetch("/api/rebecca/guardrails", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch guardrails");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-accent-pop" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mt-6 p-8 flex flex-col items-center gap-4 text-center rounded-xl border border-accent-pop/20 bg-accent-pop/10">
        <IconAlertTriangle className="w-10 h-10 text-accent-pop" />
        <div>
          <p className="font-semibold text-foreground">Failed to load guardrails</p>
          <p className="text-sm text-muted-foreground mt-1">Check your connection or try again.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2" data-testid="button-retry-guardrails">
          <IconRefreshCw className="w-4 h-4" /> Retry
        </Button>
      </div>
    );
  }

  const activeCount = guardrails?.filter(g => g.isActive).length ?? 0;
  const sorted = [...(guardrails ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="space-y-6"
    >
      <Alert data-testid="alert-guardrails-readonly">
        <IconShield className="w-4 h-4" />
        <AlertTitle>Read-only — dev-defined</AlertTitle>
        <AlertDescription>
          Rebecca's guardrails are defined in source code per{" "}
          <code>specialists-are-dev-defined-only.md</code>. To add or change a
          guardrail, edit the code and redeploy.
        </AlertDescription>
      </Alert>

      <Card className="bg-gradient-to-r from-primary/5 to-primary/[0.02] border border-primary/20">
        <CardContent className="py-4 px-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <IconShield className="w-4.5 h-4.5 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">What are guardrails?</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Guardrails are behavioral rules injected into Rebecca's system prompt at runtime.
                They define what she can and cannot discuss, ensuring she stays focused on hospitality
                investment analytics.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px] uppercase tracking-wider font-semibold bg-primary/10 text-primary border-primary/20" data-testid="badge-active-guardrails">
            {activeCount} active
          </Badge>
          <Badge variant="secondary" className="text-[10px] uppercase tracking-wider font-semibold" data-testid="badge-total-guardrails">
            {sorted.length} total
          </Badge>
        </div>
      </div>

      <div className="space-y-3">
        {sorted.map((g, idx) => (
          <Card
            key={g.id}
            className={cn(
              "bg-card border shadow-sm transition-all duration-200",
              g.isActive ? "border-border/80" : "border-border/40 opacity-60"
            )}
            data-testid={`card-guardrail-${g.id}`}
          >
            <CardContent className="py-4 px-5">
              <div className="flex items-start gap-3">
                <div className="flex flex-col gap-0.5 shrink-0 pt-0.5 w-6 items-center">
                  <span className="text-[10px] text-muted-foreground/50 text-center font-mono">{idx + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold text-foreground truncate" data-testid={`text-guardrail-label-${g.id}`}>{g.label}</p>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0 shrink-0",
                        g.isActive
                          ? "bg-primary/10 text-primary border-primary/20"
                          : "bg-muted text-muted-foreground"
                      )}
                      data-testid={`badge-guardrail-status-${g.id}`}
                    >
                      {g.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed" data-testid={`text-guardrail-rule-${g.id}`}>{g.rule}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {sorted.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <IconShield className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No guardrails configured.</p>
            <p className="text-xs mt-1">Guardrails are defined in source code.</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
