/**
 * Rebecca — Alive Merged Geometry
 * 12 merged Lascaux and Earth geometry instances executing randomly as one alive orbital entity.
 *
 * Dependencies: react, framer-motion, tailwindcss
 */
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export const REBECCA_ALIVE_META = {
  agent: 'Rebecca',
  name: 'Alive Merged Geometry',
  description: '12 merged Lascaux and Earth geometry instances executing randomly as one alive orbital entity.',
  accent: '#f97316',
} as const;

const caveSequences = [
  {
    id: 'goddess',
    paths: [
      "M 45 20 A 5 5 0 1 0 55 20 A 5 5 0 1 0 45 20",
      "M 30 15 C 40 5, 60 5, 70 15",
      "M 25 35 C 20 25, 40 25, 45 25",
      "M 75 35 C 80 25, 60 25, 55 25",
      "M 40 35 A 5 5 0 1 0 50 35",
      "M 50 35 A 5 5 0 1 0 60 35",
      "M 45 35 C 20 50, 20 85, 50 90 C 80 85, 80 50, 55 35 Z",
      "M 50 65 A 8 8 0 1 0 49.9 65",
      "M 50 65 C 48 60, 55 58, 55 65 C 55 70, 45 70, 45 65"
    ]
  },
  {
    id: 'stag',
    paths: [
      "M 30 45 Q 45 40 60 45 Q 75 40 85 55 Q 85 70 80 75 Q 75 85 70 95",
      "M 80 75 Q 70 70 60 70 Q 50 70 40 75 Q 30 85 25 95",
      "M 40 75 Q 35 60 30 50 Q 25 40 20 45 Q 15 50 25 55 Q 30 55 30 45",
      "M 30 50 Q 25 25 40 20",
      "M 33 35 L 25 30",
      "M 37 25 L 30 20",
      "M 30 50 Q 40 30 55 20",
      "M 43 35 L 50 30",
      "M 50 25 L 60 20",
      "M 25 50 L 26 50"
    ]
  },
  {
    id: 'vessel',
    paths: [
      "M 20 40 C 20 90, 80 90, 80 40 Z",
      "M 15 40 C 15 30, 85 30, 85 40 C 85 45, 15 45, 15 40 Z",
      "M 30 45 L 60 80",
      "M 45 45 L 70 70",
      "M 70 45 L 40 80",
      "M 55 45 L 30 70",
      "M 35 30 Q 25 15 35 5",
      "M 65 30 Q 75 15 65 5",
      "M 50 30 Q 45 15 55 5"
    ]
  },
  {
    id: 'mare',
    paths: [
      "M 25 40 Q 45 30 65 35 Q 85 30 90 50 Q 85 65 75 70 Q 70 85 65 95",
      "M 75 70 Q 60 65 50 70 Q 40 70 30 65 Q 20 80 15 90",
      "M 30 65 Q 25 50 20 40 Q 15 30 10 35 Q 5 40 15 45 Q 20 45 25 40",
      "M 20 40 L 15 25",
      "M 23 35 L 20 20",
      "M 27 33 L 28 18",
      "M 90 50 Q 100 60 90 75"
    ]
  },
  {
    id: 'river_life',
    paths: [
      "M 5 35 Q 25 15 50 35 T 95 35",
      "M 5 60 Q 25 40 50 60 T 95 60",
      "M 5 85 Q 25 65 50 85 T 95 85",
      "M 25 45 A 5 5 0 1 0 35 45 A 5 5 0 1 0 25 45",
      "M 75 70 A 5 5 0 1 0 85 70 A 5 5 0 1 0 75 70",
      "M 65 45 Q 75 40 80 45 Q 75 50 65 45 M 65 45 L 60 40 V 50 Z",
      "M 35 70 Q 45 65 50 70 Q 45 75 35 70 M 35 70 L 30 65 V 75 Z"
    ]
  },
  {
    id: 'celestial',
    paths: [
      "M 50 15 A 35 35 0 1 0 50 85 A 35 35 0 1 0 50 15",
      "M 50 25 A 25 25 0 1 0 50 75 A 25 25 0 1 0 50 25",
      "M 60 25 A 25 25 0 1 1 60 75 A 30 30 0 0 0 60 25",
      "M 50 5 L 50 10",
      "M 50 90 L 50 95",
      "M 5 50 L 10 50",
      "M 90 50 L 95 50",
      "M 18 18 L 22 22",
      "M 82 82 L 78 78",
      "M 82 18 L 78 22",
      "M 18 82 L 22 78"
    ]
  },
  {
    id: 'fertility_plant',
    paths: [
      "M 20 85 Q 50 75 80 85",
      "M 50 80 C 40 50, 60 40, 50 15",
      "M 50 80 C 40 90, 30 95, 30 95",
      "M 50 80 C 60 90, 70 95, 70 95",
      "M 48 60 C 30 55, 20 40, 20 40 C 25 50, 40 55, 48 60",
      "M 52 45 C 70 40, 80 25, 80 25 C 75 35, 60 40, 52 45",
      "M 50 15 C 40 5, 50 0, 50 0 C 50 0, 60 5, 50 15 Z"
    ]
  }
];

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

export function RebeccaAlive({ size = 112, className = "" }: { size?: number, className?: string }) {
  const mergedSequences = React.useMemo(() => [...caveSequences, ...geoSequences], []);
  const palette = ['#f5f5f4', '#d6d3d1', '#a8a29e', '#78716c', '#44403c'];

  const [instances, setInstances] = React.useState(() => {
    return Array.from({ length: 12 }).map((_, i) => ({
      id: i,
      rx: Math.random() * 360,
      ry: Math.random() * 360,
      rz: Math.random() * 360,
      scale: 0.35 + Math.random() * 0.45,
      seqIndex: Math.floor(Math.random() * mergedSequences.length),
      color: palette[Math.floor(Math.random() * palette.length)],
      key: 0,
    }));
  });

  const [thought, setThought] = React.useState<{ inst: number; accent: string | null; key: number } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    let timeoutId: number | undefined;

    const fire = () => {
      if (cancelled) return;

      const instIdx = Math.floor(Math.random() * 12);
      const isMajorThought = Math.random() > 0.6;

      const accents = ['#ea580c', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];
      const accent = isMajorThought ? accents[Math.floor(Math.random() * accents.length)] : null;

      setInstances(prev => {
        const next = [...prev];
        next[instIdx] = {
          ...next[instIdx],
          seqIndex: Math.floor(Math.random() * mergedSequences.length),
          key: next[instIdx].key + 1
        };
        return next;
      });

      setThought((prev) => ({ inst: instIdx, accent, key: (prev?.key ?? 0) + 1 }));

      window.setTimeout(() => {
        if (!cancelled) setThought(null);
      }, 300);

      timeoutId = window.setTimeout(fire, 800 + Math.random() * 2000);
    };

    timeoutId = window.setTimeout(fire, 400);
    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [mergedSequences]);

  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size, perspective: '800px' }}>
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-stone-800 to-stone-950 shadow-inner border border-stone-700/50 overflow-hidden">
        <motion.div
          className="absolute inset-0 rounded-full bg-orange-900/20 mix-blend-overlay"
          animate={{ opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <motion.div
        className="relative flex items-center justify-center"
        style={{ width: size, height: size, transformStyle: 'preserve-3d' }}
        animate={{ rotateX: [0, 360], rotateY: [0, 360], rotateZ: [0, 180] }}
        transition={{ duration: 160, repeat: Infinity, ease: "linear" }}
      >
        {instances.map((inst, i) => {
          const isThinking = thought?.inst === i;
          const strokeColor = isThinking && thought?.accent ? thought.accent : inst.color;
          const seq = mergedSequences[inst.seqIndex];

          return (
            <motion.div
              key={i}
              className="absolute inset-0 flex items-center justify-center"
              style={{
                transformStyle: 'preserve-3d',
                transform: `rotateX(${inst.rx}deg) rotateY(${inst.ry}deg) rotateZ(${inst.rz}deg)`
              }}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={`seq-${inst.key}`}
                  style={{ width: '100%', height: '100%' }}
                  initial={{ opacity: 0, scale: inst.scale * 0.8 }}
                  animate={{
                    opacity: 1,
                    scale: isThinking ? inst.scale * 1.15 : inst.scale,
                  }}
                  exit={{ opacity: 0, scale: inst.scale * 0.8 }}
                  transition={{ duration: 0.8 }}
                >
                  <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full drop-shadow-md">
                    {seq.paths.map((d, pathIdx) => (
                      <motion.path
                        key={pathIdx}
                        d={d}
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth={isThinking ? "5" : "3"}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        initial={{ pathLength: 0, opacity: 0 }}
                        animate={{
                          pathLength: 1,
                          opacity: isThinking ? [1, 0.8, 1] : [0.4, 0.7, 0.4],
                        }}
                        transition={{
                          pathLength: { duration: 1.5 + pathIdx * 0.3, ease: 'easeOut' },
                          opacity: { duration: 3, repeat: Infinity, ease: 'easeInOut', delay: pathIdx * 0.2 },
                        }}
                      />
                    ))}
                  </svg>
                </motion.div>
              </AnimatePresence>
            </motion.div>
          );
        })}
      </motion.div>

      <motion.div
        className="absolute rounded-full"
        style={{
          width: size * 0.15,
          height: size * 0.15,
          background: 'radial-gradient(circle at 30% 30%, #f5f5f4, #a8a29e)',
          boxShadow: '0 0 15px rgba(245, 245, 244, 0.4)'
        }}
        animate={{
          scale: thought ? [1, 1.4, 1] : [1, 1.1, 1],
          opacity: [0.8, 1, 0.8]
        }}
        transition={{ duration: thought ? 0.3 : 3, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
