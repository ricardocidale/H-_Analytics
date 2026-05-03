import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { IconAlertCircle, IconCheckCircle, IconAlertTriangle, IconEye } from "@/components/icons";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface Feedback {
  id: number;
  conversationId: number;
  userId: number;
  category: string;
  notes: string | null;
  conversationContext: Record<string, unknown> | null;
  status: string;
  createdAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof IconAlertCircle }> = {
  new: { label: "New", color: "bg-amber-500/10 text-amber-600 border-amber-500/20", icon: IconAlertTriangle },
  reviewed: { label: "Reviewed", color: "bg-blue-500/10 text-blue-600 border-blue-500/20", icon: IconEye },
  resolved: { label: "Resolved", color: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", icon: IconCheckCircle },
};

const CATEGORY_LABELS: Record<string, string> = {
  incorrect: "Incorrect Response",
  unhelpful: "Unhelpful",
  missing_data: "Missing Data",
  other: "Other",
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function FeedbackRow({ fb, onStatusChange }: { fb: Feedback; onStatusChange: (id: number, status: string) => void }) {
  const config = STATUS_CONFIG[fb.status] ?? STATUS_CONFIG.new;
  const StatusIcon = config.icon;

  return (
    <motion.div
      layout
      className="border border-border/50 rounded-lg p-4 space-y-3"
      data-testid={`feedback-row-${fb.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-accent-pop/10 flex items-center justify-center shrink-0">
            <IconAlertCircle className="w-4 h-4 text-accent-pop" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {CATEGORY_LABELS[fb.category] ?? fb.category}
              </Badge>
              <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 border", config.color)}>
                <StatusIcon className="w-3 h-3 mr-1" />
                {config.label}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              User #{fb.userId} · Conv #{fb.conversationId} · {formatDate(fb.createdAt)}
            </p>
          </div>
        </div>

        <Select
          value={fb.status}
          onValueChange={(v) => onStatusChange(fb.id, v)}
        >
          <SelectTrigger className="w-[130px] h-8 text-xs bg-card border-border/60" data-testid={`select-feedback-status-${fb.id}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="reviewed">Reviewed</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {fb.notes && (
        <div className="ml-11 p-3 bg-muted/30 rounded-lg">
          <p className="text-xs text-foreground/80 whitespace-pre-wrap">{fb.notes}</p>
        </div>
      )}
    </motion.div>
  );
}

export default function RebeccaFeedbackTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: allFeedback, isLoading } = useQuery<Feedback[]>({
    queryKey: ["rebecca-feedback"],
    queryFn: async () => {
      const res = await fetch("/api/rebecca/feedback", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const feedback = statusFilter === "all"
    ? allFeedback
    : allFeedback?.filter((f) => f.status === statusFilter);

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await fetch(`/api/rebecca/feedback/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rebecca-feedback"] });
      toast({ title: "Updated", description: "Feedback status changed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update feedback.", variant: "destructive" });
    },
  });

  const handleStatusChange = (id: number, status: string) => {
    updateStatusMutation.mutate({ id, status });
  };

  const counts = {
    all: allFeedback?.length ?? 0,
    new: allFeedback?.filter((f) => f.status === "new").length ?? 0,
    reviewed: allFeedback?.filter((f) => f.status === "reviewed").length ?? 0,
    resolved: allFeedback?.filter((f) => f.status === "resolved").length ?? 0,
  };

  return (
    <Card className="bg-card border border-border/80 shadow-sm" data-testid="rebecca-feedback-tab">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent-pop/10 flex items-center justify-center">
            <IconAlertCircle className="w-5 h-5 text-accent-pop" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-sm font-semibold text-foreground">Feedback Reports</CardTitle>
            <CardDescription className="label-text mt-0.5">
              User-submitted feedback on Rebecca responses — track and resolve issues.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          {(["all", "new", "reviewed", "resolved"] as const).map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs capitalize"
              onClick={() => setStatusFilter(s)}
              data-testid={`button-filter-${s}`}
            >
              {s}
              <Badge variant="secondary" className="ml-1.5 text-[10px] px-1 py-0 min-w-[18px]">
                {counts[s as keyof typeof counts]}
              </Badge>
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : (feedback ?? []).length === 0 ? (
          <div className="py-12 text-center">
            <IconCheckCircle className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">
              {statusFilter === "all" ? "No feedback submitted yet." : `No ${statusFilter} feedback.`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {(feedback ?? []).map((fb) => (
              <FeedbackRow key={fb.id} fb={fb} onStatusChange={handleStatusChange} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
