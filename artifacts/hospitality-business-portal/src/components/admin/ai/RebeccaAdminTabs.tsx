import { useState, useEffect } from "react";
import { CurrentThemeTab } from "@/components/ui/tabs";
import { IconSettings, IconAlertCircle, IconShield, IconTrendingUp, IconSparkles } from "@/components/icons";
import { motion } from "framer-motion";
import RebeccaConfigTab from "./RebeccaConfigTab";
import RebeccaFeedbackTab from "./RebeccaFeedbackTab";
import RebeccaAnalyticsTab from "./RebeccaAnalyticsTab";
import GuardrailEditor from "./GuardrailEditor";
import AgentPersonasTab from "../AgentPersonasTab";
import type { RebeccaConfigProps } from "./RebeccaConfigTab";

interface RebeccaAdminTabsProps {
  configProps: RebeccaConfigProps;
  initialTab?: string;
}

const REBECCA_TABS = [
  { value: "personas",      label: "AI Agents",     icon: IconSparkles },
  { value: "configuration", label: "Configuration", icon: IconSettings },
  { value: "guardrails",    label: "Guardrails",    icon: IconShield },
  { value: "feedback",      label: "Feedback",      icon: IconAlertCircle },
  { value: "analytics",     label: "Analytics",     icon: IconTrendingUp },
];

export default function RebeccaAdminTabs({ configProps, initialTab }: RebeccaAdminTabsProps) {
  const [activeTab, setActiveTab] = useState(initialTab || "configuration");

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="space-y-4"
      data-testid="rebecca-admin-tabs"
    >
      <CurrentThemeTab
        tabs={REBECCA_TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
      {activeTab === "personas"      && <AgentPersonasTab />}
      {activeTab === "configuration" && <RebeccaConfigTab {...configProps} />}
      {activeTab === "guardrails"    && <GuardrailEditor />}
      {activeTab === "feedback"      && <RebeccaFeedbackTab />}
      {activeTab === "analytics"     && <RebeccaAnalyticsTab />}
    </motion.div>
  );
}
