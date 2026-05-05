import { Badge } from "@/components/ui/badge";
import { IconCheckCircle, IconAlertCircle, IconClock } from "@/components/icons";

export type Freshness = "fresh" | "stale" | "missing";

const STALE_DAYS = 30;
const STALE_MS = STALE_DAYS * 24 * 60 * 60 * 1000;

export function computeFreshness(
  lastRefreshedAt: string | null | undefined,
  liveCount: number | null | undefined,
): Freshness {
  if (!lastRefreshedAt || (liveCount != null && liveCount === 0)) return "missing";
  const age = Date.now() - new Date(lastRefreshedAt).getTime();
  return age > STALE_MS ? "stale" : "fresh";
}

interface Props {
  lastRefreshedAt: string | null | undefined;
  liveCount: number | null | undefined;
}

export function FreshnessBadge({ lastRefreshedAt, liveCount }: Props) {
  const freshness = computeFreshness(lastRefreshedAt, liveCount);

  if (freshness === "fresh") {
    return (
      <Badge className="gap-1 text-[11px] bg-emerald-500/15 text-emerald-700 border-emerald-500/30 hover:bg-emerald-500/15">
        <IconCheckCircle className="w-3 h-3" />
        Fresh
      </Badge>
    );
  }
  if (freshness === "stale") {
    return (
      <Badge className="gap-1 text-[11px] bg-amber-500/15 text-amber-700 border-amber-500/30 hover:bg-amber-500/15">
        <IconClock className="w-3 h-3" />
        Stale
      </Badge>
    );
  }
  return (
    <Badge className="gap-1 text-[11px] bg-muted text-muted-foreground border-border hover:bg-muted">
      <IconAlertCircle className="w-3 h-3" />
      Missing
    </Badge>
  );
}
