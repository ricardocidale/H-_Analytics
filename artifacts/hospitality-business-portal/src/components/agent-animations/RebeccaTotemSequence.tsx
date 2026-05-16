/**
 * Rebecca — Ancestral Totems
 * Feminine spirit guides and matriarchal totems.
 *
 * Dependencies: react, framer-motion, tailwindcss
 */
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export const REBECCA_TOTEM_SEQUENCE_META = {
  agent: 'Rebecca',
  name: 'Ancestral Totems',
  description: 'Feminine spirit guides and matriarchal totems.',
  accent: '#d6d3d1',
} as const;

const totemSequences = [
  {
    id: 'owl',
    paths: [
      "M 20 40 C 20 10, 80 10, 80 40 C 80 80, 50 90, 50 90 C 50 90, 20 80, 20 40 Z",
      "M 40 40 a 8 8 0 1 0 -16 0 a 8 8 0 1 0 16 0",
      "M 76 40 a 8 8 0 1 0 -16 0 a 8 8 0 1 0 16 0",
      "M 45 55 L 55 55 L 50 65 Z"
    ]
  },
  {
    id: 'lioness',
    paths: [
      "M 20 30 L 30 35 C 40 25, 60 25, 70 35 L 80 30 L 75 55 C 70 80, 50 90, 50 90 C 50 90, 30 80, 25 55 Z",
      "M 35 50 L 45 45 M 65 50 L 55 45",
      "M 45 65 L 55 65 L 50 75 Z"
    ]
  },
  {
    id: 'goddess_mask',
    paths: [
      "M 30 30 C 30 5, 70 5, 70 30 C 70 70, 50 90, 50 90 C 50 90, 30 70, 30 30 Z",
      "M 35 45 Q 42 35 48 45",
      "M 65 45 Q 58 35 52 45",
      "M 50 60 L 50 65",
      "M 43 75 Q 50 85 57 75"
    ]
  }
];

const WAVE_PATHS: Record<string, Record<number, { frames: string[]; duration: number }>> = {};

export function RebeccaTotemSequence({ size = 112, className = "" }: { size?: number, className?: string }) {
  const [step, setStep] = useState(0);
  const color = REBECCA_TOTEM_SEQUENCE_META.accent;
  const filterId = React.useId().replace(/:/g, '');

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | undefined;
    const tick = () => {
      if (cancelled) return;
      setStep(s => (s + 1) % totemSequences.length);
      timeoutId = window.setTimeout(tick, 1100 + Math.random() * 1300);
    };
    timeoutId = window.setTimeout(tick, 1100 + Math.random() * 1300);
    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, []);

  const [retrace, setRetrace] = useState<{ stroke: number; key: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | undefined;
    const fire = () => {
      if (cancelled) return;
      const current = totemSequences[step];
      const stroke = Math.floor(Math.random() * current.paths.length);
      setRetrace(prev => ({ stroke, key: (prev?.key ?? 0) + 1 }));
      timeoutId = window.setTimeout(fire, 700 + Math.random() * 1500);
    };
    timeoutId = window.setTimeout(fire, 500 + Math.random() * 800);
    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [step]);

  const [flickerKey, setFlickerKey] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | undefined;
    const tick = () => {
      if (cancelled) return;
      setFlickerKey(k => k + 1);
      timeoutId = window.setTimeout(tick, 1800 + Math.random() * 2800);
    };
    timeoutId = window.setTimeout(tick, 900);
    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, []);

  const [embers, setEmbers] = useState<{ id: number; x: number; y: number }[]>([]);
  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | undefined;
    let nextId = 0;
    const fire = () => {
      if (cancelled) return;
      const x = 20 + Math.random() * 60;
      const y = 60 + Math.random() * 30;
      const id = ++nextId;
      setEmbers(prev => [...prev, { id, x, y }]);
      window.setTimeout(() => {
        setEmbers(prev => prev.filter(e => e.id !== id));
      }, 1800);
      timeoutId = window.setTimeout(fire, 450 + Math.random() * 1100);
    };
    timeoutId = window.setTimeout(fire, 300);
    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, []);

  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      <svg width="0" height="0" className="absolute">
        <defs>
          <filter id={`totem-roughness-${filterId}`}>
            <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="3" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.5" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>

      <div className="absolute inset-0 rounded-full bg-gradient-to-b from-stone-800 to-stone-950 shadow-inner border border-stone-600/50 overflow-hidden">
        <motion.div
          className="absolute inset-0 rounded-full bg-orange-950/30 mix-blend-overlay"
          animate={{ opacity: [0.3, 0.55, 0.4, 0.7, 0.35, 0.45, 0.3] }}
          transition={{ duration: 7.6, repeat: Infinity, ease: 'easeInOut', times: [0, 0.18, 0.32, 0.55, 0.72, 0.88, 1] }}
        />

        <motion.div
          key={`flicker-${flickerKey}`}
          className="absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle at ${30 + Math.random() * 40}% ${30 + Math.random() * 40}%, ${color}55, transparent 60%)`,
            mixBlendMode: 'screen',
            pointerEvents: 'none',
          }}
          initial={{ opacity: 0.85 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.65, ease: 'easeOut' }}
        />

        {embers.map(e => (
          <motion.div
            key={e.id}
            className="absolute rounded-full"
            style={{
              left: `${e.x}%`,
              top: `${e.y}%`,
              width: Math.max(3, size * 0.06),
              height: Math.max(3, size * 0.06),
              background: '#ffffff',
              boxShadow: `0 0 ${size * 0.18}px ${color}, 0 0 ${size * 0.06}px #ffffff`,
              pointerEvents: 'none',
            }}
            initial={{ opacity: 0, x: 0, y: 0, scale: 0.4 }}
            animate={{
              opacity: [0, 1, 0.8, 0],
              x: [0, (Math.random() - 0.5) * size * 0.12, (Math.random() - 0.5) * size * 0.2],
              y: -size * 0.55,
              scale: [0.4, 1.1, 0.6, 0.3],
            }}
            transition={{ duration: 1.7, ease: 'easeOut', times: [0, 0.2, 0.7, 1] }}
          />
        ))}
      </div>

      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full p-3 drop-shadow-md" style={{ filter: `url(#totem-roughness-${filterId})` }}>
        <AnimatePresence mode="wait">
          <motion.g
            key={totemSequences[step].id}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{
              opacity: 1,
              scale: [1, 1.022, 1.008, 1.03, 1],
            }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            transition={{
              opacity: { duration: 0.35 },
              scale: { duration: 3.2, repeat: Infinity, ease: 'easeInOut', times: [0, 0.28, 0.5, 0.78, 1] },
            }}
            style={{ transformOrigin: '50% 50%' }}
          >
            {totemSequences[step].paths.map((d: string, i: number) => {
              const wave = WAVE_PATHS[totemSequences[step].id]?.[i];
              return (
                <motion.path
                  key={`base-${i}`}
                  d={wave ? wave.frames[0] : d}
                  fill="none"
                  stroke={color}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{
                    pathLength: 1,
                    opacity: [0.55, 1, 0.7, 0.95, 0.6, 1, 0.75],
                    ...(wave ? { d: wave.frames } : {}),
                  }}
                  transition={{
                    pathLength: { duration: 0.5, delay: Math.min(i * 0.05, 0.4), ease: 'easeOut' },
                    opacity: { duration: 1.6 + ((i * 31) % 11) * 0.13, repeat: Infinity, ease: 'easeInOut', delay: (i % 3) * 0.18 },
                    ...(wave ? { d: { duration: wave.duration, repeat: Infinity, ease: 'easeInOut', delay: i * 0.4 } } : {}),
                  }}
                />
              );
            })}

            {(() => {
              const traceIdx = (retrace?.stroke ?? 0) % totemSequences[step].paths.length;
              const traceKey = retrace?.key ?? 0;
              const wave = WAVE_PATHS[totemSequences[step].id]?.[traceIdx];
              const d = wave ? wave.frames[0] : totemSequences[step].paths[traceIdx];
              return (
                <motion.path
                  key={`tracer-${traceKey}`}
                  d={d}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="6 400"
                  style={{ filter: `drop-shadow(0 0 4px ${color})`, mixBlendMode: 'screen' }}
                  initial={{ strokeDashoffset: 0, opacity: 1 }}
                  animate={{
                    strokeDashoffset: -400,
                    opacity: [1, 1, 0.6, 0],
                    ...(wave ? { d: wave.frames } : {}),
                  }}
                  transition={{
                    strokeDashoffset: { duration: 1.1, ease: 'linear' },
                    opacity: { duration: 1.1, ease: 'easeOut', times: [0, 0.6, 0.85, 1] },
                    ...(wave ? { d: { duration: wave.duration, repeat: Infinity, ease: 'easeInOut' } } : {}),
                  }}
                />
              );
            })()}

            {totemSequences[step].paths.map((d: string, i: number) => {
              const wave = WAVE_PATHS[totemSequences[step].id]?.[i];
              return (
                <motion.path
                  key={`shimmer-${i}-${step}`}
                  d={wave ? wave.frames[0] : d}
                  fill="none"
                  stroke={color}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="2 18"
                  style={{ mixBlendMode: 'screen', opacity: 0.7 }}
                  initial={{ strokeDashoffset: 0 }}
                  animate={{
                    strokeDashoffset: i % 2 === 0 ? -200 : 200,
                    ...(wave ? { d: wave.frames } : {}),
                  }}
                  transition={{
                    strokeDashoffset: { duration: 4 + (i % 3) * 0.7, repeat: Infinity, ease: 'linear' },
                    ...(wave ? { d: { duration: wave.duration, repeat: Infinity, ease: 'easeInOut', delay: i * 0.4 } } : {}),
                  }}
                />
              );
            })}
          </motion.g>
        </AnimatePresence>
      </svg>
    </div>
  );
}
