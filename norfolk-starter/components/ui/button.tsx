import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-interactive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "motion-safe-hover-lift motion-safe-active-press bg-primary text-primary-foreground shadow-sm hover:bg-primary/88 hover:shadow-md dark:hover:shadow-[0_0_24px_-4px_oklch(0.72_0.17_160_/0.35)]",
        destructive:
          "motion-safe-hover-lift motion-safe-active-press bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/88 hover:shadow-md",
        outline:
          "motion-safe-hover-lift motion-safe-active-press border border-input bg-background shadow-sm hover:border-primary/35 hover:bg-accent/50 hover:text-accent-foreground hover:shadow-md",
        secondary:
          "motion-safe-hover-lift motion-safe-active-press bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/75 hover:shadow-md",
        ghost:
          "motion-safe-active-press shadow-none hover:bg-accent/70 hover:text-accent-foreground hover:shadow-sm dark:hover:bg-accent/40",
        link: "text-primary underline-offset-4 shadow-none hover:underline hover:text-primary/85 active:opacity-75",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
