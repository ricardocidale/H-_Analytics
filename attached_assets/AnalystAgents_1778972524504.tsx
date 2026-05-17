import React from 'react';
import { motion } from 'motion/react';
import { BarChart2, Hexagon } from 'lucide-react';
import { AnalystNexusCore, ANALYST_NEXUS_CORE_META } from './AnalystNexusCore';
import { AnalystQuantumSolver, ANALYST_QUANTUM_SOLVER_META } from './AnalystQuantumSolver';
import { AnalystExpandingSolver, ANALYST_EXPANDING_SOLVER_META } from './AnalystExpandingSolver';
import { AnalystSwissCube, ANALYST_SWISS_CUBE_META } from './AnalystSwissCube';
import { AnalystThinkingCube, ANALYST_THINKING_CUBE_META } from './AnalystThinkingCube';
import { AnalystBarChartPulse, ANALYST_BAR_CHART_PULSE_META } from './AnalystBarChartPulse';

interface AnalystAgentsProps {
  selectedAgent: string | null;
  setSelectedAgent: (agent: string) => void;
}

const ICON_BOX =
  'rounded-xl bg-stone-950 shadow-inner border border-stone-800/80 flex items-center justify-center w-[112px] h-[112px] overflow-hidden';

export function AnalystAgents({ selectedAgent, setSelectedAgent }: AnalystAgentsProps) {
  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
      {/* Option 1: Nexus Core */}
      <motion.div
        whileHover={{ y: -4, scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setSelectedAgent('analyst')}
        className={`relative cursor-pointer group rounded-2xl p-6 border backdrop-blur-sm transition-all duration-300 overflow-hidden ${
          selectedAgent === 'analyst'
            ? 'border-blue-500/70 bg-stone-900/90 shadow-[0_0_30px_rgba(59,130,246,0.15)]'
            : 'border-stone-800 bg-stone-900/40 hover:bg-stone-900/60 hover:border-stone-600'
        }`}
      >
        <div className="relative z-10 flex flex-col items-center text-center space-y-6">
          <div className={ICON_BOX}>
            <AnalystNexusCore size={112} />
          </div>

          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-stone-100 flex items-center justify-center gap-2">
              {ANALYST_NEXUS_CORE_META.agent}
              <BarChart2 className="text-cyan-500" size={14} />
            </h3>
            <p className="text-stone-400 text-xs uppercase tracking-wider font-semibold mb-2">
              {ANALYST_NEXUS_CORE_META.name}
            </p>
            <p className="text-stone-500 text-sm leading-relaxed">
              {ANALYST_NEXUS_CORE_META.description}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Option 2: Quantum Solver */}
      <motion.div
        whileHover={{ y: -4, scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setSelectedAgent('analyst-cube')}
        className={`relative cursor-pointer group rounded-2xl p-6 border backdrop-blur-sm transition-all duration-300 overflow-hidden ${
          selectedAgent === 'analyst-cube'
            ? 'border-indigo-500/70 bg-stone-900/90 shadow-[0_0_30px_rgba(99,102,241,0.15)]'
            : 'border-stone-800 bg-stone-900/40 hover:bg-stone-900/60 hover:border-stone-600'
        }`}
      >
        <div className="relative z-10 flex flex-col items-center text-center space-y-6">
          <div className={ICON_BOX}>
            <AnalystQuantumSolver size={112} />
          </div>

          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-stone-100 flex items-center justify-center gap-2">
              {ANALYST_QUANTUM_SOLVER_META.agent}
              <Hexagon className="text-indigo-500" size={14} />
            </h3>
            <p className="text-stone-400 text-xs uppercase tracking-wider font-semibold mb-2">
              {ANALYST_QUANTUM_SOLVER_META.name}
            </p>
            <p className="text-stone-500 text-sm leading-relaxed">
              {ANALYST_QUANTUM_SOLVER_META.description}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Option 3: Expanding Solver */}
      <motion.div
        whileHover={{ y: -4, scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setSelectedAgent('analyst-cube-expanding')}
        className={`relative cursor-pointer group rounded-2xl p-6 border backdrop-blur-sm transition-all duration-300 overflow-hidden ${
          selectedAgent === 'analyst-cube-expanding'
            ? 'border-teal-500/70 bg-stone-900/90 shadow-[0_0_30px_rgba(45,212,191,0.15)]'
            : 'border-stone-800 bg-stone-900/40 hover:bg-stone-900/60 hover:border-stone-600'
        }`}
      >
        <div className="relative z-10 flex flex-col items-center text-center space-y-6">
          <div className={ICON_BOX}>
            <AnalystExpandingSolver size={112} />
          </div>

          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-stone-100 flex items-center justify-center gap-2">
              {ANALYST_EXPANDING_SOLVER_META.agent}
              <Hexagon className="text-teal-500" size={14} />
            </h3>
            <p className="text-stone-400 text-xs uppercase tracking-wider font-semibold mb-2">
              {ANALYST_EXPANDING_SOLVER_META.name}
            </p>
            <p className="text-stone-500 text-sm leading-relaxed">
              {ANALYST_EXPANDING_SOLVER_META.description}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Option 4: Swiss Monochrome Cube */}
      <motion.div
        whileHover={{ y: -4, scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setSelectedAgent('analyst-cube-swiss')}
        className={`relative cursor-pointer group rounded-2xl p-6 border backdrop-blur-sm transition-all duration-300 overflow-hidden ${
          selectedAgent === 'analyst-cube-swiss'
            ? 'border-stone-400/70 bg-stone-900/90 shadow-[0_0_30px_rgba(168,162,158,0.15)]'
            : 'border-stone-800 bg-stone-900/40 hover:bg-stone-900/60 hover:border-stone-600'
        }`}
      >
        <div className="relative z-10 flex flex-col items-center text-center space-y-6">
          <div className={ICON_BOX}>
            <AnalystSwissCube size={112} />
          </div>

          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-stone-100 flex items-center justify-center gap-2">
              {ANALYST_SWISS_CUBE_META.agent}
              <Hexagon className="text-stone-400" size={14} />
            </h3>
            <p className="text-stone-400 text-xs uppercase tracking-wider font-semibold mb-2">
              {ANALYST_SWISS_CUBE_META.name}
            </p>
            <p className="text-stone-500 text-sm leading-relaxed">
              {ANALYST_SWISS_CUBE_META.description}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Option 5: Thinking Cube */}
      <motion.div
        whileHover={{ y: -4, scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setSelectedAgent('analyst-cube-thinking')}
        className={`relative cursor-pointer group rounded-2xl p-6 border backdrop-blur-sm transition-all duration-300 overflow-hidden ${
          selectedAgent === 'analyst-cube-thinking'
            ? 'border-indigo-400/70 bg-stone-900/90 shadow-[0_0_30px_rgba(129,140,248,0.15)]'
            : 'border-stone-800 bg-stone-900/40 hover:bg-stone-900/60 hover:border-stone-600'
        }`}
      >
        <div className="relative z-10 flex flex-col items-center text-center space-y-6">
          <div className={ICON_BOX}>
            <AnalystThinkingCube size={112} />
          </div>

          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-stone-100 flex items-center justify-center gap-2">
              {ANALYST_THINKING_CUBE_META.agent}
              <Hexagon className="text-indigo-300" size={14} />
            </h3>
            <p className="text-stone-400 text-xs uppercase tracking-wider font-semibold mb-2">
              {ANALYST_THINKING_CUBE_META.name}
            </p>
            <p className="text-stone-500 text-sm leading-relaxed">
              {ANALYST_THINKING_CUBE_META.description}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Option 6: Bar Chart Pulse */}
      <motion.div
        whileHover={{ y: -4, scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setSelectedAgent('analyst-bar-chart')}
        className={`relative cursor-pointer group rounded-2xl p-6 border backdrop-blur-sm transition-all duration-300 overflow-hidden ${
          selectedAgent === 'analyst-bar-chart'
            ? 'border-cyan-500/70 bg-stone-900/90 shadow-[0_0_30px_rgba(34,211,238,0.15)]'
            : 'border-stone-800 bg-stone-900/40 hover:bg-stone-900/60 hover:border-stone-600'
        }`}
      >
        <div className="relative z-10 flex flex-col items-center text-center space-y-6">
          <div className={ICON_BOX}>
            <AnalystBarChartPulse size={112} />
          </div>

          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-stone-100 flex items-center justify-center gap-2">
              {ANALYST_BAR_CHART_PULSE_META.agent}
              <BarChart2 className="text-cyan-400" size={14} />
            </h3>
            <p className="text-stone-400 text-xs uppercase tracking-wider font-semibold mb-2">
              {ANALYST_BAR_CHART_PULSE_META.name}
            </p>
            <p className="text-stone-500 text-sm leading-relaxed">
              {ANALYST_BAR_CHART_PULSE_META.description}
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
