/**
 * animationCatalog.tsx — shared animation card definitions for Brand Assets
 * and Intelligence Animations page. Both surfaces import from here to stay in sync.
 */

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

export interface AnimCard {
  id: string;
  name: string;
  description: string;
  preview: (playing: boolean) => React.ReactNode;
}

export const REBECCA_CARDS: AnimCard[] = [
  {
    id: "rebecca-orb",
    name: "Rebecca Orb",
    description: "Ambient thinking orb — the core visual identity for the Rebecca persona.",
    preview: (playing) =>
      playing ? <RebeccaOrb phase="thinking" size="lg" /> : null,
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

export const ANALYST_CARDS: AnimCard[] = [
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
