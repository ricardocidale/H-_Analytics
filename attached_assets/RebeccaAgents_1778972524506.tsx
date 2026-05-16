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
