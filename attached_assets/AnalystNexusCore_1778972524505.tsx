/**
 * The Analyst — Nexus Core
 * Shape-shifting algorithms processing multi-layered data.
 *
 * Dependencies: react, motion (motion/react), tailwindcss
 * Usage:
 *   <AnalystNexusCore />                  // fills parent
 *   <AnalystNexusCore size={112} />       // fixed pixel size
 *   <AnalystNexusCoreCard size={112} />   // includes tile container + label
 */
import React from 'react';
import { motion } from 'motion/react';

export const ANALYST_NEXUS_CORE_META = {
  agent: 'Cube',
  name: 'Nexus Core',
  description: 'Shape-shifting algorithms processing multi-layered data.',
  accent: '#06b6d4',
} as const;

export function AnalystNexusCore({
  size,
  className = '',
}: { size?: number; className?: string }) {
  const blocks = [
    { origin: '100% 100%', bg: 'linear-gradient(135deg, #0ea5e9, #2dd4bf)' },
    { origin: '0% 100%', bg: 'linear-gradient(135deg, #6366f1, #a855f7)' },
    { origin: '100% 0%', bg: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' },
    { origin: '0% 0%', bg: 'linear-gradient(135deg, #14b8a6, #3b82f6)' },
  ];

  const sizeStyle = size ? { width: size, height: size } : { width: '100%', height: '100%' };

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden ${className}`}
      style={sizeStyle}
    >
      <motion.div
        className="absolute inset-0 rounded-full bg-blue-500/30 blur-xl z-0"
        animate={{ scale: [0.9, 1.05, 0.9], opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="relative z-10"
        style={{ width: '60%', height: '60%' }}
        animate={{ rotate: [0, 90, 180, 270, 360] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
      >
        {blocks.map((block, i) => (
          <motion.div
            key={i}
            className="absolute shadow-lg mix-blend-screen"
            style={{
              width: '45%',
              height: '45%',
              background: block.bg,
              transformOrigin: block.origin,
              top: i > 1 ? '55%' : '0%',
              left: i % 2 === 1 ? '55%' : '0%',
              borderRadius: '25%',
            }}
            animate={{
              scale: [1, 0.4, 1.05, 1],
              rotate: [0, 90, 0, -90, 0],
              borderRadius: ['25%', '50%', '10%', '25%'],
            }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: i * 0.2 }}
          />
        ))}
      </motion.div>
      <motion.div
        className="absolute w-[14%] h-[14%] bg-white z-20 mix-blend-overlay"
        style={{ rotate: 45, borderRadius: '2px' }}
        animate={{ scale: [0.5, 1.4, 0.5], opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  );
}

export function AnalystNexusCoreCard({ size = 112 }: { size?: number }) {
  return (
    <div className="flex flex-col items-center text-center space-y-4">
      <div
        className="rounded-xl bg-stone-950 shadow-inner border border-stone-800/80 flex items-center justify-center overflow-hidden"
        style={{ width: size, height: size }}
      >
        <AnalystNexusCore size={size} />
      </div>
      <div className="space-y-1">
        <h3 className="text-stone-100 font-semibold">{ANALYST_NEXUS_CORE_META.agent}</h3>
        <p className="text-stone-400 text-xs uppercase tracking-wider font-semibold">
          {ANALYST_NEXUS_CORE_META.name}
        </p>
        <p className="text-stone-500 text-sm leading-relaxed max-w-[220px]">
          {ANALYST_NEXUS_CORE_META.description}
        </p>
      </div>
    </div>
  );
}
