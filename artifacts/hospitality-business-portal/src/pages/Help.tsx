import { useCallback } from "react";
import Layout from "@/components/Layout";
import { PageHeader } from "@/components/ui/page-header";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { IconFileCheck, IconActivity } from "@/components/icons";
import { Share2 } from "@/components/icons/themed-icons";
import { useAuth } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import UserManual from "./user-manual";
import DiagramsTab from "@/components/admin/DiagramsTab";
import { useWalkthroughStore } from "@/components/GuidedWalkthrough";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AnimatedPage } from "@/components/graphics/AnimatedPage";

export default function Help() {
  const { isAdmin } = useAuth();
  const { triggerPrompt } = useWalkthroughStore();
  const queryClient = useQueryClient();

  const handleStartTour = useCallback(async () => {
    await fetch("/api/profile/tour-prompt", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hide: false }),
      credentials: "include",
    });
    queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    triggerPrompt();
  }, [queryClient, triggerPrompt]);

  const items = [
    {
      id: "user-manual",
      summary: (
        <span className="flex items-center gap-2">
          <IconFileCheck className="w-4 h-4 shrink-0" />
          User Manual
        </span>
      ),
      expandedContent: <UserManual embedded />,
    },
    ...(isAdmin
      ? [
          {
            id: "architecture",
            summary: (
              <span className="flex items-center gap-2">
                <Share2 className="w-4 h-4 shrink-0" />
                Architecture
              </span>
            ),
            expandedContent: <DiagramsTab />,
          },
        ]
      : []),
    {
      id: "guided-tour",
      summary: (
        <span className="flex items-center gap-2">
          <IconActivity className="w-4 h-4 shrink-0" />
          Guided Tour
        </span>
      ),
      expandedContent: (
        <Card className="bg-card border-border shadow-sm rounded-lg">
          <div className="p-8 text-center space-y-6">
            <div className="w-16 h-16 rounded-lg bg-primary/15 flex items-center justify-center mx-auto">
              <IconActivity className="w-8 h-8 text-primary" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-display font-semibold">Interactive Guided Tour</h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                Walk through the key features of the application step by step. The tour highlights
                navigation, tools, and important areas of the interface.
              </p>
            </div>
            <Button
              variant="default"
              onClick={handleStartTour}
              data-testid="button-start-guided-tour"
            >
              <IconActivity className="w-4 h-4" />
              Start Guided Tour
            </Button>
          </div>
        </Card>
      ),
    },
  ];

  return (
    <AnimatedPage>
      <Layout>
        <div className="space-y-6">
          <PageHeader
            title="Help"
            subtitle="Documentation, verification guides, and interactive tours"
            variant="dark"
          />

          <CollapsibleSection defaultOpenId="user-manual" items={items} />
        </div>
      </Layout>
    </AnimatedPage>
  );
}
