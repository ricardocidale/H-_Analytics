import { SectionCard } from "@/components/ui/section-card";
import { ManualTable } from "@/components/ui/manual-table";

import { IconActivity } from "@/components/icons";interface SectionProps {
  expanded: boolean;
  onToggle: () => void;
  sectionRef: (el: HTMLDivElement | null) => void;
}

export default function Section01GettingStarted({ expanded, onToggle, sectionRef }: SectionProps) {
  return (
    <SectionCard
      id="getting-started"
      title="1. Getting Started"
      icon={IconActivity}
      variant="light"
      expanded={expanded}
      onToggle={onToggle}
      sectionRef={sectionRef}
    >
      <p className="text-sm text-muted-foreground">
        H+ Analytics is a financial simulation platform for boutique hotel investments.
        It generates multi-year projections, financial statements, and investment return analysis for a portfolio of hospitality properties.
      </p>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Logging In</h4>
        <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-5">
          <li>Navigate to the portal URL and enter your username and password.</li>
          <li>If you forget your password, contact the Administrator to have it reset.</li>
          <li>After logging in, you will be taken to the Dashboard.</li>
        </ul>
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">User Roles</h4>
        <ManualTable
          variant="light"
          headers={["Role", "Access Level"]}
          rows={[
            ["Admin", "Full access to all features including user management, verification, and system configuration"],
            ["User", "Access to all financial tools, properties, management company, scenarios, and exports"],
            ["Checker", "User access plus access to the verification engine and Checker Manual"],
            ["Investor", "View-only access to Dashboard, Properties, Profile, and Help"],
          ]}
        />
      </div>
    </SectionCard>
  );
}
