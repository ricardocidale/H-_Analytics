import { IconInfo, IconExternalLink } from "@/components/icons";
import { Sparkles } from "@/components/icons/themed-icons";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { usePanelManager } from "@/lib/panel-manager";
import type { RebeccaContext } from "@/lib/panel-manager";

interface InfoTooltipProps {
  text: string;
  formula?: string;
  light?: boolean;
  side?: "top" | "bottom" | "left" | "right";
  manualSection?: string;
  manualLabel?: string;
  /** When provided, shows an "Ask Rebecca" link that opens the copilot grounded on this field. */
  rebeccaContext?: RebeccaContext;
}

export function InfoTooltip({ text, formula, light = false, side = "top", manualSection, manualLabel, rebeccaContext }: InfoTooltipProps) {
  const { openRebecca } = usePanelManager();

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center justify-center ml-1 cursor-help rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
            light
              ? "text-muted-foreground hover:text-muted-foreground"
              : "text-primary hover:text-primary/80"
          }`}
          aria-label="Info"
          data-testid="info-tooltip-trigger"
        >
          <IconInfo className="w-3.5 h-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side={side}
        align="center"
        sideOffset={8}
        className="max-w-xs text-sm leading-relaxed px-4 py-3"
        data-testid="info-tooltip-content"
      >
        <span>{text}</span>
        {formula && (
          <code className="block mt-1.5 text-[11px] font-mono text-primary bg-muted rounded px-1.5 py-1">
            {formula}
          </code>
        )}
        {manualSection && (
          <a
            href={`/help#${manualSection}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 mt-1.5 text-[10px] text-primary hover:text-primary/80 transition-colors"
            data-testid="info-tooltip-manual-link"
            onClick={(e) => e.stopPropagation()}
          >
            <IconExternalLink className="w-3 h-3" />
            {manualLabel || "Learn more in the Manual"}
          </a>
        )}
        {rebeccaContext && (
          <button
            type="button"
            className="flex items-center gap-1 mt-1.5 text-[10px] text-primary hover:text-primary/80 transition-colors w-full text-left"
            data-testid="info-tooltip-ask-rebecca"
            onClick={(e) => {
              e.stopPropagation();
              openRebecca(rebeccaContext);
            }}
          >
            <Sparkles className="w-3 h-3" />
            Ask Rebecca
          </button>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
