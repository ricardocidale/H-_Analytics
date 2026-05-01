import { SectionCard } from "@/components/ui/section-card";
  import { ManualTable } from "@/components/ui/manual-table";
  import { Callout } from "@/components/ui/callout";
  import { IconScenarios } from "@/components/icons";interface SectionProps {
    expanded: boolean;
    onToggle: () => void;
    sectionRef: (el: HTMLDivElement | null) => void;
  }

  export default function Section10ScenarioMgmt({ expanded, onToggle, sectionRef }: SectionProps) {
    return (
      <SectionCard
        id="scenario-mgmt"
        title="10. Scenario Management"
        icon={IconScenarios}
        expanded={expanded}
        onToggle={onToggle}
        sectionRef={sectionRef}
      >
        <ManualTable
          headers={["Action", "Description", "Effect"]}
          rows={[
            ["Save", "Snapshot current assumptions + properties", "Creates named copy"],
            ["Load", "Restore saved scenario", "Replaces current state"],
            ["Save", "Modify scenario name/description", "Metadata only"],
            ["Delete", "Remove scenario permanently", "Cannot be undone"],
          ]}
        />
        <Callout>Save a baseline scenario before any testing. Create separate test scenarios for each verification round.</Callout>

        <div className="bg-muted/50 rounded-lg p-4 mt-4">
          <h4 className="font-semibold mb-2">Scenario Governance</h4>
          <p className="text-sm text-muted-foreground mb-3">
            Administrators have full control over all scenarios across the platform.
          </p>
          <ManualTable
            headers={["Capability", "Description"]}
            rows={[
              ["View all scenarios", "See every scenario across all users with owner info, property count, and access grants"],
              ["Create for any user", "Create a scenario on behalf of any user — it becomes owned by that user"],
              ["Edit any scenario", "Update name and description of any scenario regardless of ownership"],
              ["Delete any scenario", "Remove any scenario and its access grants permanently"],
              ["Assign access", "Grant scenario visibility to user groups, companies, or individual users"],
              ["Revoke access", "Remove access grants at any time"],
            ]}
          />
        </div>

        <div className="bg-muted/50 rounded-lg p-4 mt-4">
          <h4 className="font-semibold mb-2">Sharing Model</h4>
          <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-5">
            <li>Admins can share scenarios with <strong>user groups</strong>, <strong>companies</strong>, or <strong>individual users</strong>.</li>
            <li>Users who belong to a group or company with access will see shared scenarios as read-only.</li>
            <li>Deleting a user cascades to remove their owned scenarios and all associated access grants.</li>
            <li>Admin access bypasses the per-user <strong>canManageScenarios</strong> flag.</li>
          </ul>
        </div>
      </SectionCard>
    );
  }
