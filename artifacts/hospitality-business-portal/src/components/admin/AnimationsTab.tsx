import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconPlay, IconPause } from "@/components/icons";
import { HplusLogoAnimated, AnalystCubeIcon } from "@/components/graphics";

interface AnimationCard {
  id: string;
  name: string;
  description: string;
  preview: (playing: boolean) => React.ReactNode;
}

const ANIMATION_CARDS: AnimationCard[] = [
  {
    id: "hplus-logo",
    name: "H+ Logo",
    description: "Floating pulse animation for the H+ Analytics wordmark",
    preview: (playing) => (
      <HplusLogoAnimated
        size={88}
        playing={playing}
        decorative
      />
    ),
  },
  {
    id: "cube",
    name: "Cube",
    description: "Animated 3-D Rubik's-style cube mark in Swiss modernist palette",
    preview: (playing) => (
      <AnalystCubeIcon
        size={80}
        playing={playing}
        decorative
      />
    ),
  },
];

export default function AnimationsTab() {
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
    <div>
      <p className="text-sm text-muted-foreground mb-6">
        Motion and animation assets available for use across the portal. Press play to preview each animation.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {ANIMATION_CARDS.map((card) => {
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
    </div>
  );
}
