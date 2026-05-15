import { Button } from "@/components/ui/button";
import { IconAlertTriangle } from "@/components/icons";

interface FactoryErrorPillProps {
  message: string;
  detail?: string;
  action?: { label: string; onClick: () => void };
}

export function FactoryErrorPill({ message, detail, action }: FactoryErrorPillProps) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: "24px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 50,
      }}
      title={detail}
    >
      <div className="flex items-center gap-2.5 bg-background border rounded-lg shadow-lg px-4 py-2.5 text-sm whitespace-nowrap">
        <IconAlertTriangle className="w-4 h-4 text-destructive shrink-0" />
        <span className="text-foreground">{message}</span>
        {action && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 ml-1"
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        )}
      </div>
    </div>
  );
}
