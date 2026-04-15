import { NeuralGlow } from "@/components/ui/ai-loader";
import { Button } from "@/components/ui/button";
import { IconSparkles } from "@/components/icons";
import { cn } from "@/lib/utils";

interface FirstVisitBannerProps {
  onAskAnalyst: () => void;
  isGenerating: boolean;
  className?: string;
}

export function FirstVisitBanner({
  onAskAnalyst,
  isGenerating,
  className,
}: FirstVisitBannerProps) {
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
          Ask the Analyst to study market data and provide conviction-scored ranges for every field.
        </p>
      </div>
      <Button
        size="sm"
        onClick={onAskAnalyst}
        disabled={isGenerating}
        className="animate-intelligence-pulse gap-1.5 flex-shrink-0"
        data-testid="button-first-visit-ask-analyst"
      >
        <IconSparkles className="w-3.5 h-3.5" />
        Ask the Analyst
      </Button>
    </div>
  );
}
