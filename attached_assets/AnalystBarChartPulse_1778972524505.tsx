/**
 * The Analyst — Bar Chart Pulse
 * Volumetric bars pulsing across time as live metrics rebalance.
 *
 * Dependencies: react, motion (motion/react), tailwindcss
 */
import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';

export const ANALYST_BAR_CHART_PULSE_META = {
  agent: 'Cube',
  name: 'Bar Chart Pulse',
  description: 'Volumetric bars pulsing across time as live metrics rebalance.',
  accent: '#22d3ee',
} as const;

const SCENES = [
  [30, 30, 30, 30, 30, 30, 30, 30, 30],
  [60, 30, 30, 30, 90, 30, 30, 30, 60],
  [30, 80, 30, 80, 30, 80, 30, 80, 30],
  [40, 60, 90, 30, 40, 60, 20, 30, 40],
  [90, 60, 40, 60, 40, 30, 40, 30, 20],
  [140, 40, 40, 40, 140, 40, 40, 40, 140],
  [40, 40, 140, 40, 140, 40, 140, 40, 40],
  [30, 60, 30, 60, 160, 60, 30, 60, 30],
  [110, 90, 70, 90, 70, 50, 70, 50, 30],
];

const COLORS = [
  { top: '#38bdf8', left: '#0284c7', right: '#0c4a6e' },
  { top: '#818cf8', left: '#4f46e5', right: '#312e81' },
  { top: '#a78bfa', left: '#7c3aed', right: '#4c1d95' },
  { top: '#c084fc', left: '#9333ea', right: '#5b21b6' },
  { top: '#f0abfc', left: '#c026d3', right: '#831843' },
  { top: '#f472b6', left: '#db2777', right: '#9d174d' },
  { top: '#fb7185', left: '#e11d48', right: '#881337' },
  { top: '#f43f5e', left: '#be123c', right: '#4c0519' },
  { top: '#fb923c', left: '#ea580c', right: '#7c2d12' },
];

const W = 28;
const dx = W * 0.866;
const dy = W * 0.5;
const G = 12;

const topPath = (cx: number, cy: number, h: number) =>
  `M ${cx},${cy - h - dy} L ${cx + dx},${cy - h} L ${cx},${cy - h + dy} L ${cx - dx},${cy - h} Z`;
const rightPath = (cx: number, cy: number, h: number) =>
  `M ${cx},${cy - h + dy} L ${cx + dx},${cy - h} L ${cx + dx},${cy} L ${cx},${cy + dy} Z`;
const leftPath = (cx: number, cy: number, h: number) =>
  `M ${cx - dx},${cy - h} L ${cx},${cy - h + dy} L ${cx},${cy + dy} L ${cx - dx},${cy} Z`;

export function AnalystBarChartPulse({
  size,
  className = '',
}: { size?: number; className?: string }) {
  const [sceneIndex, setSceneIndex] = useState(0);
  const sizeStyle = size ? { width: size, height: size } : { width: '100%', height: '100%' };

  useEffect(() => {
    const interval = setInterval(() => {
      setSceneIndex(prev => {
        let next = Math.floor(Math.random() * SCENES.length);
        if (next === prev) next = (next + 1) % SCENES.length;
        return next;
      });
    }, 700);
    return () => clearInterval(interval);
  }, []);

  const heights = SCENES[sceneIndex];

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden ${className}`}
      style={sizeStyle}
    >
      <svg
        viewBox="0 0 360 360"
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full"
        style={{ overflow: 'hidden' }}
      >
        <g transform="translate(180, 250)">
          {heights.map((h, i) => {
            const r = Math.floor(i / 3);
            const c = i % 3;
            const cx = (c - r) * (dx + G);
            const cy = (c + r) * (dy + G / 2) - 30;
            const color = COLORS[i];
            return (
              <g key={i}>
                <motion.path animate={{ d: leftPath(cx, cy, h) }} fill={color.left}
                  transition={{ type: 'spring', stiffness: 140, damping: 12, mass: 0.8 }} />
                <motion.path animate={{ d: rightPath(cx, cy, h) }} fill={color.right}
                  transition={{ type: 'spring', stiffness: 140, damping: 12, mass: 0.8 }} />
                <motion.path animate={{ d: topPath(cx, cy, h) }} fill={color.top}
                  transition={{ type: 'spring', stiffness: 140, damping: 12, mass: 0.8 }} />
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

export function AnalystBarChartPulseCard({ size = 112 }: { size?: number }) {
  return (
    <div className="flex flex-col items-center text-center space-y-4">
      <div
        className="rounded-xl bg-stone-950 shadow-inner border border-stone-800/80 flex items-center justify-center overflow-hidden"
        style={{ width: size, height: size }}
      >
        <AnalystBarChartPulse size={size} />
      </div>
      <div className="space-y-1">
        <h3 className="text-stone-100 font-semibold">{ANALYST_BAR_CHART_PULSE_META.agent}</h3>
        <p className="text-stone-400 text-xs uppercase tracking-wider font-semibold">
          {ANALYST_BAR_CHART_PULSE_META.name}
        </p>
        <p className="text-stone-500 text-sm leading-relaxed max-w-[220px]">
          {ANALYST_BAR_CHART_PULSE_META.description}
        </p>
      </div>
    </div>
  );
}
