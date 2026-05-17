import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronDown } from "@/components/icons/themed-icons";
import { IconPlay, IconPause } from "@/components/icons";
import type { AnimCard } from "./animationCatalog";

function AnimationCardGrid({ cards }: { cards: AnimCard[] }) {
  const [playingIds, setPlayingIds] = useState<Set<string>>(new Set());

  function togglePlaying(id: string) {
    setPlayingIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-4">
      {cards.map((card) => {
        const isPlaying = playingIds.has(card.id);
        return (
          <Card key={card.id} className="overflow-hidden">
            <div className="flex flex-col items-center justify-center bg-muted/40 border-b border-border py-10 min-h-[180px]">
              {card.preview(isPlaying)}
            </div>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground leading-snug">
                    {card.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                    {card.description}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={isPlaying ? "default" : "outline"}
                  className="shrink-0 gap-1.5"
                  onClick={() => togglePlaying(card.id)}
                  aria-label={isPlaying ? `Pause ${card.name}` : `Play ${card.name}`}
                >
                  {isPlaying ? (
                    <>
                      <IconPause className="w-3.5 h-3.5" />
                      Pause
                    </>
                  ) : (
                    <>
                      <IconPlay className="w-3.5 h-3.5" />
                      Play
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

interface AnimationFamilyCollapsibleProps {
  title: string;
  count: number;
  cards: AnimCard[];
  defaultOpen?: boolean;
}

export function AnimationFamilyCollapsible({
  title,
  count,
  cards,
  defaultOpen = false,
}: AnimationFamilyCollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card className="overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
            aria-expanded={open}
          >
            {open ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            )}
            <span className="text-sm font-semibold text-foreground">{title}</span>
            <span className="text-xs text-muted-foreground ml-auto">
              {count} animation{count !== 1 ? "s" : ""}
            </span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-4 border-t border-border/40">
            <AnimationCardGrid cards={cards} />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
