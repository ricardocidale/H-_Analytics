/**
 * AnalystCubeIcon.tsx — Animated 3-D Rubik's-style cube logo alternative for H+ Analytics.
 *
 * A 27-cubie Rubik's cube rendered in CSS 3D with Framer Motion animation.
 * Swiss modernist monochrome palette matches the app's neutral stone-gray design.
 *
 * Props:
 *   size        — outer container + cube geometry scale (default 64 px)
 *   className   — forwarded to the outer wrapper div
 *   decorative  — true (default): aria-hidden; false: role="img" + ariaLabel
 *   ariaLabel   — label used when decorative=false (default "H+ Analytics")
 *   playing     — false: suppress all animation (overrides useReducedMotion);
 *                 true (default): animate normally unless OS prefers reduced motion
 *
 * Animation layers (all loop infinitely, paused when playing=false or prefers-reduced-motion):
 *   • Outer wrapper — slow Y-axis rotation (15 s, linear) with fixed X tilt
 *   • Each cubie orbit div — periodic tumble on X/Y/Z axes (6 s, backInOut)
 *   • Each cubie position div — periodic expansion and snap-back (6 s, easeInOut)
 */
import { motion, useReducedMotion } from "framer-motion";

const FACE_DEFS: { dir: string; bg: string }[] = [
  { dir: "rotateY(0deg)",    bg: "#f5f5f4" },
  { dir: "rotateY(90deg)",   bg: "#d6d3d1" },
  { dir: "rotateY(180deg)",  bg: "#a8a29e" },
  { dir: "rotateY(-90deg)",  bg: "#78716c" },
  { dir: "rotateX(90deg)",   bg: "#e7e5e4" },
  { dir: "rotateX(-90deg)",  bg: "#44403c" },
];

const BASE_SIZE   = 64;
const BASE_CUBIE  = 14;
const BASE_GAP    = 1;

const ORBIT_TIMES = [0, 0.12, 0.24, 0.36, 0.48, 0.60, 0.72, 0.84, 0.96, 1];
const POS_TIMES   = [0, 0.12, 0.24, 0.36, 0.48, 0.60, 0.72, 0.84, 1];

interface AnalystCubeIconProps {
  size?: number;
  className?: string;
  decorative?: boolean;
  ariaLabel?: string;
  /** When false, all animation is suppressed regardless of useReducedMotion. Default true. */
  playing?: boolean;
}

export function AnalystCubeIcon({
  size = 64,
  className = "",
  decorative = true,
  ariaLabel = "H+ Analytics",
  playing = true,
}: AnalystCubeIconProps) {
  const prefersReducedMotion = useReducedMotion();

  const suppressMotion = prefersReducedMotion || !playing;

  const scale      = size / BASE_SIZE;
  const cubieSize  = Math.max(4, Math.round(BASE_CUBIE * scale));
  const gap        = Math.max(1, Math.round(BASE_GAP  * scale));
  const offset     = cubieSize + gap;
  const halfCubie  = cubieSize / 2;

  const spinAnimate    = suppressMotion ? {} : { rotateY: [0, 360] };
  const spinTransition = suppressMotion
    ? { duration: 0 }
    : { duration: 15, repeat: Infinity, ease: "linear" as const };

  return (
    <div
      className={`relative flex items-center justify-center ${className}`}
      style={{ width: size, height: size, perspective: `${size * 15.6}px` }}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : ariaLabel}
      aria-hidden={decorative ? true : undefined}
    >
      <motion.div
        className="relative z-10 flex items-center justify-center"
        style={{
          width: cubieSize,
          height: cubieSize,
          transformStyle: "preserve-3d",
          rotateX: -25,
        }}
        animate={spinAnimate}
        transition={spinTransition}
      >
        {([-1, 0, 1] as const).map((x) =>
          ([-1, 0, 1] as const).map((y) =>
            ([-1, 0, 1] as const).map((z) => (
              <motion.div
                key={`orbit-${x}-${y}-${z}`}
                className="absolute inset-0 flex items-center justify-center"
                style={{ transformStyle: "preserve-3d" }}
                animate={
                  suppressMotion
                    ? {}
                    : {
                        rotateX: [0,  x * 90,  x * 90,  0,       0,       0,       x * -90, x * -90, 0, 0],
                        rotateY: [0,  0,       y * 90,  y * 90,  y * 90,  0,       0,       y * -90, 0, 0],
                        rotateZ: [0,  0,       0,       0,       z * 90,  z * 90,  0,       0,       0, 0],
                      }
                }
                transition={{
                  duration: 6,
                  repeat: Infinity,
                  ease: "backInOut",
                  times: ORBIT_TIMES,
                }}
              >
                <motion.div
                  className="absolute"
                  style={{
                    width: cubieSize,
                    height: cubieSize,
                    transformStyle: "preserve-3d",
                  }}
                  animate={
                    suppressMotion
                      ? { x: x * offset, y: y * offset, z: z * offset }
                      : {
                          x: [x * offset, x * offset * 1.3, x * offset, x * offset, x * offset * 1.6, x * offset, x * offset, x * offset * 1.2, x * offset],
                          y: [y * offset, y * offset * 1.3, y * offset, y * offset, y * offset * 1.6, y * offset, y * offset, y * offset * 1.2, y * offset],
                          z: [z * offset, z * offset * 1.3, z * offset, z * offset, z * offset * 1.6, z * offset, z * offset, z * offset * 1.2, z * offset],
                        }
                  }
                  transition={{
                    duration: 6,
                    repeat: Infinity,
                    ease: "easeInOut",
                    times: POS_TIMES,
                  }}
                >
                  {FACE_DEFS.map((face, i) => (
                    <div
                      key={i}
                      className="absolute inset-0 border-[1.5px] border-black"
                      style={{
                        backgroundColor: face.bg,
                        transform: `${face.dir} translateZ(${halfCubie}px)`,
                        backfaceVisibility: "hidden",
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
  );
}
