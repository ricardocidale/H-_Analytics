import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { IconGlobe } from "@/components/icons";
import { Loader2, ChevronDown } from "@/components/icons/themed-icons";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface RegulatorySection {
  title: string;
  items: string[];
}

interface RegulatoryProfile {
  countryName: string;
  countryCode: string;
  sections: RegulatorySection[];
  summary?: string;
  lastUpdated?: string;
}

export default function RegulatoryNotesPanel({ countryCode }: { countryCode: string | null | undefined }) {
  const [isOpen, setIsOpen] = useState(false);

  const enabled = !!countryCode && countryCode !== "US";

  const { data: profile, isLoading, isError } = useQuery<RegulatoryProfile>({
    queryKey: [`/api/regulatory/${countryCode}`],
    enabled,
    retry: false,
    staleTime: 30 * 60 * 1000,
  });

  if (!enabled) return null;

  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="py-4 flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading regulatory info for {countryCode}…
        </CardContent>
      </Card>
    );
  }

  if (isError || !profile || !profile.sections?.length) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="bg-card border-border" data-testid="regulatory-notes-panel">
        <CollapsibleTrigger className="w-full text-left" data-testid="trigger-regulatory-notes">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <IconGlobe className="w-5 h-5 text-primary" />
              <CardTitle className="text-sm font-semibold">Regulatory Notes</CardTitle>
              <Badge variant="secondary" className="text-xs" data-testid="text-regulatory-country">
                {profile.countryName ?? countryCode}
              </Badge>
            </div>
            <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {profile.summary && (
              <p className="text-sm text-muted-foreground">{profile.summary}</p>
            )}

            {profile.sections.map((section, i) => (
              <div key={i}>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">{section.title}</h4>
                <ul className="space-y-1">
                  {section.items.map((item, j) => (
                    <li key={j} className="text-sm text-foreground flex items-start gap-2" data-testid={`regulatory-item-${i}-${j}`}>
                      <span className="text-primary mt-0.5 shrink-0">•</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {profile.lastUpdated && (
              <p className="text-[10px] text-muted-foreground">
                Last updated: {profile.lastUpdated}
              </p>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
