/**
 * The Analyst — Swiss Modern
 * Monochrome minimalism moving with rapid, calculated precision.
 *
 * Dependencies: react, motion (motion/react), tailwindcss
 */
import React from 'react';
import { motion } from 'motion/react';

export const ANALYST_SWISS_CUBE_META = {
  agent: 'Cube',
  name: 'Swiss Modern',
  description: 'Monochrome minimalism moving with rapid, calculated precision.',
  accent: '#a8a29e', // stone-400
} as const;

export function AnalystSwissCube({ size = 112, className = "" }: { size?: number, className?: string }) {
  const cubieSize = 14;
  const gap = 1;
  const offset = cubieSize + gap;

  // Swiss modern monochrome palette
  const faces = [
    { dir: 'rotateY(0deg)', bg: '#f5f5f4' },    // Front (Light gray)
    { dir: 'rotateY(90deg)', bg: '#d6d3d1' },   // Right (Medium light)
    { dir: 'rotateY(180deg)', bg: '#a8a29e' },  // Back (Medium)
    { dir: 'rotateY(-90deg)', bg: '#78716c' },  // Left (Medium dark)
    { dir: 'rotateX(90deg)', bg: '#e7e5e4' },   // Top (Lighter gray)
    { dir: 'rotateX(-90deg)', bg: '#44403c' },  // Bottom (Dark gray)
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

export function AnalystSwissCubeCard({ size = 112 }: { size?: number }) {
  return (
    <div className="flex flex-col items-center text-center space-y-4">
      <div
        className="rounded-xl bg-stone-950 shadow-inner border border-stone-800/80 flex items-center justify-center overflow-hidden"
        style={{ width: size, height: size }}
      >
        <AnalystSwissCube size={size} />
      </div>
      <div className="space-y-1">
        <h3 className="text-stone-100 font-semibold">{ANALYST_SWISS_CUBE_META.agent}</h3>
        <p className="text-stone-400 text-xs uppercase tracking-wider font-semibold">
          {ANALYST_SWISS_CUBE_META.name}
        </p>
        <p className="text-stone-500 text-sm leading-relaxed max-w-[220px]">
          {ANALYST_SWISS_CUBE_META.description}
        </p>
      </div>
    </div>
  );
}
