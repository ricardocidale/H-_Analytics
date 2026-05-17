# Rebecca - Replit Export

This file contains all the independent agent animation components. Copy the blocks below into individual `.tsx` files in your Replit project.

## `RebeccaAdvancedOrbit.tsx`

```tsx
/**
 * Rebecca — Deep Thinking Orbital
 * 9 distinct thought patterns: shape shifts, accent pulses, core nudges, and more.
 *
 * Dependencies: react, motion (motion/react), tailwindcss
 */
import React from 'react';
import { motion } from 'motion/react';

export const REBECCA_ORBIT_ADVANCED_META = {
  agent: 'Rebecca',
  name: 'Deep Thinking Orbital',
  description: '9 distinct thought patterns: shape shifts, accent pulses, core nudges, and more.',
  accent: '#10b981', // emerald-500
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

                let animateObj: any = { x: baseX, y: baseY, scale: 1, opacity: 1, borderRadius: '50%', rotateZ: 0 };
                let transitionObj: any = { duration: 0.4, ease: 'easeOut' };
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

export function RebeccaOrbitAdvancedCard({ size = 112 }: { size?: number }) {
  return (
    <div className="flex flex-col items-center text-center space-y-4">
      <div
        className="rounded-xl bg-stone-950 shadow-inner border border-stone-800/80 flex items-center justify-center overflow-hidden"
        style={{ width: size, height: size }}
      >
        <RebeccaOrbitAdvanced size={size} />
      </div>
      <div className="space-y-1">
        <h3 className="text-stone-100 font-semibold">{REBECCA_ORBIT_ADVANCED_META.agent}</h3>
        <p className="text-stone-400 text-xs uppercase tracking-wider font-semibold">
          {REBECCA_ORBIT_ADVANCED_META.name}
        </p>
        <p className="text-stone-500 text-sm leading-relaxed max-w-[220px]">
          {REBECCA_ORBIT_ADVANCED_META.description}
        </p>
      </div>
    </div>
  );
}
```

## `RebeccaAgents.tsx`

```tsx
import React from 'react';
import { motion } from 'motion/react';
import { Sparkles } from 'lucide-react';
import { RebeccaCaveSequence, REBECCA_CAVE_SEQUENCE_META } from './RebeccaCaveSequence';
import { RebeccaGeoSequence, REBECCA_GEO_SEQUENCE_META } from './RebeccaGeoSequence';
import { RebeccaTotemSequence, REBECCA_TOTEM_SEQUENCE_META } from './RebeccaTotemSequence';
import { RebeccaOrbit, REBECCA_ORBIT_META } from './RebeccaSwissOrbit';
import { RebeccaOrbitAdvanced, REBECCA_ORBIT_ADVANCED_META } from './RebeccaAdvancedOrbit';
import { RebeccaAlive, REBECCA_ALIVE_META } from './RebeccaAliveGeometry';

interface RebeccaAgentsProps {
  selectedAgent: string | null;
  setSelectedAgent: (agent: string) => void;
}

const ICON_BOX =
  'rounded-xl bg-stone-950 shadow-inner border border-stone-800/80 flex items-center justify-center w-[112px] h-[112px] overflow-hidden';

export function RebeccaAgents({ selectedAgent, setSelectedAgent }: RebeccaAgentsProps) {
  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
      {/* Option 1: Cave Sequence */}
      <motion.div
        whileHover={{ y: -4, scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setSelectedAgent('rebecca-cave')}
        className={`relative cursor-pointer group rounded-2xl p-6 border backdrop-blur-sm transition-all duration-300 overflow-hidden ${
          selectedAgent === 'rebecca-cave'
            ? 'border-orange-500/70 bg-stone-900/90 shadow-[0_0_30px_rgba(234,88,12,0.15)]'
            : 'border-stone-800 bg-stone-900/40 hover:bg-stone-900/60 hover:border-stone-600'
        }`}
      >
        <div className="relative z-10 flex flex-col items-center text-center space-y-6">
          <div className={ICON_BOX}>
            <RebeccaCaveSequence size={112} />
          </div>
          
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-stone-100 flex items-center justify-center gap-2">
              {REBECCA_CAVE_SEQUENCE_META.agent}
              <Sparkles className="text-orange-500" size={14} />
            </h3>
            <p className="text-stone-400 text-xs uppercase tracking-wider font-semibold mb-2">
              {REBECCA_CAVE_SEQUENCE_META.name}
            </p>
            <p className="text-stone-500 text-sm leading-relaxed">
              {REBECCA_CAVE_SEQUENCE_META.description}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Option 2: Shamanic Geo */}
      <motion.div
        whileHover={{ y: -4, scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setSelectedAgent('rebecca-geo')}
        className={`relative cursor-pointer group rounded-2xl p-6 border backdrop-blur-sm transition-all duration-300 overflow-hidden ${
          selectedAgent === 'rebecca-geo'
            ? 'border-amber-500/70 bg-stone-900/90 shadow-[0_0_30px_rgba(245,158,11,0.15)]'
            : 'border-stone-800 bg-stone-900/40 hover:bg-stone-900/60 hover:border-stone-600'
        }`}
      >
        <div className="relative z-10 flex flex-col items-center text-center space-y-6">
          <div className={ICON_BOX}>
            <RebeccaGeoSequence size={112} />
          </div>
          
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-stone-100 flex items-center justify-center gap-2">
              {REBECCA_GEO_SEQUENCE_META.agent}
              <Sparkles className="text-amber-500" size={14} />
            </h3>
            <p className="text-stone-400 text-xs uppercase tracking-wider font-semibold mb-2">
              {REBECCA_GEO_SEQUENCE_META.name}
            </p>
            <p className="text-stone-500 text-sm leading-relaxed">
              {REBECCA_GEO_SEQUENCE_META.description}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Option 3: Totem Masks */}
      <motion.div
        whileHover={{ y: -4, scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setSelectedAgent('rebecca-totem')}
        className={`relative cursor-pointer group rounded-2xl p-6 border backdrop-blur-sm transition-all duration-300 overflow-hidden ${
          selectedAgent === 'rebecca-totem'
            ? 'border-stone-400/70 bg-stone-900/90 shadow-[0_0_30px_rgba(214,211,209,0.15)]'
            : 'border-stone-800 bg-stone-900/40 hover:bg-stone-900/60 hover:border-stone-600'
        }`}
      >
        <div className="relative z-10 flex flex-col items-center text-center space-y-6">
          <div className={ICON_BOX}>
            <RebeccaTotemSequence size={112} />
          </div>
          
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-stone-100 flex items-center justify-center gap-2">
              {REBECCA_TOTEM_SEQUENCE_META.agent}
              <Sparkles className="text-stone-400" size={14} />
            </h3>
            <p className="text-stone-400 text-xs uppercase tracking-wider font-semibold mb-2">
              {REBECCA_TOTEM_SEQUENCE_META.name}
            </p>
            <p className="text-stone-500 text-sm leading-relaxed">
              {REBECCA_TOTEM_SEQUENCE_META.description}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Option 4: Swiss Orbital System */}
      <motion.div
        whileHover={{ y: -4, scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setSelectedAgent('rebecca-orbit')}
        className={`relative cursor-pointer group rounded-2xl p-6 border backdrop-blur-sm transition-all duration-300 overflow-hidden ${
          selectedAgent === 'rebecca-orbit'
            ? 'border-stone-300/70 bg-stone-900/90 shadow-[0_0_30px_rgba(231,229,228,0.15)]'
            : 'border-stone-800 bg-stone-900/40 hover:bg-stone-900/60 hover:border-stone-600'
        }`}
      >
        <div className="relative z-10 flex flex-col items-center text-center space-y-6">
          <div className={ICON_BOX}>
            <RebeccaOrbit size={112} />
          </div>

          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-stone-100 flex items-center justify-center gap-2">
              {REBECCA_ORBIT_META.agent}
              <Sparkles className="text-stone-300" size={14} />
            </h3>
            <p className="text-stone-400 text-xs uppercase tracking-wider font-semibold mb-2">
              {REBECCA_ORBIT_META.name}
            </p>
            <p className="text-stone-500 text-sm leading-relaxed">
              {REBECCA_ORBIT_META.description}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Option 5: Advanced Thinking Orbital */}
      <motion.div
        whileHover={{ y: -4, scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setSelectedAgent('rebecca-orbit-advanced')}
        className={`relative cursor-pointer group rounded-2xl p-6 border backdrop-blur-sm transition-all duration-300 overflow-hidden ${
          selectedAgent === 'rebecca-orbit-advanced'
            ? 'border-emerald-500/70 bg-stone-900/90 shadow-[0_0_30px_rgba(16,185,129,0.15)]'
            : 'border-stone-800 bg-stone-900/40 hover:bg-stone-900/60 hover:border-stone-600'
        }`}
      >
        <div className="relative z-10 flex flex-col items-center text-center space-y-6">
          <div className={ICON_BOX}>
            <RebeccaOrbitAdvanced size={112} />
          </div>

          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-stone-100 flex items-center justify-center gap-2">
              {REBECCA_ORBIT_ADVANCED_META.agent}
              <Sparkles className="text-emerald-400" size={14} />
            </h3>
            <p className="text-stone-400 text-xs uppercase tracking-wider font-semibold mb-2">
              {REBECCA_ORBIT_ADVANCED_META.name}
            </p>
            <p className="text-stone-500 text-sm leading-relaxed">
              {REBECCA_ORBIT_ADVANCED_META.description}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Option 6: Alive Merged Geometry */}
      <motion.div
        whileHover={{ y: -4, scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setSelectedAgent('rebecca-alive')}
        className={`relative cursor-pointer group rounded-2xl p-6 border backdrop-blur-sm transition-all duration-300 overflow-hidden ${
          selectedAgent === 'rebecca-alive'
            ? 'border-orange-500/70 bg-stone-900/90 shadow-[0_0_30px_rgba(249,115,22,0.15)]'
            : 'border-stone-800 bg-stone-900/40 hover:bg-stone-900/60 hover:border-stone-600'
        }`}
      >
        <div className="relative z-10 flex flex-col items-center text-center space-y-6">
          <div className={ICON_BOX}>
            <RebeccaAlive size={112} />
          </div>

          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-stone-100 flex items-center justify-center gap-2">
              {REBECCA_ALIVE_META.agent}
              <Sparkles className="text-orange-400" size={14} />
            </h3>
            <p className="text-stone-400 text-xs uppercase tracking-wider font-semibold mb-2">
              {REBECCA_ALIVE_META.name}
            </p>
            <p className="text-stone-500 text-sm leading-relaxed">
              {REBECCA_ALIVE_META.description}
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
```

## `RebeccaAliveGeometry.tsx`

```tsx
/**
 * Rebecca — Alive Merged Geometry
 * 12 merged Lascaux and Earth geometry instances executing randomly as one alive orbital entity.
 *
 * Dependencies: react, motion (motion/react), tailwindcss
 */
import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

export const REBECCA_ALIVE_META = {
  agent: 'Rebecca',
  name: 'Alive Merged Geometry',
  description: '12 merged Lascaux and Earth geometry instances executing randomly as one alive orbital entity.',
  accent: '#f97316', // orange-500
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

export function RebeccaAliveCard({ size = 112 }: { size?: number }) {
  return (
    <div className="flex flex-col items-center text-center space-y-4">
      <div
        className="rounded-xl bg-stone-950 shadow-inner border border-stone-800/80 flex items-center justify-center overflow-hidden"
        style={{ width: size, height: size }}
      >
        <RebeccaAlive size={size} />
      </div>
      <div className="space-y-1">
        <h3 className="text-stone-100 font-semibold">{REBECCA_ALIVE_META.agent}</h3>
        <p className="text-stone-400 text-xs uppercase tracking-wider font-semibold">
          {REBECCA_ALIVE_META.name}
        </p>
        <p className="text-stone-500 text-sm leading-relaxed max-w-[220px]">
          {REBECCA_ALIVE_META.description}
        </p>
      </div>
    </div>
  );
}
```

## `RebeccaCaveSequence.tsx`

```tsx
/**
 * Rebecca — Lascaux Sequence
 * Archetypal feminine storytelling drawn into the rock.
 *
 * Dependencies: react, motion (motion/react), tailwindcss
 */
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

export const REBECCA_CAVE_SEQUENCE_META = {
  agent: 'Rebecca',
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
```

## `RebeccaGeoSequence.tsx`

```tsx
/**
 * Rebecca — Earth Geometry
 * Sacred feminine geometry and elemental flow.
 *
 * Dependencies: react, motion (motion/react), tailwindcss
 */
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

export const REBECCA_GEO_SEQUENCE_META = {
  agent: 'Rebecca',
  name: 'Earth Geometry',
  description: 'Sacred feminine geometry and elemental flow.',
  accent: '#f59e0b',
} as const;

const geoSequences = [
  {
    id: 'chalice', // Water/Chalice
    paths: [
      "M 20 25 L 80 25 L 50 65 Z", 
      "M 50 65 L 50 90", 
      "M 30 90 L 70 90"
    ]
  },
  {
    id: 'womb', // Seed/Womb
    paths: [
      "M 50 10 L 90 50 L 50 90 L 10 50 Z",
      "M 50 30 L 70 50 L 50 70 L 30 50 Z",
      "M 50 45 a 5 5 0 1 0 0 10 a 5 5 0 1 0 0 -10"
    ]
  },
  {
    id: 'moon_cycles', // Intersecting Cycles
    paths: [
      "M 50 20 a 30 30 0 1 0 0 60 a 30 30 0 1 0 0 -60",
      "M 20 50 A 20 20 0 0 1 50 50 A 20 20 0 0 0 20 50",
      "M 80 50 A 20 20 0 0 0 50 50 A 20 20 0 0 1 80 50"
    ]
  },
  {
    id: 'water_flow', // Flowing Rivers
    paths: [
      "M 10 30 C 30 10, 70 50, 90 30", 
      "M 10 50 C 30 30, 70 70, 90 50", 
      "M 10 70 C 30 50, 70 90, 90 70"
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

      <div className={`absolute inset-0 rounded-full bg-gradient-to-tr from-stone-800 to-orange-950 shadow-inner border border-stone-600/50 overflow-hidden`}>
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
                    ...(wave
                      ? { d: { duration: wave.duration, repeat: Infinity, ease: 'easeInOut' } }
                      : {}),
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

export function RebeccaGeoSequenceCard({ size = 112 }: { size?: number }) {
  return (
    <div className="flex flex-col items-center text-center space-y-4">
      <div
        className="rounded-xl bg-stone-950 shadow-inner border border-stone-800/80 flex items-center justify-center overflow-hidden"
        style={{ width: size, height: size }}
      >
        <RebeccaGeoSequence size={size} />
      </div>
      <div className="space-y-1">
        <h3 className="text-stone-100 font-semibold">{REBECCA_GEO_SEQUENCE_META.agent}</h3>
        <p className="text-stone-400 text-xs uppercase tracking-wider font-semibold">
          {REBECCA_GEO_SEQUENCE_META.name}
        </p>
        <p className="text-stone-500 text-sm leading-relaxed max-w-[220px]">
          {REBECCA_GEO_SEQUENCE_META.description}
        </p>
      </div>
    </div>
  );
}
```

## `RebeccaSwissOrbit.tsx`

```tsx
/**
 * Rebecca — Swiss Orbital System
 * A thinking system — orbits, sparks, and a pulsing core.
 *
 * Dependencies: react, motion (motion/react), tailwindcss
 */
import React from 'react';
import { motion } from 'motion/react';

export const REBECCA_ORBIT_META = {
  agent: 'Rebecca',
  name: 'Swiss Orbital',
  description: 'A thinking system — orbits, sparks, and a pulsing core.',
  accent: '#e7e5e4', // stone-200
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

export function RebeccaOrbitCard({ size = 112 }: { size?: number }) {
  return (
    <div className="flex flex-col items-center text-center space-y-4">
      <div
        className="rounded-xl bg-stone-950 shadow-inner border border-stone-800/80 flex items-center justify-center overflow-hidden"
        style={{ width: size, height: size }}
      >
        <RebeccaOrbit size={size} />
      </div>
      <div className="space-y-1">
        <h3 className="text-stone-100 font-semibold">{REBECCA_ORBIT_META.agent}</h3>
        <p className="text-stone-400 text-xs uppercase tracking-wider font-semibold">
          {REBECCA_ORBIT_META.name}
        </p>
        <p className="text-stone-500 text-sm leading-relaxed max-w-[220px]">
          {REBECCA_ORBIT_META.description}
        </p>
      </div>
    </div>
  );
}
```

## `RebeccaTotemSequence.tsx`

```tsx
/**
 * Rebecca — Ancestral Totems
 * Feminine spirit guides and matriarchal totems.
 *
 * Dependencies: react, motion (motion/react), tailwindcss
 */
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

export const REBECCA_TOTEM_SEQUENCE_META = {
  agent: 'Rebecca',
  name: 'Ancestral Totems',
  description: 'Feminine spirit guides and matriarchal totems.',
  accent: '#d6d3d1',
} as const;

const totemSequences = [
  {
    id: 'owl', // Wisdom/Night
    paths: [
      "M 20 40 C 20 10, 80 10, 80 40 C 80 80, 50 90, 50 90 C 50 90, 20 80, 20 40 Z", // Face
      "M 40 40 a 8 8 0 1 0 -16 0 a 8 8 0 1 0 16 0", // Eye L
      "M 76 40 a 8 8 0 1 0 -16 0 a 8 8 0 1 0 16 0", // Eye R
      "M 45 55 L 55 55 L 50 65 Z" // Beak
    ]
  },
  {
    id: 'lioness', // Strength/Mother
    paths: [
      "M 20 30 L 30 35 C 40 25, 60 25, 70 35 L 80 30 L 75 55 C 70 80, 50 90, 50 90 C 50 90, 30 80, 25 55 Z", // Head
      "M 35 50 L 45 45 M 65 50 L 55 45", // Slanted Eyes
      "M 45 65 L 55 65 L 50 75 Z" // Nose
    ]
  },
  {
    id: 'goddess_mask', // Serene Priestess
    paths: [
      "M 30 30 C 30 5, 70 5, 70 30 C 70 70, 50 90, 50 90 C 50 90, 30 70, 30 30 Z", // Oval Face
      "M 35 45 Q 42 35 48 45", // Closed Eye L
      "M 65 45 Q 58 35 52 45", // Closed Eye R
      "M 50 60 L 50 65", // Nose bridge
      "M 43 75 Q 50 85 57 75" // Gentle Smile
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

const WAVE_PATHS: Record<string, Record<number, { frames: string[]; duration: number }>> = {};

export function RebeccaTotemSequence({ size = 112, className = "" }: { size?: number, className?: string }) {
  const [step, setStep] = useState(0);
  const color = REBECCA_TOTEM_SEQUENCE_META.accent;
  const filterId = React.useId().replace(/:/g, '');

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | undefined;
    const tick = () => {
      if (cancelled) return;
      setStep(s => (s + 1) % totemSequences.length);
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
      const current = totemSequences[step];
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
          <filter id={`totem-roughness-${filterId}`}>
            <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="3" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.5" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>

      <div className={`absolute inset-0 rounded-full bg-gradient-to-b from-stone-800 to-stone-950 shadow-inner border border-stone-600/50 overflow-hidden`}>
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

      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full p-3 drop-shadow-md" style={{ filter: `url(#totem-roughness-${filterId})` }}>
        <AnimatePresence mode="wait">
          <motion.g
            key={totemSequences[step].id}
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
            {totemSequences[step].paths.map((d: string, i: number) => {
              const wave = WAVE_PATHS[totemSequences[step].id]?.[i];
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
              const traceIdx = (retrace?.stroke ?? 0) % totemSequences[step].paths.length;
              const traceKey = retrace?.key ?? 0;
              const wave = WAVE_PATHS[totemSequences[step].id]?.[traceIdx];
              const d = wave ? wave.frames[0] : totemSequences[step].paths[traceIdx];
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

            {totemSequences[step].paths.map((d: string, i: number) => {
              const wave = WAVE_PATHS[totemSequences[step].id]?.[i];
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

export function RebeccaTotemSequenceCard({ size = 112 }: { size?: number }) {
  return (
    <div className="flex flex-col items-center text-center space-y-4">
      <div
        className="rounded-xl bg-stone-950 shadow-inner border border-stone-800/80 flex items-center justify-center overflow-hidden"
        style={{ width: size, height: size }}
      >
        <RebeccaTotemSequence size={size} />
      </div>
      <div className="space-y-1">
        <h3 className="text-stone-100 font-semibold">{REBECCA_TOTEM_SEQUENCE_META.agent}</h3>
        <p className="text-stone-400 text-xs uppercase tracking-wider font-semibold">
          {REBECCA_TOTEM_SEQUENCE_META.name}
        </p>
        <p className="text-stone-500 text-sm leading-relaxed max-w-[220px]">
          {REBECCA_TOTEM_SEQUENCE_META.description}
        </p>
      </div>
    </div>
  );
}
```

