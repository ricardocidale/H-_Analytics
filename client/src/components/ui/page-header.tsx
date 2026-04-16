import * as React from "react";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { ChevronLeft } from "@/components/icons/themed-icons";
import { Button } from "@/components/ui/button";

export interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: string;
  backLink?: string;
  actions?: React.ReactNode;
  className?: string;
  variant?: "dark" | "light";
}

function PageHeader({ title, subtitle, backLink, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("relative rounded-xl border border-border/80 bg-card shadow-sm p-4 sm:p-5", className)}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          {backLink && (
            <Link href={backLink}>
              <Button variant="outline" size="icon" className="h-9 w-9 hover:scale-[1.03] active:scale-[0.97] transition-transform" aria-label="Go back">
                <ChevronLeft className="w-4 h-4" />
              </Button>
            </Link>
          )}
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-foreground">{title}</h2>
            {subtitle && (
              <p className="text-xs sm:text-sm mt-0.5 text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

export { PageHeader };
