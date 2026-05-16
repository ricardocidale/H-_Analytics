/**
 * Rebecca — Lascaux Sequence
 * Archetypal feminine storytelling drawn into the rock.
 *
 * Dependencies: react, motion (motion/react), tailwindcss
 */
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

export const REBECCA_CAVE_SEQUENCE_META = {
  agent: 'Lascoux animation',
  name: 'Lascaux Sequence',
  description: 'Archetypal feminine storytelling drawn into the rock.',
  accent: '#ea580c',
} as const;

const caveSequences = [
  {
    id: 'goddess',
    paths: [
      "M 45 20 A 5 5 0 1 0 55 20 A 5 5 0 1 0 45 20", // Head
      "M 30 15 C 40 5, 60 5, 70 15", // Horns/Headdress
      "M 25 35 C 20 25, 40 25, 45 25", // Left Arm
      "M 75 35 C 80 25, 60 25, 55 25", // Right Arm
      "M 40 35 A 5 5 0 1 0 50 35", // Left Breast
      "M 50 35 A 5 5 0 1 0 60 35", // Right Breast
      "M 45 35 C 20 50, 20 85, 50 90 C 80 85, 80 50, 55 35 Z", // Womb/Hips
      "M 50 65 A 8 8 0 1 0 49.9 65", // Womb Center
      "M 50 65 C 48 60, 55 58, 55 65 C 55 70, 45 70, 45 65" // Inner Spiral
    ]
  },
  {
    id: 'stag',
    paths: [
      "M 30 45 Q 45 40 60 45 Q 75 40 85 55 Q 85 70 80 75 Q 75 85 70 95", // Back & Hind Leg
      "M 80 75 Q 70 70 60 70 Q 50 70 40 75 Q 30 85 25 95", // Belly & Front Leg
      "M 40 75 Q 35 60 30 50 Q 25 40 20 45 Q 15 50 25 55 Q 30 55 30 45", // Neck, Head, Snout
      "M 30 50 Q 25 25 40 20", // Antler 1 Base
      "M 33 35 L 25 30", // Antler 1 Tine
      "M 37 25 L 30 20", // Antler 1 Tine
      "M 30 50 Q 40 30 55 20", // Antler 2 Base
      "M 43 35 L 50 30", // Antler 2 Tine
      "M 50 25 L 60 20", // Antler 2 Tine
      "M 25 50 L 26 50" // Eye
    ]
  },
  {
    id: 'vessel',
    paths: [
      "M 20 40 C 20 90, 80 90, 80 40 Z", // Bowl Body
      "M 15 40 C 15 30, 85 30, 85 40 C 85 45, 15 45, 15 40 Z", // Rim
      "M 30 45 L 60 80", // Weave 1
      "M 45 45 L 70 70", // Weave 2
      "M 70 45 L 40 80", // Weave 3
      "M 55 45 L 30 70", // Weave 4
      "M 35 30 Q 25 15 35 5", // Steam 1
      "M 65 30 Q 75 15 65 5", // Steam 2
      "M 50 30 Q 45 15 55 5"  // Steam 3
    ]
  },
  {
    id: 'mare',
    paths: [
      "M 25 40 Q 45 30 65 35 Q 85 30 90 50 Q 85 65 75 70 Q 70 85 65 95", // Back & Hind Leg
      "M 75 70 Q 60 65 50 70 Q 40 70 30 65 Q 20 80 15 90", // Belly & Front Leg
      "M 30 65 Q 25 50 20 40 Q 15 30 10 35 Q 5 40 15 45 Q 20 45 25 40", // Neck & Head
      "M 20 40 L 15 25", // Mane 1
      "M 23 35 L 20 20", // Mane 2
      "M 27 33 L 28 18", // Mane 3
      "M 90 50 Q 100 60 90 75" // Tail
    ]
  },
  {
    id: 'river_life',
    paths: [
      "M 5 35 Q 25 15 50 35 T 95 35", // Wave 1
      "M 5 60 Q 25 40 50 60 T 95 60", // Wave 2
      "M 5 85 Q 25 65 50 85 T 95 85", // Wave 3
      "M 25 45 A 5 5 0 1 0 35 45 A 5 5 0 1 0 25 45", // Eddy 1
      "M 75 70 A 5 5 0 1 0 85 70 A 5 5 0 1 0 75 70", // Eddy 2
      "M 65 45 Q 75 40 80 45 Q 75 50 65 45 M 65 45 L 60 40 V 50 Z", // Salmon 1
      "M 35 70 Q 45 65 50 70 Q 45 75 35 70 M 35 70 L 30 65 V 75 Z"  // Salmon 2
    ]
  },
  {
    id: 'celestial',
    paths: [
      "M 50 15 A 35 35 0 1 0 50 85 A 35 35 0 1 0 50 15", // Sun Outline
      "M 50 25 A 25 25 0 1 0 50 75 A 25 25 0 1 0 50 25", // Inner Ring
      "M 60 25 A 25 25 0 1 1 60 75 A 30 30 0 0 0 60 25", // Crescent inside
      "M 50 5 L 50 10", // Ray N
      "M 50 90 L 50 95", // Ray S
      "M 5 50 L 10 50", // Ray W
      "M 90 50 L 95 50", // Ray E
      "M 18 18 L 22 22", // Ray NW
      "M 82 82 L 78 78", // Ray SE
      "M 82 18 L 78 22", // Ray NE
      "M 18 82 L 22 78"  // Ray SW
    ]
  },
  {
    id: 'fertility_plant',
    paths: [
      "M 20 85 Q 50 75 80 85", // Ground
      "M 50 80 C 40 50, 60 40, 50 15", // Sprout Stem
      "M 50 80 C 40 90, 30 95, 30 95", // Root 1
      "M 50 80 C 60 90, 70 95, 70 95", // Root 2
      "M 48 60 C 30 55, 20 40, 20 40 C 25 50, 40 55, 48 60", // Leaf 1
      "M 52 45 C 70 40, 80 25, 80 25 C 75 35, 60 40, 52 45", // Leaf 2
      "M 50 15 C 40 5, 50 0, 50 0 C 50 0, 60 5, 50 15 Z" // Top Bloom
    ]
  }
];

function makeWaveFrames(baseY: number, amp: number = 18) {
  return [
    `M 5 ${baseY} Q 25 ${baseY - amp} 50 ${baseY} T 95 ${baseY + amp}`,
    `M 5 ${baseY + amp * 0.55} Q 25 ${baseY - amp * 0.55} 50 ${baseY - amp * 0.55} T 95 ${baseY + amp * 0.55}`,
    `M 5 ${baseY} Q 25 ${baseY + amp} 50 ${baseY} T 95 ${baseY - amp}`,
    `M 5 ${baseY - amp * 0.55} Q 25 ${baseY + amp * 0.55} 50 ${baseY + amp * 0.55} T 95 ${baseY - amp * 0.55}`,
    `M 5 ${baseY} Q 25 ${baseY - amp} 50 ${baseY} T 95 ${baseY + amp}`,
  ];
}

const WAVE_PATHS: Record<string, Record<number, { frames: string[]; duration: number }>> = {
  river_life: {
    0: { frames: makeWaveFrames(35, 18), duration: 3.8 },
    1: { frames: makeWaveFrames(60, 16), duration: 4.6 },
    2: { frames: makeWaveFrames(85, 14), duration: 5.3 },
  },
};

export function RebeccaCaveSequence({ size = 112, className = "" }: { size?: number, className?: string }) {
  const [step, setStep] = useState(0);
  const color = REBECCA_CAVE_SEQUENCE_META.accent;
  const filterId = React.useId().replace(/:/g, '');

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | undefined;
    const tick = () => {
      if (cancelled) return;
      setStep(s => (s + 1) % caveSequences.length);
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
      const current = caveSequences[step];
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
          <filter id={`cave-roughness-${filterId}`}>
            <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="3" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.5" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>

      <div className={`absolute inset-0 rounded-full bg-gradient-to-br from-stone-700 to-stone-900 shadow-inner border border-stone-600/50 overflow-hidden`}>
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

      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full p-3 drop-shadow-md" style={{ filter: `url(#cave-roughness-${filterId})` }}>
        <AnimatePresence mode="wait">
          <motion.g
            key={caveSequences[step].id}
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
            {caveSequences[step].paths.map((d: string, i: number) => {
              const wave = WAVE_PATHS[caveSequences[step].id]?.[i];
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
                    opacity: {
                      duration: 1.6 + ((i * 31) % 11) * 0.13,
                      repeat: Infinity,
                      ease: 'easeInOut',
                      delay: (i % 3) * 0.18,
                    },
                    ...(wave
                      ? {
                          d: {
                            duration: wave.duration,
                            repeat: Infinity,
                            ease: 'easeInOut',
                            delay: i * 0.4,
                          },
                        }
                      : {}),
                  }}
                />
              );
            })}

            {(() => {
              const traceIdx = (retrace?.stroke ?? 0) % caveSequences[step].paths.length;
              const traceKey = retrace?.key ?? 0;
              const wave = WAVE_PATHS[caveSequences[step].id]?.[traceIdx];
              const d = wave ? wave.frames[0] : caveSequences[step].paths[traceIdx];
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
                    ...(wave
                      ? { d: { duration: wave.duration, repeat: Infinity, ease: 'easeInOut' } }
                      : {}),
                  }}
                />
              );
            })()}

            {caveSequences[step].paths.map((d: string, i: number) => {
              const wave = WAVE_PATHS[caveSequences[step].id]?.[i];
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
                    ...(wave
                      ? {
                          d: {
                            duration: wave.duration,
                            repeat: Infinity,
                            ease: 'easeInOut',
                            delay: i * 0.4,
                          },
                        }
                      : {}),
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

export function RebeccaCaveSequenceCard({ size = 112 }: { size?: number }) {
  return (
    <div className="flex flex-col items-center text-center space-y-4">
      <div
        className="rounded-xl bg-stone-950 shadow-inner border border-stone-800/80 flex items-center justify-center overflow-hidden"
        style={{ width: size, height: size }}
      >
        <RebeccaCaveSequence size={size} />
      </div>
      <div className="space-y-1">
        <h3 className="text-stone-100 font-semibold">{REBECCA_CAVE_SEQUENCE_META.agent}</h3>
        <p className="text-stone-400 text-xs uppercase tracking-wider font-semibold">
          {REBECCA_CAVE_SEQUENCE_META.name}
        </p>
        <p className="text-stone-500 text-sm leading-relaxed max-w-[220px]">
          {REBECCA_CAVE_SEQUENCE_META.description}
        </p>
      </div>
    </div>
  );
}
