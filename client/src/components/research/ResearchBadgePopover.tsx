import * as React from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ResearchBadge, type ResearchBadgeProps } from "@/components/ui/research-badge";
import { usePanelManager, type GuidanceContext } from "@/lib/panel-manager";
import { cn } from "@/lib/utils";
import { BarChart3, MessageCircle, Zap } from "lucide-react";

interface ResearchBadgePopoverProps extends ResearchBadgeProps {
  guidanceContext?: GuidanceContext;
  onApplyValue?: () => void;
}

function ResearchBadgePopover({
  guidanceContext,
  onApplyValue,
  onClick,
  ...badgeProps
}: ResearchBadgePopoverProps) {
  const [open, setOpen] = React.useState(false);
  const { openGuidance, openRebecca } = usePanelManager();

  const handleApply = React.useCallback(() => {
    setOpen(false);
    if (onApplyValue) {
      onApplyValue();
    } else if (onClick) {
      onClick();
    }
  }, [onApplyValue, onClick]);

  const handleViewDetails = React.useCallback(() => {
    setOpen(false);
    if (guidanceContext) {
      openGuidance(guidanceContext);
    }
  }, [guidanceContext, openGuidance]);

  const handleAskRebecca = React.useCallback(() => {
    setOpen(false);
    if (guidanceContext) {
      openRebecca({
        fieldName: guidanceContext.fieldLabel ?? guidanceContext.assumptionKey,
        entityType: guidanceContext.entityType,
        entityId: guidanceContext.entityId,
      });
    } else {
      openRebecca();
    }
  }, [guidanceContext, openRebecca]);

  const display = badgeProps.value ?? badgeProps.entry?.display;
  if (!display) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ResearchBadge
          {...badgeProps}
          onClick={() => setOpen(true)}
          data-testid={badgeProps["data-testid"] ?? "badge-research-popover"}
        />
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={6}
        className="w-52 p-1.5 shadow-lg border-border/60"
        data-testid="popover-research-actions"
      >
        <div className="flex flex-col gap-0.5">
          <PopoverAction
            icon={<Zap className="h-3.5 w-3.5" />}
            label="Apply Value"
            description="Use recommended midpoint"
            onClick={handleApply}
            data-testid="action-apply-value"
          />
          {guidanceContext && (
            <PopoverAction
              icon={<BarChart3 className="h-3.5 w-3.5" />}
              label="View Details"
              description="Range, comps & provenance"
              onClick={handleViewDetails}
              data-testid="action-view-details"
            />
          )}
          <PopoverAction
            icon={<MessageCircle className="h-3.5 w-3.5" />}
            label="Ask Rebecca"
            description="Get conversational guidance"
            onClick={handleAskRebecca}
            data-testid="action-ask-rebecca"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PopoverAction({
  icon,
  label,
  description,
  onClick,
  ...props
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
  "data-testid"?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-start gap-2.5 w-full rounded-md px-2.5 py-2 text-left",
        "transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      )}
      data-testid={props["data-testid"]}
    >
      <span className="mt-0.5 text-muted-foreground shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className="text-sm font-medium leading-tight">{label}</div>
        <div className="text-xs text-muted-foreground leading-tight mt-0.5">{description}</div>
      </div>
    </button>
  );
}

ResearchBadgePopover.displayName = "ResearchBadgePopover";

export { ResearchBadgePopover };
export type { ResearchBadgePopoverProps };
