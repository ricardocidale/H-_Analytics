# The Analyst - Replit Export

This file contains all the independent agent animation components. Copy the blocks below into individual `.tsx` files in your Replit project.

## `AnalystAgents.tsx`

```tsx
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
```

## `AnalystBarChartPulse.tsx`

```tsx
/**
 * The Analyst — Bar Chart Pulse
 * Volumetric bars pulsing across time as live metrics rebalance.
 *
 * Dependencies: react, motion (motion/react), tailwindcss
 */
import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';

export const ANALYST_BAR_CHART_PULSE_META = {
  agent: 'The Analyst',
  name: 'Bar Chart Pulse',
  description: 'Volumetric bars pulsing across time as live metrics rebalance.',
  accent: '#22d3ee',
} as const;

const SCENES = [
  [30, 30, 30, 30, 30, 30, 30, 30, 30],
  [60, 30, 30, 30, 90, 30, 30, 30, 60],
  [30, 80, 30, 80, 30, 80, 30, 80, 30],
  [40, 60, 90, 30, 40, 60, 20, 30, 40],
  [90, 60, 40, 60, 40, 30, 40, 30, 20],
  [140, 40, 40, 40, 140, 40, 40, 40, 140],
  [40, 40, 140, 40, 140, 40, 140, 40, 40],
  [30, 60, 30, 60, 160, 60, 30, 60, 30],
  [110, 90, 70, 90, 70, 50, 70, 50, 30],
];

const COLORS = [
  { top: '#38bdf8', left: '#0284c7', right: '#0c4a6e' },
  { top: '#818cf8', left: '#4f46e5', right: '#312e81' },
  { top: '#a78bfa', left: '#7c3aed', right: '#4c1d95' },
  { top: '#c084fc', left: '#9333ea', right: '#5b21b6' },
  { top: '#f0abfc', left: '#c026d3', right: '#831843' },
  { top: '#f472b6', left: '#db2777', right: '#9d174d' },
  { top: '#fb7185', left: '#e11d48', right: '#881337' },
  { top: '#f43f5e', left: '#be123c', right: '#4c0519' },
  { top: '#fb923c', left: '#ea580c', right: '#7c2d12' },
];

const W = 28;
const dx = W * 0.866;
const dy = W * 0.5;
const G = 12;

const topPath = (cx: number, cy: number, h: number) =>
  `M ${cx},${cy - h - dy} L ${cx + dx},${cy - h} L ${cx},${cy - h + dy} L ${cx - dx},${cy - h} Z`;
const rightPath = (cx: number, cy: number, h: number) =>
  `M ${cx},${cy - h + dy} L ${cx + dx},${cy - h} L ${cx + dx},${cy} L ${cx},${cy + dy} Z`;
const leftPath = (cx: number, cy: number, h: number) =>
  `M ${cx - dx},${cy - h} L ${cx},${cy - h + dy} L ${cx},${cy + dy} L ${cx - dx},${cy} Z`;

export function AnalystBarChartPulse({
  size,
  className = '',
}: { size?: number; className?: string }) {
  const [sceneIndex, setSceneIndex] = useState(0);
  const sizeStyle = size ? { width: size, height: size } : { width: '100%', height: '100%' };

  useEffect(() => {
    const interval = setInterval(() => {
      setSceneIndex(prev => {
        let next = Math.floor(Math.random() * SCENES.length);
        if (next === prev) next = (next + 1) % SCENES.length;
        return next;
      });
    }, 700);
    return () => clearInterval(interval);
  }, []);

  const heights = SCENES[sceneIndex];

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden ${className}`}
      style={sizeStyle}
    >
      <svg
        viewBox="0 0 360 360"
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full"
        style={{ overflow: 'hidden' }}
      >
        <g transform="translate(180, 250)">
          {heights.map((h, i) => {
            const r = Math.floor(i / 3);
            const c = i % 3;
            const cx = (c - r) * (dx + G);
            const cy = (c + r) * (dy + G / 2) - 30;
            const color = COLORS[i];
            return (
              <g key={i}>
                <motion.path animate={{ d: leftPath(cx, cy, h) }} fill={color.left}
                  transition={{ type: 'spring', stiffness: 140, damping: 12, mass: 0.8 }} />
                <motion.path animate={{ d: rightPath(cx, cy, h) }} fill={color.right}
                  transition={{ type: 'spring', stiffness: 140, damping: 12, mass: 0.8 }} />
                <motion.path animate={{ d: topPath(cx, cy, h) }} fill={color.top}
                  transition={{ type: 'spring', stiffness: 140, damping: 12, mass: 0.8 }} />
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

export function AnalystBarChartPulseCard({ size = 112 }: { size?: number }) {
  return (
    <div className="flex flex-col items-center text-center space-y-4">
      <div
        className="rounded-xl bg-stone-950 shadow-inner border border-stone-800/80 flex items-center justify-center overflow-hidden"
        style={{ width: size, height: size }}
      >
        <AnalystBarChartPulse size={size} />
      </div>
      <div className="space-y-1">
        <h3 className="text-stone-100 font-semibold">{ANALYST_BAR_CHART_PULSE_META.agent}</h3>
        <p className="text-stone-400 text-xs uppercase tracking-wider font-semibold">
          {ANALYST_BAR_CHART_PULSE_META.name}
        </p>
        <p className="text-stone-500 text-sm leading-relaxed max-w-[220px]">
          {ANALYST_BAR_CHART_PULSE_META.description}
        </p>
      </div>
    </div>
  );
}
```

## `AnalystCubeR3F.tsx`

```tsx
import React, { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import * as THREE from 'three';

class R3FBoundary extends React.Component<{ children: React.ReactNode, fallback: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError(error: any) { 
    return { hasError: true }; 
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error("R3F Error:", error, errorInfo);
  }
  render() { return this.state.hasError ? this.props.fallback : this.props.children; }
}

function Fallback({ size }: { size: number }) {
  return (
    <div className="flex items-center justify-center" style={{ width: size, height: size }}>
      <div className="rounded-md bg-stone-700 border border-stone-600" style={{ width: size * 0.6, height: size * 0.6 }} />
    </div>
  );
}

export function AnalystCubeR3F({ size = 64, type = 'swiss', className = "" }: { size?: number, type?: 'base' | 'expanding' | 'swiss' | 'thinking', className?: string }) {
  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      <R3FBoundary fallback={<Fallback size={size} />}>
        <Canvas camera={{ position: [0, 0, 7.5], fov: 35 }} gl={{ alpha: true, antialias: true }} style={{ pointerEvents: 'none' }}>
          <ambientLight intensity={1.2} />
          <directionalLight position={[5, 10, 5]} intensity={2.5} />
          <directionalLight position={[-5, -10, -5]} intensity={0.5} />
          <Scene type={type} />
        </Canvas>
      </R3FBoundary>
    </div>
  );
}

function Scene({ type }: { type: string }) {
  const groupRef = useRef<THREE.Group>(null);
  const targetRotation = useRef(new THREE.Quaternion());
  const currentRotation = useRef(new THREE.Quaternion());

  // Non-linear tumbling for the entire assembly
  useFrame((state, delta) => {
    if (groupRef.current) {
      if (Math.random() < 0.01) {
        // Random 90-degree twist
        const x = Math.random() > 0.5 ? 1 : 0;
        const y = Math.random() > 0.5 ? 1 : 0;
        const z = Math.random() > 0.5 ? 1 : 0;
        if (x !== 0 || y !== 0 || z !== 0) {
          const axis = new THREE.Vector3(x, y, z).normalize();
          const angle = (Math.PI / 2) * (Math.random() > 0.5 ? 1 : -1);
          const q = new THREE.Quaternion().setFromAxisAngle(axis, angle);
          targetRotation.current.multiply(q);
        }
      }
      currentRotation.current.slerp(targetRotation.current, delta * 3);
      groupRef.current.setRotationFromQuaternion(currentRotation.current);

      // Continuous slow drift applied via quaternion to prevent snapping
      const drift = new THREE.Quaternion().setFromEuler(new THREE.Euler(delta * 0.1, delta * 0.15, 0));
      targetRotation.current.multiply(drift);
    }
  });

  const cubies = useMemo(() => {
    const arr = [];
    for(let x=-1; x<=1; x++) {
      for(let y=-1; y<=1; y++) {
        for(let z=-1; z<=1; z++) {
          if (x===0 && y===0 && z===0 && type === 'thinking') continue; // leave space for core
          arr.push({ x, y, z, id: `${x}-${y}-${z}` });
        }
      }
    }
    return arr;
  }, [type]);

  const offset = 1.05;

  return (
    <group ref={groupRef}>
      {cubies.map(c => (
        <Cubie key={c.id} x={c.x} y={c.y} z={c.z} offset={offset} type={type} />
      ))}
      {type === 'thinking' && (
        <mesh>
          <sphereGeometry args={[0.75, 32, 32]} />
          <meshStandardMaterial color="#818cf8" emissive="#6366f1" emissiveIntensity={3} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

function Cubie({ x, y, z, offset, type }: { x: number, y: number, z: number, offset: number, type: string }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const basePos = useMemo(() => new THREE.Vector3(x * offset, y * offset, z * offset), [x,y,z,offset]);
  const targetPos = useRef(basePos.clone());
  const isDarting = useRef(false);
  
  // Swiss monochrome palette
  const color = useMemo(() => {
    const palette = ['#f5f5f4', '#d6d3d1', '#a8a29e', '#78716c', '#44403c'];
    return palette[Math.abs(x * 7 + y * 13 + z * 5) % palette.length];
  }, [x, y, z]);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    
    // Non-linear scramble logic per piece
    if (Math.random() < 0.005 && !isDarting.current) {
      if (type === 'expanding') {
        targetPos.current.copy(basePos).multiplyScalar(1.5 + Math.random() * 0.5);
      } else if (type === 'swiss') {
        targetPos.current.copy(basePos).multiplyScalar(1.2 + Math.random() * 0.3);
      } else if (type === 'thinking') {
        // "Thoughts" dart inward toward the core, or expand outward
        const dartIn = Math.random() > 0.4;
        targetPos.current.copy(basePos).multiplyScalar(dartIn ? 0.3 : (1.2 + Math.random() * 0.3));
      }
      isDarting.current = true;
    } else if (isDarting.current && Math.random() < 0.015) {
      // Snap back to base position
      targetPos.current.copy(basePos);
      isDarting.current = false;
    }
    
    // Smooth translation
    meshRef.current.position.lerp(targetPos.current, delta * 8);

    // Occasional local rotation
    if (Math.random() < 0.002) {
      meshRef.current.rotation.x += Math.PI / 2;
    }
  });

  return (
    <mesh ref={meshRef} position={basePos}>
      <boxGeometry args={[0.95, 0.95, 0.95]} />
      <meshStandardMaterial color={color} roughness={0.1} metalness={0.6} />
    </mesh>
  );
}
```

## `AnalystExpandingSolver.tsx`

```tsx
/**
 * The Analyst — Expanding Solver
 * Quantum parts exploding and contracting dynamically as they solve.
 *
 * Dependencies: react, motion (motion/react), tailwindcss
 */
import React from 'react';
import { motion } from 'motion/react';

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

export function AnalystExpandingSolverCard({ size = 112 }: { size?: number }) {
  return (
    <div className="flex flex-col items-center text-center space-y-4">
      <div
        className="rounded-xl bg-stone-950 shadow-inner border border-stone-800/80 flex items-center justify-center overflow-hidden"
        style={{ width: size, height: size }}
      >
        <AnalystExpandingSolver size={size} />
      </div>
      <div className="space-y-1">
        <h3 className="text-stone-100 font-semibold">{ANALYST_EXPANDING_SOLVER_META.agent}</h3>
        <p className="text-stone-400 text-xs uppercase tracking-wider font-semibold">
          {ANALYST_EXPANDING_SOLVER_META.name}
        </p>
        <p className="text-stone-500 text-sm leading-relaxed max-w-[220px]">
          {ANALYST_EXPANDING_SOLVER_META.description}
        </p>
      </div>
    </div>
  );
}
```

## `AnalystNexusCore.tsx`

```tsx
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
  agent: 'The Analyst',
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
```

## `AnalystQuantumSolver.tsx`

```tsx
/**
 * The Analyst — Quantum Solver
 * Multi-dimensional logic engine snapping complexity into focus.
 *
 * Dependencies: react, motion (motion/react), tailwindcss
 */
import React from 'react';
import { motion } from 'motion/react';

export const ANALYST_QUANTUM_SOLVER_META = {
  agent: 'The Analyst',
  name: 'Quantum Solver',
  description: 'Multi-dimensional logic engine snapping complexity into focus.',
  accent: '#6366f1',
} as const;

const CUBIE = 14;
const GAP = 1;
const OFFSET = CUBIE + GAP;
const REFERENCE = 80;

const FACES = [
  { dir: 'rotateY(0deg)', bg: '#6366f1' },
  { dir: 'rotateY(90deg)', bg: '#8b5cf6' },
  { dir: 'rotateY(180deg)', bg: '#2dd4bf' },
  { dir: 'rotateY(-90deg)', bg: '#f472b6' },
  { dir: 'rotateX(90deg)', bg: '#0ea5e9' },
  { dir: 'rotateX(-90deg)', bg: '#f59e0b' },
];

export function AnalystQuantumSolver({
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
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
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
                  <div
                    className="absolute"
                    style={{
                      width: CUBIE,
                      height: CUBIE,
                      transformStyle: 'preserve-3d',
                      transform: `translate3d(${x * OFFSET}px, ${y * OFFSET}px, ${z * OFFSET}px)`,
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
                  </div>
                </motion.div>
              ))
            )
          )}
        </motion.div>
      </div>
    </div>
  );
}

export function AnalystQuantumSolverCard({ size = 112 }: { size?: number }) {
  return (
    <div className="flex flex-col items-center text-center space-y-4">
      <div
        className="rounded-xl bg-stone-950 shadow-inner border border-stone-800/80 flex items-center justify-center overflow-hidden"
        style={{ width: size, height: size }}
      >
        <AnalystQuantumSolver size={size} />
      </div>
      <div className="space-y-1">
        <h3 className="text-stone-100 font-semibold">{ANALYST_QUANTUM_SOLVER_META.agent}</h3>
        <p className="text-stone-400 text-xs uppercase tracking-wider font-semibold">
          {ANALYST_QUANTUM_SOLVER_META.name}
        </p>
        <p className="text-stone-500 text-sm leading-relaxed max-w-[220px]">
          {ANALYST_QUANTUM_SOLVER_META.description}
        </p>
      </div>
    </div>
  );
}
```

## `AnalystSwissCube.tsx`

```tsx
/**
 * The Analyst — Swiss Modern
 * Monochrome minimalism moving with rapid, calculated precision.
 *
 * Dependencies: react, motion (motion/react), tailwindcss
 */
import React from 'react';
import { motion } from 'motion/react';

export const ANALYST_SWISS_CUBE_META = {
  agent: 'The Analyst',
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
```

## `AnalystThinkingCube.tsx`

```tsx
/**
 * The Analyst — Thinking Cube
 * Swiss modern logic brought to life with pulsing brainwaves and thought-sparks.
 *
 * Dependencies: react, motion (motion/react), tailwindcss
 */
import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';

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

export function AnalystThinkingCubeCard({ size = 112 }: { size?: number }) {
  return (
    <div className="flex flex-col items-center text-center space-y-4">
      <div
        className="rounded-xl bg-stone-950 shadow-inner border border-stone-800/80 flex items-center justify-center overflow-hidden"
        style={{ width: size, height: size }}
      >
        <AnalystThinkingCube size={size} />
      </div>
      <div className="space-y-1">
        <h3 className="text-stone-100 font-semibold">{ANALYST_THINKING_CUBE_META.agent}</h3>
        <p className="text-stone-400 text-xs uppercase tracking-wider font-semibold">
          {ANALYST_THINKING_CUBE_META.name}
        </p>
        <p className="text-stone-500 text-sm leading-relaxed max-w-[220px]">
          {ANALYST_THINKING_CUBE_META.description}
        </p>
      </div>
    </div>
  );
}
```

