import { usePanelManager } from "@/lib/panel-manager";
import { RebeccaAvatar } from "./RebeccaAvatar";
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
    <button
      type="button"
      onClick={() => (isOpen ? closeAll() : openRebecca())}
      title={`Ask ${displayName}`}
      aria-label={`Open ${displayName}`}
      data-testid="button-rebecca-launcher"
      className={cn(
        "fixed z-[60] bottom-[max(1rem,env(safe-area-inset-bottom))] right-4",
        "md:bottom-6 md:right-6",
        "h-14 w-14 rounded-full",
        "bg-card border border-border shadow-lg hover:shadow-xl",
        "flex items-center justify-center",
        "transition-all duration-200 hover:scale-105",
        "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
      )}
    >
      <RebeccaAvatar size="md" />
    </button>
  );
}
