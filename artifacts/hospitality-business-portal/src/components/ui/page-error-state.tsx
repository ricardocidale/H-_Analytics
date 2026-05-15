import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { IconAlertTriangle } from "@/components/icons";

interface PageErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function PageErrorState({ message, onRetry }: PageErrorStateProps) {
  return (
    <Layout>
      <div
        style={{
          position: "fixed",
          bottom: "24px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 50,
        }}
      >
        <div className="flex items-center gap-2.5 bg-background border rounded-lg shadow-lg px-4 py-2.5 text-sm whitespace-nowrap">
          <IconAlertTriangle className="w-4 h-4 text-destructive shrink-0" />
          <span className="text-foreground">
            {message ?? "Couldn't load this page"}
          </span>
          {onRetry && (
            <Button variant="ghost" size="sm" className="h-6 px-2 ml-1" onClick={onRetry}>
              Retry
            </Button>
          )}
        </div>
      </div>
    </Layout>
  );
}
