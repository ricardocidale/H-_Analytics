interface FieldSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  /** When true, wraps children in a responsive 1→2→3→4 column grid. */
  grid?: boolean;
}

export function Section({ title, description, children, grid }: FieldSectionProps) {
  return (
    <div className="relative overflow-hidden rounded-lg p-6 bg-card border border-border shadow-sm h-full">
      <div className="relative h-full">
        <div className="space-y-6 h-full">
          <div>
            <h3 className="text-lg font-display text-foreground flex items-center gap-2">{title}</h3>
            {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
          </div>
          {grid ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-x-6 gap-y-4">
              {children}
            </div>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}
