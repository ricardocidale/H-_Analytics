import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

function OrbitalDots({ className, size = 32 }: { className?: string; size?: number }) {
  const dotCount = 5;
  const radius = size * 0.38;
  const dotSize = Math.max(3, size * 0.1);

  return (
    <div className={cn("relative", className)} style={{ width: size, height: size }}>
      {Array.from({ length: dotCount }).map((_, i) => {
        const baseAngle = (i / dotCount) * 360;
        return (
          <motion.div
            key={i}
            className="absolute rounded-full bg-primary"
            style={{
              width: dotSize,
              height: dotSize,
              left: size / 2 - dotSize / 2,
              top: size / 2 - dotSize / 2,
            }}
            animate={{
              x: [
                Math.cos((baseAngle * Math.PI) / 180) * radius,
                Math.cos(((baseAngle + 360) * Math.PI) / 180) * radius,
              ],
              y: [
                Math.sin((baseAngle * Math.PI) / 180) * radius,
                Math.sin(((baseAngle + 360) * Math.PI) / 180) * radius,
              ],
              scale: [0.6, 1, 0.6],
              opacity: [0.3, 1, 0.3],
            }}
            transition={{
              duration: 2.4,
              repeat: Infinity,
              ease: "linear",
              delay: i * (2.4 / dotCount),
              scale: { duration: 1.2, repeat: Infinity, ease: "easeInOut", delay: i * 0.2 },
              opacity: { duration: 1.2, repeat: Infinity, ease: "easeInOut", delay: i * 0.2 },
            }}
          />
        );
      })}
      <motion.div
        className="absolute rounded-full bg-primary/20"
        style={{
          width: dotSize * 2,
          height: dotSize * 2,
          left: size / 2 - dotSize,
          top: size / 2 - dotSize,
        }}
        animate={{ scale: [1, 1.5, 1], opacity: [0.4, 0.1, 0.4] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

function NeuralGlow({ className, size = 40 }: { className?: string; size?: number }) {
  return (
    <div className={cn("relative", className)} style={{ width: size, height: size }}>
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: "conic-gradient(from 0deg, hsl(var(--primary) / 0), hsl(var(--primary) / 0.6), hsl(var(--primary) / 0))",
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="absolute rounded-full bg-primary/10"
        style={{ inset: size * 0.08 }}
        animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.2, 0.5] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      />
      <div
        className="absolute rounded-full bg-card"
        style={{ inset: size * 0.15 }}
      />
      <motion.div
        className="absolute rounded-full bg-primary/30"
        style={{ inset: size * 0.3 }}
        animate={{ scale: [0.9, 1.1, 0.9] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

function StreamPulse({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-[3px]", className)}>
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.div
          key={i}
          className="w-[3px] rounded-full bg-primary"
          animate={{
            height: [4, 16, 8, 14, 4],
            opacity: [0.4, 1, 0.6, 0.9, 0.4],
          }}
          transition={{
            duration: 1.4,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.12,
          }}
        />
      ))}
    </div>
  );
}

function BreathingDots({ className, count = 3 }: { className?: string; count?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <motion.span
          key={i}
          className="block w-1.5 h-1.5 rounded-full bg-primary"
          animate={{
            scale: [0.5, 1, 0.5],
            opacity: [0.3, 1, 0.3],
          }}
          transition={{
            duration: 1.4,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.2,
          }}
        />
      ))}
    </span>
  );
}

function ThinkingRing({ className, size = 20 }: { className?: string; size?: number }) {
  const strokeWidth = Math.max(2, size * 0.1);
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn("", className)}
      animate={{ rotate: 360 }}
      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="hsl(var(--primary) / 0.15)"
        strokeWidth={strokeWidth}
      />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        animate={{
          strokeDashoffset: [circumference, circumference * 0.25, circumference],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        style={{ transformOrigin: "center" }}
      />
    </motion.svg>
  );
}

function DataFlowDots({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-primary"
          animate={{
            y: [0, -6, 0],
            opacity: [0.2, 1, 0.2],
            scale: [0.8, 1.2, 0.8],
          }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.15,
          }}
        />
      ))}
    </div>
  );
}

export { OrbitalDots, NeuralGlow, StreamPulse, BreathingDots, ThinkingRing, DataFlowDots };
