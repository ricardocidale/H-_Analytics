import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { IconBuilding2, IconPlay, IconCalendar, IconMapPin, IconInfo } from "@/components/icons";
import { AnimatedPage } from "@/components/graphics/AnimatedPage";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TimelineEvent {
  id: string;
  date: string;
  type: "acquisition" | "operations";
  propertyName: string;
  location: string;
  detail: string;
  color: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function formatCurrency(value: number): string {
  return "$" + value.toLocaleString("en-US");
}

export default function TimelineView({ embedded }: { embedded?: boolean }) {
  const properties = useStore((s) => s.properties);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { events, minDate, maxDate, totalMonths } = useMemo(() => {
    const items: TimelineEvent[] = [];
    let minTime = Infinity;
    let maxTime = -Infinity;

    for (const p of properties) {
      const acqTime = new Date(p.acquisitionDate).getTime();
      const opsTime = new Date(p.operationsStartDate).getTime();
      
      minTime = Math.min(minTime, acqTime, opsTime);
      maxTime = Math.max(maxTime, acqTime, opsTime);

      items.push({
        id: `${p.id}-acquisition`,
        date: p.acquisitionDate,
        type: "acquisition",
        propertyName: p.name,
        location: p.location,
        detail: `Purchase: ${formatCurrency(p.purchasePrice)}`,
        color: "var(--primary)",
      });
      items.push({
        id: `${p.id}-operations`,
        date: p.operationsStartDate,
        type: "operations",
        propertyName: p.name,
        location: p.location,
        detail: `Rooms: ${p.roomCount}, ADR: ${formatCurrency(p.startAdr)}`,
        color: "hsl(var(--chart-2))",
      });
    }

    const sorted = [...items].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    const minD = minTime === Infinity ? new Date() : new Date(minTime);
    const maxD = maxTime === -Infinity ? new Date() : new Date(maxTime);
    
    // Add 1 month padding to the end
    maxD.setMonth(maxD.getMonth() + 1);
    
    const diffMonths = (maxD.getFullYear() - minD.getFullYear()) * 12 + (maxD.getMonth() - minD.getMonth());

    return { 
      events: sorted, 
      minDate: minD, 
      maxDate: maxD, 
      totalMonths: Math.max(diffMonths, 1) 
    };
  }, [properties]);

  const getPosition = (dateStr: string) => {
    const date = new Date(dateStr);
    const diffMonths = (date.getFullYear() - minDate.getFullYear()) * 12 + (date.getMonth() - minDate.getMonth());
    return (diffMonths / totalMonths) * 100;
  };

  const propertySpans = useMemo(() => {
    return properties.map(p => ({
      id: p.id,
      name: p.name,
      start: getPosition(p.acquisitionDate),
      end: getPosition(p.operationsStartDate),
      color: "var(--primary)"
    })).sort((a, b) => a.start - b.start);
  }, [properties, getPosition]);

  return (
    <AnimatedPage>
      <TooltipProvider>
        <div data-testid="timeline-view" className={embedded ? "" : "min-h-screen bg-background p-6 md:p-10"}>
          {!embedded && (
            <div className="mb-10 text-center">
              <h1 className="text-3xl font-bold mb-2" data-testid="timeline-title">
                Portfolio Timeline
              </h1>
              <p className="text-muted-foreground">Chronological roadmap of portfolio expansion and operational starts.</p>
            </div>
          )}

          <div className="max-w-6xl mx-auto space-y-12">
            {/* Legend & Summary */}
            <Card className="p-4 border-dashed bg-muted/30">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-primary" />
                    <span className="text-xs font-medium">Acquisition</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-secondary" />
                    <span className="text-xs font-medium">Operations</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-8 rounded-full bg-primary/20" />
                    <span className="text-xs font-medium">Acquisition-to-Ops Span</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <IconInfo className="w-3.5 h-3.5" />
                  <span>Timeline covers {totalMonths} months</span>
                </div>
              </div>
            </Card>

            {/* Visual Timeline Section */}
            <div className="relative pt-12 pb-20 px-4 overflow-x-auto">
              <div className="min-w-[800px] relative">
                {/* Main horizontal line */}
                <div className="absolute top-1/2 left-0 right-0 h-1 bg-border -translate-y-1/2 rounded-full" />
                
                {/* Month/Year Markers */}
                <div className="absolute top-1/2 left-0 right-0 flex justify-between px-2 -translate-y-1/2 pointer-events-none">
                  {Array.from({ length: 5 }).map((_, i) => {
                    const monthOffset = Math.floor((totalMonths / 4) * i);
                    const d = new Date(minDate);
                    d.setMonth(d.getMonth() + monthOffset);
                    return (
                      <div key={i} className="flex flex-col items-center">
                        <div className="h-4 w-px bg-border mb-8" />
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                          {d.toLocaleDateString("en-US", { month: "short", year: "2-digit" })}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Property Spans (Gantt-like bars) */}
                <div className="relative h-40">
                  {propertySpans.map((span, idx) => (
                    <div
                      key={span.id}
                      className="absolute h-8 rounded-md bg-primary/10 border border-primary/20 flex items-center px-2 transition-all hover:bg-primary/20"
                      style={{
                        left: `${span.start}%`,
                        width: `${Math.max(span.end - span.start, 2)}%`,
                        top: `${(idx % 4) * 40}px`,
                      }}
                    >
                      <span className="text-[10px] font-semibold truncate text-primary uppercase">
                        {span.name}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Event Nodes */}
                <div className="absolute top-1/2 left-0 right-0 -translate-y-1/2 h-0">
                  {events.map((evt, i) => {
                    const pos = getPosition(evt.date);
                    const isAcq = evt.type === "acquisition";
                    const Icon = isAcq ? IconBuilding2 : IconPlay;
                    
                    return (
                      <Tooltip key={evt.id}>
                        <TooltipTrigger asChild>
                          <div
                            className="absolute -translate-x-1/2 -translate-y-1/2 group cursor-pointer"
                            style={{ left: `${pos}%` }}
                            data-testid={`timeline-node-${i}`}
                          >
                            <div 
                              className={`
                                w-8 h-8 rounded-full border-2 border-background shadow-lg flex items-center justify-center transition-transform group-hover:scale-110
                                ${isAcq ? "bg-primary" : "bg-secondary"}
                              `}
                            >
                              <Icon className="w-4 h-4 text-white" />
                            </div>
                            <div 
                              className={`
                                absolute left-1/2 -translate-x-1/2 w-max max-w-[120px] text-center
                                ${i % 2 === 0 ? "bottom-full mb-3" : "top-full mt-3"}
                              `}
                            >
                              <p className="text-[10px] font-bold leading-tight">{evt.propertyName}</p>
                              <p className="text-[9px] text-muted-foreground">{formatDate(evt.date)}</p>
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side={i % 2 === 0 ? "top" : "bottom"} className="p-3 max-w-xs">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <Badge variant={isAcq ? "default" : "outline"} className="text-[10px] uppercase h-5">
                                {evt.type}
                              </Badge>
                              <span className="text-xs font-bold">{evt.propertyName}</span>
                            </div>
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <IconMapPin className="w-3 h-3" />
                              {evt.location}
                            </div>
                            <p className="text-xs border-t pt-1.5 mt-1.5">{evt.detail}</p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* List View for Reference (Cleaned up) */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <IconCalendar className="w-5 h-5 text-primary" />
                Event Log
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {events.map((evt, i) => (
                  <Card key={evt.id} className="p-4 hover:border-primary/50 transition-colors" data-testid={`timeline-event-${i}`}>
                    <div className="flex justify-between items-start mb-3">
                      <Badge 
                        variant="secondary" 
                        className="text-[10px] font-bold uppercase"
                        style={evt.type === "operations" ? { backgroundColor: "hsl(var(--secondary) / 0.1)", color: "hsl(var(--secondary))" } : {}}
                      >
                        {evt.type}
                      </Badge>
                      <span className="text-[10px] font-medium text-muted-foreground">{formatDate(evt.date)}</span>
                    </div>
                    <h4 className="font-bold text-sm mb-1">{evt.propertyName}</h4>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-3">
                      <IconMapPin className="w-3 h-3" />
                      {evt.location}
                    </div>
                    <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">{evt.detail}</p>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </div>
      </TooltipProvider>
    </AnimatedPage>
  );
}
