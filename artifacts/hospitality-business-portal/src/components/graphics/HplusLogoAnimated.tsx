/**
 * HplusLogoAnimated.tsx — Framer Motion wrapper for the H+ Analytics logo mark.
 *
 * Renders the logo.png asset with a continuous float + soft pulse animation
 * when playing=true and the user has not requested reduced motion.
 * Falls back to a static <img> when playing=false or prefers-reduced-motion.
 *
 * Props:
 *   size        — width in px (height is auto). Default 80.
 *   playing     — false: static; true (default): float + pulse animation
 *   className   — forwarded to the motion wrapper
 *   decorative  — true (default): aria-hidden; false: role="img" + ariaLabel
 *   ariaLabel   — accessible label when decorative=false
 */
import { motion, useReducedMotion } from "framer-motion";
import logoSrc from "@/assets/logo.png";

interface HplusLogoAnimatedProps {
  size?: number;
  playing?: boolean;
  className?: string;
  decorative?: boolean;
  ariaLabel?: string;
}

export function HplusLogoAnimated({
  size = 80,
  playing = true,
  className = "",
  decorative = true,
  ariaLabel = "H+ Analytics",
}: HplusLogoAnimatedProps) {
  const prefersReducedMotion = useReducedMotion();
  const shouldAnimate = playing && !prefersReducedMotion;

  return (
    <motion.img
      src={logoSrc}
      alt={decorative ? "" : ariaLabel}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      style={{ width: size, height: "auto" }}
      className={className}
      animate={
        shouldAnimate
          ? {
              y: [0, -10, 0],
              opacity: [1, 0.82, 1],
            }
          : { y: 0, opacity: 1 }
      }
      transition={
        shouldAnimate
          ? {
              duration: 3.2,
              repeat: Infinity,
              ease: "easeInOut",
            }
          : { duration: 0 }
      }
    />
  );
}
