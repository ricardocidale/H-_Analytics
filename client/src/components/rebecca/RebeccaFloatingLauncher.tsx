import { usePanelManager } from "@/lib/panel-manager";
import { IconMessageCircle } from "@/components/icons";
import { cn } from "@/lib/utils";

interface RebeccaFloatingLauncherProps {
  displayName?: string;
}

/**
 * Floating chat bubble pinned to the bottom-right corner.
 * Clicking it toggles the Claude-style Rebecca side panel.
 * Hidden while the panel is already open so the button doesn't overlap the sheet.
 */
export function RebeccaFloatingLauncher({ displayName = "Rebecca" }: RebeccaFloatingLauncherProps) {
  const { activePanel, openRebecca, closeAll } = usePanelManager();
  const isOpen = activePanel === "rebecca";

  if (isOpen) return null;

  return (
    <div
      className={cn(
        "fixed z-[60] bottom-[max(1rem,env(safe-area-inset-bottom))] right-4",
        "md:bottom-6 md:right-6",
        "h-14 w-14",
      )}
    >
      {/* Ambient pulse halo — sits behind the button, draws the eye without being noisy */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 rounded-full",
          "bg-primary/40 animate-ping",
        )}
      />
      <button
        type="button"
        onClick={() => (isOpen ? closeAll() : openRebecca())}
        title={`Ask ${displayName}`}
        aria-label={`Open ${displayName}`}
        data-testid="button-rebecca-launcher"
        className={cn(
          "group relative h-14 w-14 rounded-full",
          "bg-primary text-primary-foreground",
          "shadow-lg shadow-primary/30",
          "flex items-center justify-center",
          "transition-all duration-200 ease-out",
          // mouseover
          "hover:scale-110 hover:shadow-xl hover:shadow-primary/50 hover:bg-primary/90",
          // active (clicked) — tactile press
          "active:scale-95 active:shadow-md active:duration-75",
          // keyboard focus
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        )}
      >
        {/* Inner gloss ring on hover — adds a subtle "lit" feel */}
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 rounded-full",
            "ring-1 ring-inset ring-white/0 transition-all duration-200",
            "group-hover:ring-white/30",
          )}
        />
        <IconMessageCircle
          className={cn(
            "w-6 h-6 transition-transform duration-200",
            "group-hover:-rotate-12 group-hover:scale-110",
            "group-active:rotate-0 group-active:scale-95",
          )}
        />
      </button>
    </div>
  );
}
