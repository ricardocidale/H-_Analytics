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