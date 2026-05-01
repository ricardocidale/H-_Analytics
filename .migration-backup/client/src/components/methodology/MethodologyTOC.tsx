import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface MethodologyTOCProps {
  sections: Array<{
    id: string;
    title: string;
    icon: React.ComponentType<{ className?: string }>;
  }>;
  onScrollToSection: (id: string) => void;
}

export function MethodologyTOC({ sections, onScrollToSection }: MethodologyTOCProps) {
  return (
    <aside className="hidden lg:block w-72 flex-shrink-0">
      <div className="sticky top-24">
        <Card className="bg-card border shadow-sm">
          <div className="p-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Table of Contents</h3>
            <nav className="space-y-1">
              {sections.map((s) => (
                <Button
                  key={s.id}
                  variant="ghost"
                  size="sm"
                  data-testid={`toc-${s.id}`}
                  onClick={() => onScrollToSection(s.id)}
                  className="w-full text-left justify-start px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors truncate h-auto"
                >
                  {s.title}
                </Button>
              ))}
            </nav>
          </div>
        </Card>
      </div>
    </aside>
  );
}
