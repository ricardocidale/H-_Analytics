/**
 * spinner.tsx — Animated loading spinner.
 *
 * Wraps the Lucide Loader2 icon with a CSS spin animation.
 * Used as a loading indicator throughout the app.
 */
import { Loader2Icon } from "@/components/icons/themed-icons"

import { cn } from "@/lib/utils"

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2Icon
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
