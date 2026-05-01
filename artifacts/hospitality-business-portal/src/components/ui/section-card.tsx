import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronRight } from "@/components/icons/themed-icons";
import { cn } from "@/lib/utils";

interface SectionCardProps {
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  expanded: boolean;
  onToggle: () => void;
  sectionRef: (el: HTMLDivElement | null) => void;
  children: React.ReactNode;
  variant?: "dark" | "light";
  className?: string;
}

export function SectionCard({
  id,
  title,
  subtitle,
  icon: Icon,
  expanded,
  onToggle,
  sectionRef,
  children,
  variant = "dark",
  className,
}: SectionCardProps) {
  return (
    <div ref={sectionRef} id={id} className="scroll-mt-24">
      <Card
        className={cn(
          "bg-card border-border shadow-sm",
          className,
        )}
      >
        <button
          data-testid={`section-toggle-${id}`}
          onClick={onToggle}
          className="w-full flex items-center justify-between p-5 text-left transition-colors rounded-lg hover:bg-muted/50"
        >
          <div className="flex items-center gap-3">
            {variant === "dark" ? (
              <Icon className="w-5 h-5 text-primary" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Icon className="w-5 h-5 text-primary" />
              </div>
            )}
            <div className="text-left">
              <h2 className={cn("font-semibold text-card-foreground", variant === "dark" ? "text-lg" : "text-base")}>
                {title}
              </h2>
              {subtitle && (
                <p className="text-sm text-muted-foreground">{subtitle}</p>
              )}
            </div>
          </div>
          {expanded ? (
            <ChevronDown className="w-5 h-5 text-muted-foreground/40" />
          ) : (
            <ChevronRight className="w-5 h-5 text-muted-foreground/40" />
          )}
        </button>
        {expanded && (
          <CardContent className="pt-0 pb-6 px-5 space-y-4">
            {children}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
