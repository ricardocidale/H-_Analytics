/**
 * callout.tsx — Alert-style callout box with severity-based styling.
 *
 * Renders a prominent message box with an icon and colored background:
 *   • info     — blue, informational notes
 *   • success  — green, positive confirmations
 *   • warning  — amber, attention-needed items
 *   • critical — red, errors or compliance failures
 *
 * Supports dark and light variants. Used for GAAP compliance warnings,
 * validation messages, and cash flow alerts.
 */
import { IconAlertTriangle, IconShieldAlert, IconInfo, IconCheckCircle } from "@/components/icons";
import { cn } from "@/lib/utils";

type Severity = "warning" | "critical" | "info" | "success";
type Variant = "dark" | "light";

const severityConfig: Record<
  Severity,
  Record<Variant, { bg: string; border: string; text: string }> & { icon: React.ComponentType<{ className?: string }> }
> = {
  warning: {
    icon: IconAlertTriangle,
    light: { bg: "bg-accent-pop/10", border: "border-accent-pop/20", text: "text-accent-pop" },
    dark: { bg: "bg-accent-pop/10", border: "border-accent-pop/20", text: "text-accent-pop/90" },
  },
  critical: {
    icon: IconShieldAlert,
    light: { bg: "bg-destructive/10", border: "border-destructive/20", text: "text-destructive" },
    dark: { bg: "bg-destructive/10", border: "border-destructive/20", text: "text-destructive/90" },
  },
  info: {
    icon: IconInfo,
    light: { bg: "bg-chart-1/10", border: "border-chart-1/20", text: "text-chart-1" },
    dark: { bg: "bg-chart-1/10", border: "border-chart-1/20", text: "text-chart-1/90" },
  },
  success: {
    icon: IconCheckCircle,
    light: { bg: "bg-primary/10", border: "border-primary/20", text: "text-primary" },
    dark: { bg: "bg-primary/10", border: "border-primary/20", text: "text-primary/90" },
  },
};

interface CalloutProps {
  children: React.ReactNode;
  severity?: Severity;
  variant?: Variant;
  icon?: React.ComponentType<{ className?: string }>;
  title?: string;
}

export function Callout({
  children,
  severity = "warning",
  variant = "dark",
  icon,
  title,
}: CalloutProps) {
  const entry = severityConfig[severity];
  const colors = entry[variant] as { bg: string; border: string; text: string };
  const IconComponent = icon ?? entry.icon;

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-4 rounded-xl border",
        colors.bg,
        colors.border,
      )}
    >
      <IconComponent
        className={cn("w-5 h-5 flex-shrink-0 mt-0.5", colors.text)}
      />
      <div className={cn("text-sm font-medium", colors.text)}>
        {title && <p className="font-semibold mb-1">{title}</p>}
        {typeof children === "string" ? <p>{children}</p> : children}
      </div>
    </div>
  );
}
