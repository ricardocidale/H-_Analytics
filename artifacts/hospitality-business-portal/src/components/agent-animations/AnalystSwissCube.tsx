/**
 * The Analyst — Swiss Modern
 * Monochrome minimalism moving with rapid, calculated precision.
 *
 * Dependencies: react, framer-motion, tailwindcss
 */
import React from 'react';
import { motion } from 'framer-motion';

export const ANALYST_SWISS_CUBE_META = {
  agent: 'The Analyst',
  name: 'Swiss Modern',
  description: 'Monochrome minimalism moving with rapid, calculated precision.',
  accent: '#a8a29e',
} as const;

export function AnalystSwissCube({ size = 112, className = "" }: { size?: number, className?: string }) {
  const cubieSize = 14;
  const gap = 1;
  const offset = cubieSize + gap;

  const faces = [
    { dir: 'rotateY(0deg)', bg: '#f5f5f4' },
    { dir: 'rotateY(90deg)', bg: '#d6d3d1' },
    { dir: 'rotateY(180deg)', bg: '#a8a29e' },
    { dir: 'rotateY(-90deg)', bg: '#78716c' },
    { dir: 'rotateX(90deg)', bg: '#e7e5e4' },
    { dir: 'rotateX(-90deg)', bg: '#44403c' },
  ];

  return (
    <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size, perspective: '1000px' }}>
      <motion.div
        className="relative z-10 flex items-center justify-center"
        style={{ width: cubieSize, height: cubieSize, transformStyle: 'preserve-3d', rotateX: -25 }}
        animate={{
          rotateY: [0, 360],
        }}
        transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
      >
        {[-1, 0, 1].map((x) =>
          [-1, 0, 1].map((y) =>
            [-1, 0, 1].map((z) => {
              return (
                <motion.div
                  key={`orbit-${x}-${y}-${z}`}
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ transformStyle: 'preserve-3d' }}
                  animate={{
                    rotateX: [0, x * 90, x * 90, 0,      0,      0,      x * -90, x * -90, 0, 0],
                    rotateY: [0, 0,      y * 90, y * 90, y * 90, 0,      0,       y * -90, 0, 0],
                    rotateZ: [0, 0,      0,      0,      z * 90, z * 90, 0,       0,       0, 0],
                  }}
                  transition={{
                    duration: 6,
                    repeat: Infinity,
                    ease: "backInOut",
                    times: [0, 0.12, 0.24, 0.36, 0.48, 0.60, 0.72, 0.84, 0.96, 1]
                  }}
                >
                  <motion.div
                    className="absolute"
                    style={{
                      width: cubieSize,
                      height: cubieSize,
                      transformStyle: 'preserve-3d',
                    }}
                    animate={{
                      x: [x * offset, x * offset * 1.3, x * offset, x * offset, x * offset * 1.6, x * offset, x * offset, x * offset * 1.2, x * offset],
                      y: [y * offset, y * offset * 1.3, y * offset, y * offset, y * offset * 1.6, y * offset, y * offset, y * offset * 1.2, y * offset],
                      z: [z * offset, z * offset * 1.3, z * offset, z * offset, z * offset * 1.6, z * offset, z * offset, z * offset * 1.2, z * offset],
                    }}
                    transition={{
                      duration: 6,
                      repeat: Infinity,
                      ease: "easeInOut",
                      times: [0, 0.12, 0.24, 0.36, 0.48, 0.60, 0.72, 0.84, 1]
                    }}
                  >
                    {faces.map((face, i) => (
                      <div
                        key={i}
                        className="absolute inset-0 border-[1.5px] border-black"
                        style={{
                          backgroundColor: face.bg,
                          transform: `${face.dir} translateZ(${cubieSize / 2}px)`,
                          backfaceVisibility: 'hidden',
                        }}
                      />
                    ))}
                  </motion.div>
                </motion.div>
              );
            })
          )
        )}
      </motion.div>
    </div>
  );
}
