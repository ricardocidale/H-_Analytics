import * as React from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface ContentPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  variant?: "light" | "dark";
  padded?: boolean;
}

const ContentPanel = React.forwardRef<HTMLDivElement, ContentPanelProps>(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ({ title, subtitle, variant = "light", padded = true, className, children, ...props }, ref) => {
    return (
      <Card
        ref={ref}
        className={cn(
          "shadow-sm bg-card border-border",
          padded && "p-6",
          className
        )}
        {...props}
      >
        {title && (
          <h3 className="text-lg font-display mb-1 text-card-foreground">
            {title}
          </h3>
        )}
        {subtitle && (
          <p className="text-sm mb-4 text-muted-foreground">
            {subtitle}
          </p>
        )}
        {!subtitle && title && <div className="mb-4" />}
        {children}
      </Card>
    );
  }
);

ContentPanel.displayName = "ContentPanel";

export { ContentPanel };
