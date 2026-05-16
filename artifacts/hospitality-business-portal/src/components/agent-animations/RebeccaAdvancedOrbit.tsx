/**
 * Rebecca — Deep Thinking Orbital
 * 9 distinct thought patterns: shape shifts, accent pulses, core nudges, and more.
 *
 * Dependencies: react, framer-motion, tailwindcss
 */
import React from 'react';
import { motion } from 'framer-motion';
import type { TargetAndTransition, Transition } from 'framer-motion';

export const REBECCA_ORBIT_ADVANCED_META = {
  agent: 'Rebecca',
  name: 'Deep Thinking Orbital',
  description: '9 distinct thought patterns: shape shifts, accent pulses, core nudges, and more.',
  accent: '#10b981',
} as const;

export function RebeccaOrbitAdvanced({ size = 112, className = "" }: { size?: number, className?: string }) {
  const palette = ['#f5f5f4', '#d6d3d1', '#a8a29e', '#78716c', '#44403c'];

  const tracks = React.useMemo(() => ([
    {
      tilt: 'rotateX(70deg)',
      beads: 6,
      radius: 0.40,
      keyframes: [0, 80, 95, 110, 220, 360],
      times:     [0, 0.18, 0.34, 0.52, 0.78, 1],
      duration: 9,
    },
    {
      tilt: 'rotateY(70deg)',
      beads: 5,
      radius: 0.34,
      keyframes: [0, -110, -130, -240, -360],
      times:     [0, 0.28, 0.46, 0.70, 1],
      duration: 11,
    },
    {
      tilt: 'rotateZ(45deg) rotateX(60deg)',
      beads: 4,
      radius: 0.28,
      keyframes: [0, 60, 90, 200, 240, 360],
      times:     [0, 0.14, 0.30, 0.50, 0.66, 1],
      duration: 13,
    },
  ]), []);

  const [thought, setThought] = React.useState<{
    type: number;
    t: number;
    b: number;
    accent: string | null;
    key: number;
  } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    let timeoutId: number | undefined;
    const fire = () => {
      if (cancelled) return;
      const t = Math.floor(Math.random() * tracks.length);
      const b = Math.floor(Math.random() * tracks[t].beads);
      const type = Math.floor(Math.random() * 9);

      const accents = ['#ea580c', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];
      const accent = (type === 2 || type === 8) ? accents[Math.floor(Math.random() * accents.length)] : null;

      setThought((prev) => ({ type, t, b, accent, key: (prev?.key ?? 0) + 1 }));

      let nextDelay = 400 + Math.random() * 1200;
      if (type === 1) nextDelay += 1500;
      if (type === 7) nextDelay += 800;

      timeoutId = window.setTimeout(fire, nextDelay);
    };
    timeoutId = window.setTimeout(fire, 300);
    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [tracks]);

  const [pulseKey, setPulseKey] = React.useState(0);
  React.useEffect(() => {
    let cancelled = false;
    let timeoutId: number | undefined;
    const tick = () => {
      if (cancelled) return;
      setPulseKey((k) => k + 1);
      timeoutId = window.setTimeout(tick, 1600 + Math.random() * 1600);
    };
    timeoutId = window.setTimeout(tick, 800);
    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, []);

  const half = size / 2;
  const isCoreNudge = thought?.type === 5;

  return (
    <div
      className={`relative flex items-center justify-center ${className}`}
      style={{ width: size, height: size, perspective: '600px' }}
    >
      <div
        className="relative"
        style={{ width: size, height: size, transformStyle: 'preserve-3d', transform: 'rotateX(-15deg)' }}
      >
        <motion.div
          className="absolute rounded-full flex items-center justify-center"
          style={{
            left: '50%', top: '50%',
            width: size * 0.20, height: size * 0.20,
            marginLeft: -(size * 0.10), marginTop: -(size * 0.10),
            background: 'radial-gradient(circle at 35% 30%, #ffffff 0%, #f5f5f4 40%, #1c1917 100%)',
            border: '1px solid rgba(0,0,0,0.8)',
            zIndex: 4,
          }}
          animate={
            isCoreNudge
              ? {
                  x: [0, 8, -6, 4, -2, 0],
                  y: [0, -6, 4, -3, 1, 0],
                  scale: [1, 1.15, 1.05, 1.35, 1.15, 1.0, 1.2, 1.0],
                  opacity: [1, 1, 0.95, 1, 0.88, 1, 1, 1],
                  boxShadow: [
                    `0 0 ${size*0.2}px rgba(255,255,255,0.6), inset 0 0 ${size*0.1}px rgba(255,255,255,0.8)`,
                    `0 0 ${size*0.6}px rgba(255,255,255,0.9), inset 0 0 ${size*0.2}px rgba(255,255,255,1)`,
                    `0 0 ${size*0.2}px rgba(255,255,255,0.6), inset 0 0 ${size*0.1}px rgba(255,255,255,0.8)`,
                    `0 0 ${size*0.8}px rgba(255,255,255,1), inset 0 0 ${size*0.3}px rgba(255,255,255,1)`,
                    `0 0 ${size*0.2}px rgba(255,255,255,0.6), inset 0 0 ${size*0.1}px rgba(255,255,255,0.8)`,
                    `0 0 ${size*0.2}px rgba(255,255,255,0.6), inset 0 0 ${size*0.1}px rgba(255,255,255,0.8)`,
                    `0 0 ${size*0.5}px rgba(255,255,255,0.8), inset 0 0 ${size*0.2}px rgba(255,255,255,0.9)`,
                    `0 0 ${size*0.2}px rgba(255,255,255,0.6), inset 0 0 ${size*0.1}px rgba(255,255,255,0.8)`
                  ]
                }
              : {
                  x: 0, y: 0,
                  scale: [1, 1.15, 1.05, 1.35, 1.15, 1.0, 1.2, 1.0],
                  opacity: [1, 1, 0.95, 1, 0.88, 1, 1, 1],
                  boxShadow: [
                    `0 0 ${size*0.2}px rgba(255,255,255,0.6), inset 0 0 ${size*0.1}px rgba(255,255,255,0.8)`,
                    `0 0 ${size*0.6}px rgba(255,255,255,0.9), inset 0 0 ${size*0.2}px rgba(255,255,255,1)`,
                    `0 0 ${size*0.2}px rgba(255,255,255,0.6), inset 0 0 ${size*0.1}px rgba(255,255,255,0.8)`,
                    `0 0 ${size*0.8}px rgba(255,255,255,1), inset 0 0 ${size*0.3}px rgba(255,255,255,1)`,
                    `0 0 ${size*0.2}px rgba(255,255,255,0.6), inset 0 0 ${size*0.1}px rgba(255,255,255,0.8)`,
                    `0 0 ${size*0.2}px rgba(255,255,255,0.6), inset 0 0 ${size*0.1}px rgba(255,255,255,0.8)`,
                    `0 0 ${size*0.5}px rgba(255,255,255,0.8), inset 0 0 ${size*0.2}px rgba(255,255,255,0.9)`,
                    `0 0 ${size*0.2}px rgba(255,255,255,0.6), inset 0 0 ${size*0.1}px rgba(255,255,255,0.8)`
                  ]
                }
          }
          transition={
            isCoreNudge
              ? { x: { duration: 0.6, ease: "easeInOut" }, y: { duration: 0.6, ease: "easeInOut" }, scale: { duration: 5.4, repeat: Infinity, times: [0, 0.10, 0.22, 0.38, 0.52, 0.68, 0.84, 1] }, boxShadow: { duration: 5.4, repeat: Infinity, times: [0, 0.10, 0.22, 0.38, 0.52, 0.68, 0.84, 1] } }
              : { scale: { duration: 5.4, repeat: Infinity, times: [0, 0.10, 0.22, 0.38, 0.52, 0.68, 0.84, 1] }, boxShadow: { duration: 5.4, repeat: Infinity, times: [0, 0.10, 0.22, 0.38, 0.52, 0.68, 0.84, 1] } }
          }
        />

        <motion.div
          key={`pulse-${pulseKey}`}
          className="absolute rounded-full"
          style={{
            left: '50%', top: '50%',
            width: size * 0.20, height: size * 0.20,
            marginLeft: -(size * 0.10), marginTop: -(size * 0.10),
            border: '2px solid rgba(255,255,255,0.8)',
            background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.8) 0%, transparent 70%)',
            zIndex: 3, pointerEvents: 'none',
          }}
          initial={{ scale: 1, opacity: 1 }}
          animate={{ scale: 6, opacity: 0 }}
          transition={{ duration: 1.6, ease: 'easeOut' }}
        />

        {tracks.map((track, ti) => {
          const r = size * track.radius;
          return (
            <motion.div
              key={ti}
              className="absolute"
              style={{
                left: '50%', top: '50%',
                width: r * 2, height: r * 2,
                marginLeft: -r, marginTop: -r,
                transformStyle: 'preserve-3d',
                transform: track.tilt,
              }}
              animate={{ rotateZ: track.keyframes }}
              transition={{ duration: track.duration, repeat: Infinity, ease: 'easeInOut', times: track.times }}
            >
              <div className="absolute inset-0 rounded-full" style={{ border: '1px solid rgba(0,0,0,0.55)' }} />

              {Array.from({ length: track.beads }).map((_, bi) => {
                const angle = (bi / track.beads) * Math.PI * 2;
                const baseX = Math.cos(angle) * r;
                const baseY = Math.sin(angle) * r;
                const beadSize = size * 0.11;
                const bg = palette[(ti * 2 + bi) % palette.length];

                const isSpark = thought?.t === ti && thought?.b === bi;
                const tType = isSpark ? thought!.type : -1;
                const sparkKey = isSpark ? thought!.key : 0;

                const bgToUse = (isSpark && thought!.accent) ? thought!.accent : bg;
                const glowColor = (isSpark && thought!.accent) ? thought!.accent : '#d6d3d1';

                let bgStyle = `radial-gradient(circle at 32% 28%, #ffffff, ${bg} 55%, #1c1917 130%)`;
                let shadowStyle = 'none';

                let animateObj: TargetAndTransition = { x: baseX, y: baseY, scale: 1, opacity: 1, borderRadius: '50%', rotateZ: 0 };
                let transitionObj: Transition = { duration: 0.4, ease: 'easeOut' };
                let drawsTrail = false;

                if (isSpark) {
                  switch (tType) {
                    case 0:
                      animateObj = { x: [baseX, baseX * 0.25, baseX * 0.6, baseX], y: [baseY, baseY * 0.25, baseY * 0.6, baseY], scale: [1, 2.1, 1.3, 1] };
                      transitionObj = { duration: 1.0, ease: [0.2, 0.8, 0.2, 1], times: [0, 0.35, 0.65, 1] };
                      drawsTrail = true;
                      bgStyle = `radial-gradient(circle at 32% 28%, #ffffff, #fafaf9 40%, ${bgToUse} 90%)`;
                      shadowStyle = `0 0 ${size * 0.28}px ${glowColor}, 0 0 ${size * 0.10}px #ffffff`;
                      break;
                    case 1:
                      animateObj = { x: [baseX, baseX * 0.15, baseX * 0.15, baseX], y: [baseY, baseY * 0.15, baseY * 0.15, baseY], scale: [1, 1.4, 1.4, 1] };
                      transitionObj = { duration: 2.8, ease: "easeInOut", times: [0, 0.3, 0.7, 1] };
                      drawsTrail = true;
                      bgStyle = `radial-gradient(circle at 50% 50%, #1c1917 10%, ${bgToUse} 60%, #ffffff 90%)`;
                      shadowStyle = `0 0 ${size * 0.35}px ${glowColor}, inset 0 0 ${size * 0.1}px #000`;
                      break;
                    case 2:
                      animateObj = { x: [baseX, baseX * 0.25, baseX * 0.6, baseX], y: [baseY, baseY * 0.25, baseY * 0.6, baseY], scale: [1, 2.4, 1.4, 1] };
                      transitionObj = { duration: 1.0, ease: [0.2, 0.8, 0.2, 1] };
                      drawsTrail = true;
                      bgStyle = `conic-gradient(from 45deg, #ffffff, ${bgToUse}, #ffffff, ${bgToUse}, #ffffff)`;
                      shadowStyle = `0 0 ${size * 0.4}px ${glowColor}, 0 0 ${size * 0.2}px #ffffff`;
                      break;
                    case 3:
                      animateObj = { x: [baseX, baseX * 0.4, baseX], y: [baseY, baseY * 0.4, baseY], scale: [1, 2, 1], borderRadius: ['50%', '0%', '50%'], rotateZ: [0, 90, 0] };
                      transitionObj = { duration: 1.6, ease: "easeInOut" };
                      drawsTrail = true;
                      bgStyle = `linear-gradient(135deg, #ffffff 0%, ${bgToUse} 40%, #1c1917 100%)`;
                      shadowStyle = `0 0 ${size * 0.2}px ${glowColor}`;
                      break;
                    case 4:
                      animateObj = { x: [baseX, baseX+4, baseX-4, baseX+4, baseX-4, baseX], y: [baseY, baseY-4, baseY+4, baseY-4, baseY+4, baseY], scale: [1, 1.5, 1] };
                      transitionObj = { duration: 0.6, ease: "linear" };
                      bgStyle = `repeating-radial-gradient(circle at 50% 50%, #ffffff 0%, ${bgToUse} 15%, #1c1917 30%)`;
                      shadowStyle = `0 0 ${size * 0.15}px ${glowColor}, -2px 2px ${size*0.05}px #ffffff, 2px -2px ${size*0.05}px #ffffff`;
                      break;
                    case 5:
                      animateObj = { x: [baseX, baseX * 0.3, baseX], y: [baseY, baseY * 0.3, baseY], scale: [1, 1.8, 1] };
                      transitionObj = { duration: 0.8, ease: "easeOut" };
                      drawsTrail = true;
                      bgStyle = `radial-gradient(circle at 80% 80%, #ffffff, ${bgToUse} 40%, #000000 90%)`;
                      shadowStyle = `0 0 ${size * 0.3}px ${glowColor}, inset -4px -4px 10px rgba(0,0,0,0.5)`;
                      break;
                    case 6:
                      animateObj = { x: [baseX, baseX * 0.2, baseX], y: [baseY, baseY * 0.2, baseY], scale: [1, 1.5, 1], opacity: [1, 0, 1] };
                      transitionObj = { duration: 1.2, ease: "easeInOut" };
                      drawsTrail = true;
                      bgStyle = `transparent`;
                      shadowStyle = `0 0 ${size * 0.2}px ${glowColor}, inset 0 0 ${size * 0.15}px ${glowColor}`;
                      break;
                    case 7:
                      animateObj = { x: baseX, y: baseY, scale: [1, 4, 1.5, 3, 1] };
                      transitionObj = { duration: 1.8, ease: "easeInOut" };
                      bgStyle = `radial-gradient(circle at 50% 50%, ${glowColor} 0%, #ffffff 30%, ${bgToUse} 80%)`;
                      shadowStyle = `0 0 ${size * 0.5}px ${glowColor}, 0 0 ${size * 0.25}px #ffffff`;
                      break;
                    case 8:
                      animateObj = { x: [baseX, baseX * 0.25, baseX], y: [baseY, baseY * 0.25, baseY], scale: [1, 2.5, 1] };
                      transitionObj = { duration: 1.0, ease: "easeOut" };
                      drawsTrail = true;
                      bgStyle = `radial-gradient(circle at 50% 50%, #ffffff 10%, ${bgToUse} 40%, transparent 100%)`;
                      shadowStyle = `0 0 ${size * 0.3}px ${glowColor}`;
                      break;
                  }
                }

                return (
                  <React.Fragment key={`bead-${ti}-${bi}`}>
                    <motion.div
                      key={isSpark ? `spark-${sparkKey}` : `idle-${bi}`}
                      className="absolute"
                      style={{
                        left: '50%', top: '50%',
                        width: beadSize, height: beadSize,
                        marginLeft: -beadSize / 2, marginTop: -beadSize / 2,
                        background: bgStyle,
                        border: '1px solid #000',
                        boxShadow: shadowStyle,
                        zIndex: isSpark ? 6 : 1,
                      }}
                      initial={false}
                      animate={animateObj}
                      transition={transitionObj}
                    />

                    {isSpark && tType === 8 && (
                      <motion.div
                        key={`ring-${sparkKey}`}
                        className="absolute rounded-full"
                        style={{
                          left: '50%', top: '50%',
                          width: beadSize, height: beadSize,
                          marginLeft: -beadSize / 2, marginTop: -beadSize / 2,
                          border: `1.5px solid ${glowColor}`,
                          pointerEvents: 'none', zIndex: 5
                        }}
                        initial={{ x: baseX, y: baseY, scale: 1, opacity: 0.9 }}
                        animate={{ x: [baseX, baseX * 0.25], y: [baseY, baseY * 0.25], scale: [1, 5], opacity: [0.9, 0] }}
                        transition={{ duration: 1.0, ease: "easeOut" }}
                      />
                    )}

                    {isSpark && drawsTrail && (
                      <motion.div
                        key={`trail-${sparkKey}`}
                        className="absolute"
                        style={{
                          left: '50%', top: '50%',
                          width: Math.hypot(baseX, baseY), height: 1.25,
                          marginTop: -0.625,
                          background: 'linear-gradient(90deg, rgba(0,0,0,0.85), rgba(0,0,0,0))',
                          transformOrigin: '0 50%', transform: `rotate(${Math.atan2(baseY, baseX)}rad)`,
                          zIndex: 5, pointerEvents: 'none',
                        }}
                        initial={{ opacity: 0.95, scaleX: 1 }}
                        animate={{ opacity: 0, scaleX: 0.2 }}
                        transition={{ duration: 0.7, ease: 'easeOut' }}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </motion.div>
          );
        })}

        <div
          className="absolute rounded-full"
          style={{
            left: half - size * 0.46, top: half - size * 0.46,
            width: size * 0.92, height: size * 0.92,
            border: '1px solid rgba(0,0,0,0.35)', pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
}
