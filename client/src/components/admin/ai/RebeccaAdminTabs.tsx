import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { IconSettings, IconMessageCircle, IconAlertCircle } from "@/components/icons";
import { motion } from "framer-motion";
import RebeccaConfigTab from "./RebeccaConfigTab";
import RebeccaConversationsTab from "./RebeccaConversationsTab";
import RebeccaFeedbackTab from "./RebeccaFeedbackTab";
import type { RebeccaConfigProps } from "./RebeccaConfigTab";

interface RebeccaAdminTabsProps {
  configProps: RebeccaConfigProps;
}

export default function RebeccaAdminTabs({ configProps }: RebeccaAdminTabsProps) {
  const [activeTab, setActiveTab] = useState("configuration");

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-muted/40 border border-border/40" data-testid="rebecca-admin-tabs">
          <TabsTrigger value="configuration" className="gap-1.5 text-xs" data-testid="tab-configuration">
            <IconSettings className="w-3.5 h-3.5" />
            Configuration
          </TabsTrigger>
          <TabsTrigger value="conversations" className="gap-1.5 text-xs" data-testid="tab-conversations">
            <IconMessageCircle className="w-3.5 h-3.5" />
            Conversations
          </TabsTrigger>
          <TabsTrigger value="feedback" className="gap-1.5 text-xs" data-testid="tab-feedback">
            <IconAlertCircle className="w-3.5 h-3.5" />
            Feedback
          </TabsTrigger>
        </TabsList>

        <TabsContent value="configuration" className="mt-0">
          <RebeccaConfigTab {...configProps} />
        </TabsContent>

        <TabsContent value="conversations" className="mt-0">
          <RebeccaConversationsTab />
        </TabsContent>

        <TabsContent value="feedback" className="mt-0">
          <RebeccaFeedbackTab />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
