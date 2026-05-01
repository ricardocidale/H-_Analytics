import { useState } from "react";
import { cn } from "@/lib/utils";
import LogosTab from "./LogosTab";
import ThemesTab from "./ThemesTab";

type BrandSubTab = "logos" | "themes";

const SUB_TABS: { value: BrandSubTab; label: string }[] = [
  { value: "logos", label: "Logos" },
  { value: "themes", label: "Themes" },
];

export default function BrandTab() {
  const [activeTab, setActiveTab] = useState<BrandSubTab>("logos");

  return (
    <div data-testid="admin-brand-tab">
      <div className="flex items-center gap-1 border-b border-border mb-6">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            data-testid={`brand-subtab-${tab.value}`}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
              activeTab === tab.value
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div>
        {activeTab === "logos" && <LogosTab />}
        {activeTab === "themes" && <ThemesTab />}
      </div>
    </div>
  );
}
