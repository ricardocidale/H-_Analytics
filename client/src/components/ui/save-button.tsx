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
  children = "Save",
  className,
  type = "button",
  size,
  "data-testid": testId = "button-save-changes",
}: SaveButtonProps) {
  const isDisabled = disabled || isPending || !hasChanges;

  return (
    <Button
      onClick={onClick}
      disabled={isDisabled}
      variant="default"
      type={type}
      size={size}
      className={cn(
        "transition-opacity",
        !hasChanges && !isPending && "opacity-50",
        className,
      )}
      data-testid={testId}
    >
      {isPending ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <IconSave className="w-4 h-4" />
      )}
      {children}
    </Button>
  );
}
