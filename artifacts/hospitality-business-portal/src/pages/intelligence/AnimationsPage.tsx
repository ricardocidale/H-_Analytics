import { useState } from "react";
import { CurrentThemeTab } from "@/components/ui/tabs";
import type { CurrentThemeTabItem } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconPlay, IconPause } from "@/components/icons";
import { REBECCA_CARDS, ANALYST_CARDS } from "@/components/admin/brand-assets/animationCatalog";
import type { AnimCard } from "@/components/admin/brand-assets/animationCatalog";

type AnimTab = "rebecca" | "analyst";

const TABS: CurrentThemeTabItem[] = [
  { value: "rebecca", label: "Rebecca" },
  { value: "analyst", label: "The Analyst" },
];

function AnimationCardGrid({ cards }: { cards: AnimCard[] }) {
  const [playingIds, setPlayingIds] = useState<Set<string>>(new Set());

  function togglePlaying(id: string) {
    setPlayingIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
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

export default function AnimationsPage() {
  const [activeTab, setActiveTab] = useState<AnimTab>("rebecca");

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-6">
        Motion and animation assets for agent personas. Press play to preview each animation.
      </p>

      <div className="mb-6">
        <CurrentThemeTab
          tabs={TABS}
          activeTab={activeTab}
          onTabChange={(v) => setActiveTab(v as AnimTab)}
        />
      </div>

      {activeTab === "rebecca" && <AnimationCardGrid cards={REBECCA_CARDS} />}
      {activeTab === "analyst" && <AnimationCardGrid cards={ANALYST_CARDS} />}
    </div>
  );
}
