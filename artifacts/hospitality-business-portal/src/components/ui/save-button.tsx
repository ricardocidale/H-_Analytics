import * as React from "react";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconSave } from "@/components/icons";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface SaveButtonProps {
  onClick?: () => void;
  disabled?: boolean;
  isPending?: boolean;
  hasChanges?: boolean;
  /**
   * When true, the button stays fully opaque and clickable even when
   * `hasChanges` is false. Use on pages where the admin must be able to
   * (re-)endorse the displayed values without making any edits — currently
   * the Company Assumptions tabs and the admin Model Defaults header. On
   * pages where saving with no changes has destructive side effects (e.g.
   * `PropertyEdit` navigates away on save), leave this off so the button
   * disables and dims when clean.
   */
  alwaysActive?: boolean;
  children?: React.ReactNode;
  className?: string;
  type?: "button" | "submit" | "reset";
  size?: "default" | "sm" | "lg" | "icon";
  "data-testid"?: string;
}

export function SaveButton({
  onClick,
  disabled = false,
  isPending = false,
  hasChanges = true,
  alwaysActive = false,
  children = "Save",
  className,
  type = "button",
  size,
  "data-testid": testId = "button-save-changes",
}: SaveButtonProps) {
  const isDisabled =
    disabled || isPending || (!alwaysActive && !hasChanges);
  const dimWhenClean = !alwaysActive && !hasChanges && !isPending;

  return (
    <Button
      onClick={onClick}
      disabled={isDisabled}
      variant="default"
      type={type}
      size={size}
      className={cn(
        "transition-opacity",
        dimWhenClean && "opacity-50",
        className,
      )}
      data-testid={testId}
    >
      {isPending ? (
        // Spinner sits on `bg-primary` (sage) / dark variant fills, where the
        // amber `text-accent-pop` only hits ~1.7:1 contrast and dips to ~1.2:1
        // on the dark theme's lighter primary. `text-white` matches the button
        // foreground and clears WCAG 3:1 for non-text UI on every theme.
        <Loader2 className="w-4 h-4 animate-spin text-white" />
      ) : (
        <IconSave className="w-4 h-4" />
      )}
      {children}
    </Button>
  );
}
