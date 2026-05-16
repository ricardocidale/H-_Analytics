import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconPlay, IconPause } from "@/components/icons";
import { CurrentThemeTab } from "@/components/ui/tabs";
import type { CurrentThemeTabItem } from "@/components/ui/tabs";
import { HplusLogoAnimated, AnalystCubeIcon } from "@/components/graphics";
import {
  RebeccaOrb,
  RebeccaOrbitAdvanced,
  RebeccaOrbit,
  RebeccaCaveSequence,
  RebeccaGeoSequence,
  RebeccaTotemSequence,
  RebeccaAlive,
  AnalystBarChartPulse,
  AnalystExpandingSolver,
  AnalystNexusCore,
  AnalystQuantumSolver,
  AnalystSwissCube,
  AnalystThinkingCube,
} from "@/components/agent-animations";

type AnimTab = "rebecca" | "analyst";

const TABS: CurrentThemeTabItem[] = [
  { value: "rebecca", label: "Rebecca" },
  { value: "analyst", label: "The Analyst" },
];

interface AnimCard {
  id: string;
  name: string;
  description: string;
  preview: (playing: boolean) => React.ReactNode;
}

const REBECCA_CARDS: AnimCard[] = [
  {
    id: "rebecca-orb",
    name: "Rebecca Orb",
    description: "Ambient thinking orb — the core visual identity for the Rebecca persona.",
    preview: (playing) =>
      playing ? (
        <RebeccaOrb phase="thinking" size="lg" />
      ) : null,
  },
  {
    id: "rebecca-orbit-advanced",
    name: "Deep Thinking Orbital",
    description: "9 distinct thought patterns: shape shifts, accent pulses, core nudges, and more.",
    preview: (playing) =>
      playing ? <RebeccaOrbitAdvanced size={100} /> : null,
  },
  {
    id: "rebecca-orbit",
    name: "Swiss Orbit",
    description: "Minimalist orbital rings in stone palette, rotating with calm precision.",
    preview: (playing) =>
      playing ? <RebeccaOrbit size={100} /> : null,
  },
  {
    id: "rebecca-cave",
    name: "Lascaux Sequence",
    description: "Archetypal feminine storytelling drawn into the rock.",
    preview: (playing) =>
      playing ? <RebeccaCaveSequence size={100} /> : null,
  },
  {
    id: "rebecca-geo",
    name: "Earth Geometry",
    description: "Sacred geometry forms cycling through ancient patterns.",
    preview: (playing) =>
      playing ? <RebeccaGeoSequence size={100} /> : null,
  },
  {
    id: "rebecca-totem",
    name: "Totem Sequence",
    description: "Stacked archetypal forms rising and transforming in sequence.",
    preview: (playing) =>
      playing ? <RebeccaTotemSequence size={100} /> : null,
  },
  {
    id: "rebecca-alive",
    name: "Alive Merged Geometry",
    description: "12 merged Lascaux and Earth geometry instances executing randomly as one alive orbital entity.",
    preview: (playing) =>
      playing ? <RebeccaAlive size={100} /> : null,
  },
];

const ANALYST_CARDS: AnimCard[] = [
  {
    id: "hplus-logo",
    name: "H+ Logo",
    description: "Floating pulse animation for the H+ Analytics wordmark.",
    preview: (playing) => (
      <HplusLogoAnimated size={88} playing={playing} decorative />
    ),
  },
  {
    id: "analyst-cube",
    name: "Analyst Cube",
    description: "Animated 3-D Rubik's-style cube mark in Swiss modernist palette.",
    preview: (playing) => (
      <AnalystCubeIcon size={80} playing={playing} decorative />
    ),
  },
  {
    id: "analyst-nexus",
    name: "Nexus Core",
    description: "Shape-shifting algorithms processing multi-layered data.",
    preview: (playing) =>
      playing ? <AnalystNexusCore size={100} /> : null,
  },
  {
    id: "analyst-bar",
    name: "Bar Chart Pulse",
    description: "Volumetric bars pulsing across time as live metrics rebalance.",
    preview: (playing) =>
      playing ? <AnalystBarChartPulse size={100} /> : null,
  },
  {
    id: "analyst-quantum",
    name: "Quantum Solver",
    description: "Multi-dimensional logic engine snapping complexity into focus.",
    preview: (playing) =>
      playing ? <AnalystQuantumSolver size={100} /> : null,
  },
  {
    id: "analyst-expanding",
    name: "Expanding Solver",
    description: "Quantum parts exploding and contracting dynamically as they solve.",
    preview: (playing) =>
      playing ? <AnalystExpandingSolver size={100} /> : null,
  },
  {
    id: "analyst-swiss",
    name: "Swiss Modern",
    description: "Monochrome minimalism moving with rapid, calculated precision.",
    preview: (playing) =>
      playing ? <AnalystSwissCube size={100} /> : null,
  },
  {
    id: "analyst-thinking",
    name: "Thinking Cube",
    description: "Swiss modern logic brought to life with pulsing brainwaves and thought-sparks.",
    preview: (playing) =>
      playing ? <AnalystThinkingCube size={100} /> : null,
  },
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
