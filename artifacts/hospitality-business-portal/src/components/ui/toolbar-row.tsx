import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Unstyled layout primitive for in-content toolbar rows.
 * Use PageHeader's `actions` slot for page-level chrome; use ToolbarRow
 * for tab headers, section headers, and bottom save rows within content.
 */
export interface ToolbarRowProps {
  /** Left slot — description text, title, status lines, etc. */
  start?: React.ReactNode;
  /** Right slot — action buttons, typically SaveButton + optional secondary buttons. */
  end?: React.ReactNode;
  className?: string;
}

export function ToolbarRow({ start, end, className }: ToolbarRowProps) {
  if (!start) {
    return (
      <div className={cn("flex justify-end gap-2", className)}>
        {end}
      </div>
    );
  }
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">{start}</div>
      <div className="flex items-center gap-2 shrink-0 pt-0.5">{end}</div>
    </div>
  );
}
