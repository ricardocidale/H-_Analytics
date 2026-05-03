import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

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
}

interface CurrentThemeTabProps {
  tabs: CurrentThemeTabItem[];
  activeTab: string;
  onTabChange: (value: string) => void;
  rightContent?: React.ReactNode;
}

function CurrentThemeTab({ tabs, activeTab, onTabChange, rightContent }: CurrentThemeTabProps) {
  return (
    <div className="rounded-xl border border-border/80 bg-card shadow-sm">
      <div className="flex items-center justify-between gap-1 p-1">
        <div className="flex overflow-x-auto scrollbar-hide gap-0.5 min-w-0">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.value;
            const Icon = tab.icon;
            return (
              <button
                key={tab.value}
                onClick={() => onTabChange(tab.value)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 whitespace-nowrap shrink-0",
                  isActive
                    ? "bg-accent text-accent-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                )}
                data-testid={`tab-${tab.value}`}
              >
                {Icon && (
                  <Icon className={cn(
                    "w-4 h-4 shrink-0",
                    isActive ? "text-accent-foreground" : "text-muted-foreground"
                  )} />
                )}
                <span className="text-xs sm:text-sm">{tab.label}</span>
                {tab.statusDot && (
                  <span
                    className={cn("inline-block w-1.5 h-1.5 rounded-full bg-current", tab.statusDot)}
                    data-testid={`tab-status-dot-${tab.value}`}
                    aria-label="has warnings"
                  />
                )}
              </button>
            );
          })}
        </div>
        {rightContent && (
          <div className="flex items-center gap-2 pr-1 shrink-0">
            {rightContent}
          </div>
        )}
      </div>
    </div>
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, CurrentThemeTab }
export type { CurrentThemeTabItem }
