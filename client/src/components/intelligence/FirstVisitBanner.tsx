import { NeuralGlow } from "@/components/ui/ai-loader";
import { cn } from "@/lib/utils";

interface FirstVisitBannerProps {
  /** @deprecated kept for API compatibility — banner no longer renders its own CTA */
  onAskAnalyst?: () => void;
  /** @deprecated kept for API compatibility */
  isGenerating?: boolean;
  className?: string;
}

/**
 * Informational banner shown on first visit to an assumptions page.
 *
 * The "Ask the Analyst" CTA used to live here but was removed because it
 * duplicated the primary action button already present in the page header.
 * The banner is now purely informational — callers must continue to gate
 * its visibility (e.g. hide it once intelligence freshness is "current").
 */
export function FirstVisitBanner({ className }: FirstVisitBannerProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 px-4 py-3 rounded-lg border",
        "bg-blue-500/10 border-blue-500/30",
        className,
      )}
      data-testid="first-visit-banner"
    >
      <NeuralGlow size={32} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-blue-700 dark:text-blue-400" data-testid="text-first-visit-message">
          The Analyst hasn't reviewed these assumptions yet
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Use <span className="font-medium">Ask the Analyst</span> in the page header to study market data and provide conviction-scored ranges for every field.
        </p>
      </div>
    </div>
  );
}
