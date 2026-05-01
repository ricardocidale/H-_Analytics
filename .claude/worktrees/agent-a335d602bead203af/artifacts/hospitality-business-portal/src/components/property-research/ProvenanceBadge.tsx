import { cn } from "@/lib/utils";

type Provenance = "verified" | "cited" | "estimated";

const config: Record<Provenance, { label: string; className: string; tooltip: string }> = {
  verified: {
    label: "Verified",
    className: "bg-primary/15 text-primary dark:bg-primary/10 dark:text-primary",
    tooltip: "Data from institutional source (FRED, STR, CoStar)",
  },
  cited: {
    label: "Cited",
    className: "bg-chart-1/15 text-chart-1 dark:bg-chart-1/10 dark:text-chart-1",
    tooltip: "Sourced from web research with citations",
  },
  estimated: {
    label: "Estimated",
    className: "bg-muted text-muted-foreground dark:bg-muted/50 dark:text-muted-foreground",
    tooltip: "AI-generated estimate without external backing",
  },
};

export function ProvenanceBadge({
  provenance,
  className,
}: {
  provenance: Provenance;
  className?: string;
}) {
  const c = config[provenance];
  return (
    <span
      data-testid={`badge-provenance-${provenance}`}
      title={c.tooltip}
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider cursor-default",
        c.className,
        className
      )}
    >
      <span
        className={cn("w-1.5 h-1.5 rounded-full", {
          "bg-primary": provenance === "verified",
          "bg-chart-1": provenance === "cited",
          "bg-muted-foreground": provenance === "estimated",
        })}
      />
      {c.label}
    </span>
  );
}
