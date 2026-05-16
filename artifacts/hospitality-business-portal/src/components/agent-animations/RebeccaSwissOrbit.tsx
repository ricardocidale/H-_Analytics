/**
 * Rebecca — Swiss Orbital System
 * A thinking system — orbits, sparks, and a pulsing core.
 *
 * Dependencies: react, framer-motion, tailwindcss
 */
import React from 'react';
import { motion } from 'framer-motion';

export const REBECCA_ORBIT_META = {
  agent: 'Rebecca',
  name: 'Swiss Orbital',
  description: 'A thinking system — orbits, sparks, and a pulsing core.',
  accent: '#e7e5e4',
} as const;

export function RebeccaOrbit({ size = 112, className = "" }: { size?: number, className?: string }) {
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

  const [spark, setSpark] = React.useState<{ t: number; b: number; key: number } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    let timeoutId: number | undefined;
    const fire = () => {
      if (cancelled) return;
      const t = Math.floor(Math.random() * tracks.length);
      const b = Math.floor(Math.random() * tracks[t].beads);
      setSpark((prev) => ({ t, b, key: (prev?.key ?? 0) + 1 }));
      timeoutId = window.setTimeout(fire, 280 + Math.random() * 820);
    };
    timeoutId = window.setTimeout(fire, 250);
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

  return (
    <div
      className={`relative flex items-center justify-center ${className}`}
      style={{ width: size, height: size, perspective: '600px' }}
    >
      <div
        className="relative"
        style={{
          width: size,
          height: size,
          transformStyle: 'preserve-3d',
          transform: 'rotateX(-15deg)',
        }}
      >
        <motion.div
          className="absolute rounded-full"
          style={{
            left: '50%',
            top: '50%',
            width: size * 0.18,
            height: size * 0.18,
            marginLeft: -(size * 0.09),
            marginTop: -(size * 0.09),
            background: 'radial-gradient(circle at 32% 28%, #f5f5f4, #44403c)',
            border: '1.25px solid #000',
            zIndex: 4,
          }}
          animate={{
            scale:   [1, 1.08, 1.04, 1.32, 1.12, 1.0, 1.18, 1.0],
            opacity: [1, 1, 0.95, 1, 0.88, 1, 1, 1],
          }}
          transition={{
            duration: 5.4,
            repeat: Infinity,
            ease: 'easeInOut',
            times: [0, 0.10, 0.22, 0.38, 0.52, 0.68, 0.84, 1],
          }}
        />

        <motion.div
          key={`pulse-${pulseKey}`}
          className="absolute rounded-full"
          style={{
            left: '50%',
            top: '50%',
            width: size * 0.18,
            height: size * 0.18,
            marginLeft: -(size * 0.09),
            marginTop: -(size * 0.09),
            border: '1.25px solid #000',
            background: 'transparent',
            zIndex: 3,
            pointerEvents: 'none',
          }}
          initial={{ scale: 1, opacity: 0.85 }}
          animate={{ scale: 5, opacity: 0 }}
          transition={{ duration: 1.4, ease: 'easeOut' }}
        />

        {tracks.map((track, ti) => {
          const r = size * track.radius;
          return (
            <motion.div
              key={ti}
              className="absolute"
              style={{
                left: '50%',
                top: '50%',
                width: r * 2,
                height: r * 2,
                marginLeft: -r,
                marginTop: -r,
                transformStyle: 'preserve-3d',
                transform: track.tilt,
              }}
              animate={{ rotateZ: track.keyframes }}
              transition={{
                duration: track.duration,
                repeat: Infinity,
                ease: 'easeInOut',
                times: track.times,
              }}
            >
              <div
                className="absolute inset-0 rounded-full"
                style={{ border: '1px solid rgba(0,0,0,0.55)' }}
              />

              {Array.from({ length: track.beads }).map((_, bi) => {
                const angle = (bi / track.beads) * Math.PI * 2;
                const x = Math.cos(angle) * r;
                const y = Math.sin(angle) * r;
                const beadSize = size * 0.11;
                const bg = palette[(ti * 2 + bi) % palette.length];
                const isSpark = spark?.t === ti && spark?.b === bi;
                return (
                  <React.Fragment key={`bead-${ti}-${bi}`}>
                    <motion.div
                      key={isSpark ? `spark-${spark!.key}` : `idle-${bi}`}
                      className="absolute rounded-full"
                      style={{
                        left: '50%',
                        top: '50%',
                        width: beadSize,
                        height: beadSize,
                        marginLeft: -beadSize / 2,
                        marginTop: -beadSize / 2,
                        background: isSpark
                          ? `radial-gradient(circle at 32% 28%, #ffffff, #fafaf9 50%, ${bg} 90%)`
                          : `radial-gradient(circle at 32% 28%, #ffffff, ${bg} 55%, #1c1917 130%)`,
                        border: '1px solid #000',
                        boxShadow: isSpark
                          ? `0 0 ${size * 0.28}px rgba(255,255,255,0.95), 0 0 ${size * 0.10}px rgba(255,255,255,1)`
                          : 'none',
                        zIndex: isSpark ? 6 : 1,
                      }}
                      initial={false}
                      animate={
                        isSpark
                          ? {
                              x: [x, x * 0.25, x * 0.6, x],
                              y: [y, y * 0.25, y * 0.6, y],
                              scale: [1, 2.1, 1.3, 1],
                            }
                          : { x, y, scale: 1 }
                      }
                      transition={
                        isSpark
                          ? { duration: 1.0, ease: [0.2, 0.8, 0.2, 1], times: [0, 0.35, 0.65, 1] }
                          : { duration: 0.4, ease: 'easeOut' }
                      }
                    />

                    {isSpark && (
                      <motion.div
                        key={`trail-${spark!.key}`}
                        className="absolute"
                        style={{
                          left: '50%',
                          top: '50%',
                          width: Math.hypot(x, y),
                          height: 1.25,
                          marginTop: -0.625,
                          background: 'linear-gradient(90deg, rgba(0,0,0,0.85), rgba(0,0,0,0))',
                          transformOrigin: '0 50%',
                          transform: `rotate(${Math.atan2(y, x)}rad)`,
                          zIndex: 5,
                          pointerEvents: 'none',
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
            left: half - size * 0.46,
            top: half - size * 0.46,
            width: size * 0.92,
            height: size * 0.92,
            border: '1px solid rgba(0,0,0,0.35)',
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
}
