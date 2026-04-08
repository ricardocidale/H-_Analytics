import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IconMessageSquare } from "@/components/icons";

export default function ConversationsTab() {
  return (
    <div data-testid="conversations-tab">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <IconMessageSquare className="w-4 h-4" />
            Conversation History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <IconMessageSquare className="w-6 h-6 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-semibold text-foreground mb-1">Conversation Analytics</h3>
            <p className="text-xs text-muted-foreground max-w-sm">
              View Rebecca's conversation history, user satisfaction ratings, and feedback across all users. Analytics and filtering coming soon.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
