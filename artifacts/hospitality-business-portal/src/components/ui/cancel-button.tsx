import * as React from "react";
import { Button } from "@/components/ui/button";

export interface CancelButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: React.ComponentProps<typeof Button>["size"];
  "data-testid"?: string;
}

/**
 * CancelButton — canonical secondary action button for cancel/discard actions.
 *
 * Uses `variant="outline"` so it reads as a clearly visible secondary action
 * paired next to a filled Save button, rather than unstyled ghost text.
 * Wrapping in a dedicated component keeps the Cancel contract auditable
 * (like SaveButton) and avoids hunting down every ghost-Cancel call site
 * when the design needs to change.
 */
export const CancelButton = React.forwardRef<HTMLButtonElement, CancelButtonProps>(
  ({ children = "Cancel", size, "data-testid": testId, ...props }, ref) => {
    return (
      <Button
        ref={ref}
        variant="outline"
        size={size}
        data-testid={testId}
        {...props}
      >
        {children}
      </Button>
    );
  },
);
CancelButton.displayName = "CancelButton";
