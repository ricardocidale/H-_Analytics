/**
 * Rebecca — Earth Geometry
 * Sacred feminine geometry and elemental flow.
 *
 * Dependencies: react, framer-motion, tailwindcss
 */
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export const REBECCA_GEO_SEQUENCE_META = {
  agent: 'Rebecca',
  name: 'Earth Geometry',
  description: 'Sacred feminine geometry and elemental flow.',
  accent: '#f59e0b',
} as const;

const geoSequences = [
  {
    id: 'chalice',
    paths: [
      "M 20 25 L 80 25 L 50 65 Z",
      "M 50 65 L 50 90",
      "M 30 90 L 70 90"
    ]
  },
  {
    id: 'womb',
    paths: [
      "M 50 10 L 90 50 L 50 90 L 10 50 Z",
      "M 50 30 L 70 50 L 50 70 L 30 50 Z",
      "M 50 45 a 5 5 0 1 0 0 10 a 5 5 0 1 0 0 -10"
    ]
  },
  {
    id: 'moon_cycles',
    paths: [
      "M 50 20 a 30 30 0 1 0 0 60 a 30 30 0 1 0 0 -60",
      "M 20 50 A 20 20 0 0 1 50 50 A 20 20 0 0 0 20 50",
      "M 80 50 A 20 20 0 0 0 50 50 A 20 20 0 0 1 80 50"
    ]
  },
  {
    id: 'water_flow',
    paths: [
      "M 10 30 C 30 10, 70 50, 90 30",
      "M 10 50 C 30 30, 70 70, 90 50",
      "M 10 70 C 30 50, 70 90, 90 70"
    ]
  }
];

const WAVE_PATHS: Record<string, Record<number, { frames: string[]; duration: number }>> = {};

export function RebeccaGeoSequence({ size = 112, className = "" }: { size?: number, className?: string }) {
  const [step, setStep] = useState(0);
  const color = REBECCA_GEO_SEQUENCE_META.accent;
  const filterId = React.useId().replace(/:/g, '');

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | undefined;
    const tick = () => {
      if (cancelled) return;
      setStep(s => (s + 1) % geoSequences.length);
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
      const current = geoSequences[step];
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
          <filter id={`geo-roughness-${filterId}`}>
            <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="3" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.5" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>

      <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-stone-800 to-orange-950 shadow-inner border border-stone-600/50 overflow-hidden">
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

      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full p-3 drop-shadow-md" style={{ filter: `url(#geo-roughness-${filterId})` }}>
        <AnimatePresence mode="wait">
          <motion.g
            key={geoSequences[step].id}
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
            {geoSequences[step].paths.map((d: string, i: number) => {
              const wave = WAVE_PATHS[geoSequences[step].id]?.[i];
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
              const traceIdx = (retrace?.stroke ?? 0) % geoSequences[step].paths.length;
              const traceKey = retrace?.key ?? 0;
              const wave = WAVE_PATHS[geoSequences[step].id]?.[traceIdx];
              const d = wave ? wave.frames[0] : geoSequences[step].paths[traceIdx];
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

            {geoSequences[step].paths.map((d: string, i: number) => {
              const wave = WAVE_PATHS[geoSequences[step].id]?.[i];
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
