import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-9 items-center justify-start rounded-lg bg-muted p-1 text-muted-foreground",
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

interface CurrentThemeTabItem {
  value: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  /**
   * Small status dot rendered next to the label. Use to surface that the tab
   * has unresolved post-save warnings (amber) or another notable state.
   * Pass a tailwind text-color token (e.g. "text-amber-500", "text-red-500").
   */
  statusDot?: string;
  /**
   * Optional numeric badge rendered next to the label (e.g. item counts).
   * Shown as a small rounded pill. Hidden when undefined.
   */
  count?: number;
  /**
   * Arbitrary React node rendered after the label. Use for embedded badges
   * (e.g. <ReadinessTabBadge>) that don't fit the count/statusDot shape.
   */
  suffix?: React.ReactNode;
  /**
   * Secondary icon rendered at the trailing edge of the tab. Stacks with
   * the primary `icon` (leading). Pass a fragment to render multiple.
   */
  trailingIcon?: React.ReactNode;
  /**
   * Disables the tab. Click is suppressed and the tab is rendered with
   * reduced opacity. Pair with `tooltipTitle` to explain why.
   */
  disabled?: boolean;
  /**
   * Hover tooltip shown when the tab is disabled. Ignored when not disabled.
   */
  tooltipTitle?: string;
}

interface CurrentThemeTabProps {
  tabs: CurrentThemeTabItem[];
  activeTab: string;
  onTabChange: (value: string) => void;
  rightContent?: React.ReactNode;
  /**
   * Visual variant:
   *   "default" — outer rounded-xl card with border + shadow (canonical page tabs)
   *   "drawer"  — flush container, compact inner padding (for drawers / sheets)
   */
  variant?: "default" | "drawer";
  /**
   * Responsive fallback. When set to `{ fallback: "select" }`, renders a
   * <Select> below the `@4xl/main` breakpoint and the tab strip above it.
   * Both controls dispatch the same `onTabChange` so state stays in sync.
   * Requires the parent layout to use the `@container/main` Tailwind
   * container query — used by the data-table feature row.
   */
  responsive?: { fallback: "select" };
}

function CurrentThemeTab({
  tabs,
  activeTab,
  onTabChange,
  rightContent,
  variant = "default",
  responsive,
}: CurrentThemeTabProps) {
  const triggerClass = cn(
    "flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 whitespace-nowrap shrink-0",
    "text-muted-foreground hover:text-foreground hover:bg-accent/50",
    "data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-sm",
    "data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed data-[disabled]:pointer-events-none",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
  );

  const list = (
    <TabsPrimitive.List
      className={cn(
        "flex overflow-x-auto scrollbar-hide gap-0.5 min-w-0 bg-transparent p-0 h-auto rounded-none",
        responsive?.fallback === "select" && "@4xl/main:flex hidden",
      )}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const trigger = (
          <TabsPrimitive.Trigger
            key={tab.value}
            value={tab.value}
            disabled={tab.disabled}
            className={triggerClass}
            data-testid={`tab-${tab.value}`}
          >
            {Icon && (
              <Icon
                className={cn(
                  "w-4 h-4 shrink-0",
                  "text-muted-foreground data-[state=active]:text-accent-foreground",
                )}
              />
            )}
            <span className="text-xs sm:text-sm">{tab.label}</span>
            {tab.count !== undefined && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[9px] font-semibold tabular-nums bg-foreground/10 text-foreground/60 px-1 leading-none shrink-0">
                {tab.count}
              </span>
            )}
            {tab.statusDot && (
              <span
                className={cn(
                  "inline-block w-1.5 h-1.5 rounded-full bg-current",
                  tab.statusDot,
                )}
                data-testid={`tab-status-dot-${tab.value}`}
                aria-label="has warnings"
              />
            )}
            {tab.suffix}
            {tab.trailingIcon}
          </TabsPrimitive.Trigger>
        );
        if (tab.disabled && tab.tooltipTitle) {
          return (
            <Tooltip key={tab.value}>
              <TooltipTrigger asChild>
                <span className="inline-flex">{trigger}</span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[280px] text-center">
                {tab.tooltipTitle}
              </TooltipContent>
            </Tooltip>
          );
        }
        return trigger;
      })}
    </TabsPrimitive.List>
  );

  const select = responsive?.fallback === "select" && (
    <Select value={activeTab} onValueChange={onTabChange}>
      <SelectTrigger className="@4xl/main:hidden flex w-fit min-w-[160px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {tabs.map((tab) => (
          <SelectItem key={tab.value} value={tab.value} disabled={tab.disabled}>
            {tab.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const inner = (
    <div
      className={cn(
        "flex items-center justify-between gap-1",
        variant === "drawer" ? "" : "p-1",
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        {select}
        {list}
      </div>
      {rightContent && (
        <div className="flex items-center gap-2 pr-1 shrink-0">{rightContent}</div>
      )}
    </div>
  );

  const wrapper =
    variant === "drawer" ? (
      <div className="bg-muted/50 rounded-lg p-1">{inner}</div>
    ) : (
      <div className="rounded-xl border border-border/80 bg-card shadow-sm">{inner}</div>
    );

  return (
    <TabsPrimitive.Root value={activeTab} onValueChange={onTabChange}>
      {wrapper}
    </TabsPrimitive.Root>
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, CurrentThemeTab }
export type { CurrentThemeTabItem }
