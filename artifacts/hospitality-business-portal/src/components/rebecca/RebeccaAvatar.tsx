import { cn } from "@/lib/utils";

interface RebeccaAvatarProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function RebeccaAvatar({ size = "sm", className }: RebeccaAvatarProps) {
  const sizeClasses =
    size === "sm"
      ? "w-6 h-6 text-[10px]"
      : size === "md"
        ? "w-8 h-8 text-xs"
        : "w-12 h-12 text-base";

  return (
    <div
      className={cn(
        "rounded-full shrink-0 flex items-center justify-center font-bold select-none",
        "bg-primary text-primary-foreground",
        "shadow-sm shadow-primary/20",
        "ring-1 ring-border/20",
        sizeClasses,
        className,
      )}
      data-testid="rebecca-avatar"
      aria-hidden="true"
    >
      R
    </div>
  );
}
