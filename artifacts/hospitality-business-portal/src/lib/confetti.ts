// @ts-expect-error — canvas-confetti ships no type declarations
import confetti from "canvas-confetti";

function getConfettiColors() {
  const s = getComputedStyle(document.documentElement);
  const get = (v: string) => {
    const raw = s.getPropertyValue(v).trim();
    if (!raw) return "hsl(0, 0%, 53%)";
    const parts = raw.split(/\s+/);
    if (parts.length >= 3) return `hsl(${parts[0]}, ${parts[1]}%, ${parts[2]}%)`;
    return raw;
  };
  return [get("--chart-1"), get("--chart-3"), get("--accent-pop"), get("--chart-3"), get("--chart-5")];
}

export function fireResearchConfetti() {
  const duration = 2500;
  const end = Date.now() + duration;

  const colors = getConfettiColors();

  (function frame() {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.7 },
      colors,
    });
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.7 },
      colors,
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  })();
}
