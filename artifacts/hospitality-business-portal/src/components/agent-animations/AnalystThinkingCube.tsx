/**
 * The Analyst — Thinking Cube
 * Swiss modern logic brought to life with pulsing brainwaves and thought-sparks.
 *
 * Dependencies: react, framer-motion, tailwindcss
 */
import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';

export const ANALYST_THINKING_CUBE_META = {
  agent: 'The Analyst',
  name: 'Thinking Cube',
  description: 'Swiss modern logic brought to life with pulsing brainwaves and thought-sparks.',
  accent: '#818cf8',
} as const;

const CUBIE_SIZE = 45;
const GAP = 3;
const OFFSET = CUBIE_SIZE + GAP;
const REFERENCE = 260;

const PALETTE = {
  front: '#ef4444', right: '#3b82f6', back: '#f97316',
  left: '#22c55e', top: '#ffffff', bottom: '#eab308',
  border: '#1c1917',
};

const FACES = [
  { dir: 'rotateY(0deg)', key: 'front' as const },
  { dir: 'rotateY(90deg)', key: 'right' as const },
  { dir: 'rotateY(180deg)', key: 'back' as const },
  { dir: 'rotateY(-90deg)', key: 'left' as const },
  { dir: 'rotateX(90deg)', key: 'top' as const },
  { dir: 'rotateX(-90deg)', key: 'bottom' as const },
];

function getScene(scene: number, x: number, y: number, z: number) {
  const bx = x * OFFSET, by = y * OFFSET, bz = z * OFFSET;
  const dist = Math.abs(x) + Math.abs(y) + Math.abs(z);
  switch (scene) {
    case 0: return { tx: bx, ty: by, tz: bz, rx: 0, ry: 0, rz: 0, scale: 1, br: '12%' };
    case 1: return { tx: bx * 1.6, ty: by * 1.6, tz: bz * 1.6, rx: x * 45, ry: y * 45, rz: z * 45, scale: 0.85, br: '20%' };
    case 2: return { tx: bx * 1.7 + y * 15, ty: by * 1.7 + z * 15, tz: bz * 1.7 + x * 15, rx: 90 * x, ry: 90 * y, rz: 90 * z, scale: 0.7, br: '50%' };
    case 3: return { tx: bx * 1.4, ty: by * 1.4, tz: 0, rx: 0, ry: 0, rz: z * 90, scale: 0.9, br: '15%' };
    case 4: return { tx: -bx * 0.5, ty: -by * 0.5, tz: -bz * 0.5, rx: 180 * x, ry: 180 * y, rz: 180 * z, scale: dist === 0 ? 2.2 : 0.4, br: '30%' };
    case 5: {
      const angle = (y + 1) * 45;
      const rad = angle * (Math.PI / 180);
      return {
        tx: Math.cos(rad) * 50 * (x || 1),
        ty: by * 1.7,
        tz: Math.sin(rad) * 50 * (z || 1),
        rx: 0, ry: angle, rz: 0, scale: 0.75, br: '50%',
      };
    }
    case 6: return {
      tx: bx * (dist === 3 ? 2.0 : 0.4),
      ty: by * (dist === 3 ? 2.0 : 0.4),
      tz: bz * (dist === 3 ? 2.0 : 0.4),
      rx: dist === 3 ? 180 : 0, ry: dist === 3 ? 180 : 0, rz: 0,
      scale: dist === 3 ? 1.05 : 0.6, br: '25%',
    };
    case 7: return { tx: bx, ty: by, tz: bz, rx: 0, ry: 0, rz: 0, scale: 1, br: '12%' };
    case 8: return { tx: bx * 2.0, ty: 0, tz: bz * 2.0, rx: x * 90, ry: y * 90, rz: z * 90, scale: y === 0 ? 1 : 0.3, br: '50%' };
    default: return { tx: bx, ty: by, tz: bz, rx: 0, ry: 0, rz: 0, scale: 1, br: '12%' };
  }
}

export function AnalystThinkingCube({
  size,
  className = '',
}: { size?: number; className?: string }) {
  const [sceneIndex, setSceneIndex] = useState(0);
  const px = size ?? REFERENCE;
  const scale = px / REFERENCE;
  const sizeStyle = size ? { width: size, height: size } : { width: '100%', height: '100%' };

  useEffect(() => {
    const interval = setInterval(() => {
      setSceneIndex(prev => {
        let next = Math.floor(Math.random() * 9);
        if (Math.random() > 0.8) next = Math.random() > 0.5 ? 0 : 7;
        if (next === prev) next = (next + 1) % 9;
        return next;
      });
    }, 1100);
    return () => clearInterval(interval);
  }, []);

  const cubies = useMemo(() => {
    const arr: { x: number; y: number; z: number; id: string }[] = [];
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++)
          arr.push({ x, y, z, id: `${x}-${y}-${z}` });
    return arr;
  }, []);

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden ${className}`}
      style={{ ...sizeStyle, perspective: '1200px' }}
    >
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'center' }}>
        <motion.div
          className="relative flex items-center justify-center z-10"
          style={{ width: 0, height: 0, transformStyle: 'preserve-3d' }}
          animate={{ rotateX: [-15, -25, -10, -20, -15], rotateY: [0, 90, 180, 270, 360] }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
        >
          {cubies.map(cubie => {
            const t = getScene(sceneIndex, cubie.x, cubie.y, cubie.z);
            return (
              <motion.div
                key={cubie.id}
                className="absolute flex items-center justify-center"
                style={{ width: CUBIE_SIZE, height: CUBIE_SIZE, transformStyle: 'preserve-3d' }}
                animate={{
                  x: t.tx, y: t.ty, z: t.tz,
                  rotateX: t.rx, rotateY: t.ry, rotateZ: t.rz,
                  scale: t.scale,
                }}
                transition={{
                  type: 'spring', stiffness: 90, damping: 14, mass: 0.8,
                  delay: (Math.abs(cubie.x) + Math.abs(cubie.y) + Math.abs(cubie.z)) * 0.03,
                }}
              >
                {FACES.map((face, i) => (
                  <motion.div
                    key={i}
                    className="absolute inset-0"
                    style={{
                      transform: `${face.dir} translateZ(${CUBIE_SIZE / 2}px)`,
                      backfaceVisibility: 'hidden',
                    }}
                    animate={{
                      backgroundColor: PALETTE[face.key],
                      border: `2px solid ${PALETTE.border}`,
                      borderRadius: t.br,
                      boxShadow: 'inset 0 0 8px rgba(0,0,0,0.3)',
                    }}
                    transition={{ duration: 0.6 }}
                  />
                ))}
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}
