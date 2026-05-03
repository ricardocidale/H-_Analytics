import * as React from "react";
import { IconInfo } from "@/components/icons";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

interface GaapBadgeProps {
  rule: string;
  className?: string;
}

export function GaapBadge({ rule, className }: GaapBadgeProps) {
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex items-center justify-center w-4 h-4 rounded-full bg-chart-1 hover:bg-chart-1 cursor-help transition-colors ${className ?? ""}`}
          aria-label="GAAP/IRS rule"
          data-testid="gaap-badge"
        >
          <IconInfo className="w-3 h-3 text-white" />
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="center"
        sideOffset={8}
        className="max-w-xs text-sm leading-relaxed px-4 py-3"
        data-testid="gaap-badge-content"
      >
        <span>{rule}</span>
      </TooltipContent>
    </Tooltip>
  );
}
