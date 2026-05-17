/**
 * The Analyst — Expanding Solver
 * Quantum parts exploding and contracting dynamically as they solve.
 *
 * Dependencies: react, framer-motion, tailwindcss
 */
import React from 'react';
import { motion } from 'framer-motion';

export const ANALYST_EXPANDING_SOLVER_META = {
  agent: 'The Analyst',
  name: 'Expanding Solver',
  description: 'Quantum parts exploding and contracting dynamically as they solve.',
  accent: '#2dd4bf',
} as const;

const CUBIE = 14;
const GAP = 1;
const OFFSET = CUBIE + GAP;
const REFERENCE = 100;

const FACES = [
  { dir: 'rotateY(0deg)', bg: '#6366f1' },
  { dir: 'rotateY(90deg)', bg: '#8b5cf6' },
  { dir: 'rotateY(180deg)', bg: '#2dd4bf' },
  { dir: 'rotateY(-90deg)', bg: '#f472b6' },
  { dir: 'rotateX(90deg)', bg: '#0ea5e9' },
  { dir: 'rotateX(-90deg)', bg: '#f59e0b' },
];

const expand = (k: number) => [k, k * 1.6, k, k, k * 2.0, k, k, k * 1.4, k];

export function AnalystExpandingSolver({
  size,
  className = '',
}: { size?: number; className?: string }) {
  const px = size ?? REFERENCE;
  const scale = px / REFERENCE;
  const sizeStyle = size ? { width: size, height: size } : { width: '100%', height: '100%' };

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden ${className}`}
      style={{ ...sizeStyle, perspective: '1000px' }}
    >
      <motion.div
        className="absolute inset-0 rounded-full bg-indigo-500/20 blur-xl z-0"
        animate={{ scale: [0.9, 1.05, 0.9], opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div
        className="relative z-10 flex items-center justify-center"
        style={{ transform: `scale(${scale})`, transformOrigin: 'center' }}
      >
        <motion.div
          className="flex items-center justify-center"
          style={{ width: CUBIE, height: CUBIE, transformStyle: 'preserve-3d' }}
          animate={{
            rotateX: [-25, -15, -35, -20, -25],
            rotateY: [-45, -25, -65, -35, -45],
            scale: [1, 0.85, 1.05, 0.9, 1],
          }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
        >
          {[-1, 0, 1].map((x) =>
            [-1, 0, 1].map((y) =>
              [-1, 0, 1].map((z) => (
                <motion.div
                  key={`${x}-${y}-${z}`}
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ transformStyle: 'preserve-3d' }}
                  animate={{
                    rotateX: [0, x * 90, x * 90, 0, 0, 0, x * -90, x * -90, 0, 0],
                    rotateY: [0, 0, y * 90, y * 90, y * 90, 0, 0, y * -90, 0, 0],
                    rotateZ: [0, 0, 0, 0, z * 90, z * 90, 0, 0, 0, 0],
                  }}
                  transition={{
                    duration: 10,
                    repeat: Infinity,
                    ease: 'backInOut',
                    times: [0, 0.12, 0.24, 0.36, 0.48, 0.6, 0.72, 0.84, 0.96, 1],
                  }}
                >
                  <motion.div
                    className="absolute"
                    style={{ width: CUBIE, height: CUBIE, transformStyle: 'preserve-3d' }}
                    animate={{
                      x: expand(x * OFFSET),
                      y: expand(y * OFFSET),
                      z: expand(z * OFFSET),
                    }}
                    transition={{
                      duration: 10,
                      repeat: Infinity,
                      ease: 'easeInOut',
                      times: [0, 0.12, 0.24, 0.36, 0.48, 0.6, 0.72, 0.84, 1],
                    }}
                  >
                    {FACES.map((face, i) => (
                      <div
                        key={i}
                        className="absolute inset-0 border border-stone-900/60"
                        style={{
                          backgroundColor: face.bg,
                          transform: `${face.dir} translateZ(${CUBIE / 2}px)`,
                          backfaceVisibility: 'hidden',
                          boxShadow: 'inset 0 0 4px rgba(0,0,0,0.2), inset 0 0 1px rgba(255,255,255,0.4)',
                        }}
                      />
                    ))}
                  </motion.div>
                </motion.div>
              ))
            )
          )}
        </motion.div>
      </div>
    </div>
  );
}
