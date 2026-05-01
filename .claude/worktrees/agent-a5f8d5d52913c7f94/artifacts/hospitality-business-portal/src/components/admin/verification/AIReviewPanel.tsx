import { Loader2 } from "@/components/icons/themed-icons";
import { IconSparkles } from "@/components/icons";
import { Button } from "@/components/ui/button";

interface AIReviewPanelProps {
  review: string;
  loading: boolean;
  onRun: () => void;
}

export function AIReviewPanel({ review, loading, onRun }: AIReviewPanelProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b pb-2">
        <h3 className="text-lg font-bold text-foreground">AI Financial Narrative Review</h3>
        <Button
          onClick={onRun}
          disabled={loading}
          variant="ghost"
          size="sm"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <IconSparkles className="w-3.5 h-3.5 mr-1.5" />}
          Refresh AI Review
        </Button>
      </div>
      
      {loading && !review && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-secondary" />
          <p className="text-sm font-medium animate-pulse">Analyzing verification results and generating narrative...</p>
        </div>
      )}

      {review && (
        <div className="p-6 rounded-xl bg-secondary/5 border border-secondary/10 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <IconSparkles className="w-12 h-12 text-secondary" />
          </div>
          <div className="prose prose-sm max-w-none text-foreground leading-relaxed whitespace-pre-wrap font-serif italic text-lg">
            {review}
          </div>
        </div>
      )}

      {!review && !loading && (
        <div className="text-center py-12 bg-muted rounded-xl border-2 border-dashed border-border">
          <p className="text-sm text-muted-foreground">Run the AI review to generate a narrative analysis of the verification findings.</p>
          <Button 
            onClick={onRun}
            className="mt-4"
            size="sm"
          >
            <IconSparkles className="w-3.5 h-3.5 mr-1.5" />
            Start Analysis
          </Button>
        </div>
      )}
    </div>
  );
}
