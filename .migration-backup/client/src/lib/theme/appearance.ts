export type ColorMode = "light" | "auto" | "dark";
export type BgAnimation = "enabled" | "auto" | "disabled";
export type FontPreference = "default" | "sans" | "system" | "dyslexic";

const FONT_FAMILIES: Record<FontPreference, string> = {
  default: "'Inter', sans-serif",
  sans: "'DM Sans', 'Inter', sans-serif",
  system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  dyslexic: "'OpenDyslexic', 'Comic Sans MS', sans-serif",
};

export function applyColorMode(mode: ColorMode) {
  const root = document.documentElement;
  if (mode === "dark") {
    root.classList.add("dark");
  } else if (mode === "light") {
    root.classList.remove("dark");
  } else {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.toggle("dark", prefersDark);
  }
}

export function applyFont(font: FontPreference) {
  document.documentElement.style.setProperty("--font-family", FONT_FAMILIES[font]);
}

export interface AppearanceDefaults {
  defaultColorMode?: ColorMode | null;
  defaultBgAnimation?: BgAnimation | null;
  defaultFontPreference?: FontPreference | null;
}

export function resolveColorMode(mode: ColorMode | null | undefined, orgDefault?: ColorMode | null): ColorMode {
  return mode ?? orgDefault ?? "light";
}

export function resolveBgAnimation(mode: BgAnimation | null | undefined, orgDefault?: BgAnimation | null): BgAnimation {
  return mode ?? orgDefault ?? "auto";
}

export function applyBgAnimation(mode: BgAnimation) {
  const resolved = mode === "auto"
    ? (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "disabled" : "enabled")
    : mode;
  document.documentElement.dataset.bgAnimation = resolved;
}

export function resolveFontPreference(pref: FontPreference | null | undefined, orgDefault?: FontPreference | null): FontPreference {
  return pref ?? orgDefault ?? "default";
}

let osMediaQuery: MediaQueryList | null = null;
let osListener: ((e: MediaQueryListEvent) => void) | null = null;

export function startOsColorModeListener(currentMode: ColorMode) {
  stopOsColorModeListener();
  if (currentMode !== "auto") return;

  osMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  osListener = (e) => {
    document.documentElement.classList.toggle("dark", e.matches);
  };
  osMediaQuery.addEventListener("change", osListener);
}

export function stopOsColorModeListener() {
  if (osMediaQuery && osListener) {
    osMediaQuery.removeEventListener("change", osListener);
  }
  osMediaQuery = null;
  osListener = null;
}
