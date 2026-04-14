import { SectionCard } from "@/components/ui/section-card";
import { Callout } from "@/components/ui/callout";
import { IconScenarios } from "@/components/icons";interface SectionProps {
  expanded: boolean;
  onToggle: () => void;
  sectionRef: (el: HTMLDivElement | null) => void;
}

export default function Section09Scenarios({ expanded, onToggle, sectionRef }: SectionProps) {
  return (
    <SectionCard
      id="scenarios"
      title="9. Scenarios"
      icon={IconScenarios}
      variant="light"
      expanded={expanded}
      onToggle={onToggle}
      sectionRef={sectionRef}
    >
      <p className="text-sm text-muted-foreground">
        Scenarios let you save and load different sets of assumptions to compare "what if" situations.
      </p>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Saving a Scenario</h4>
        <ul className="text-sm text-muted-foreground space-y-2">
          <li>&#8226; Go to the <strong>Scenarios</strong> page from the sidebar.</li>
          <li>&#8226; Click <strong>"Save Current Scenario"</strong>.</li>
          <li>&#8226; Give it a descriptive name (e.g., "Base Case", "Conservative", "Aggressive Growth").</li>
          <li>&#8226; All current systemwide and property-level assumptions are captured in the snapshot.</li>
        </ul>
      </div>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Loading a Scenario</h4>
        <ul className="text-sm text-muted-foreground space-y-2">
          <li>&#8226; Select a previously saved scenario from the list.</li>
          <li>&#8226; Click <strong>"Load"</strong> to restore all assumptions from that snapshot.</li>
          <li>&#8226; The entire portfolio recalculates with the loaded assumptions.</li>
        </ul>
      </div>

      <Callout variant="light">
        Loading a scenario replaces all current assumptions. Save your current work before loading a different scenario.
      </Callout>

      <div className="bg-muted/50 rounded-lg p-4 mt-4">
        <h4 className="font-semibold mb-2">Shared Scenarios</h4>
        <p className="text-sm text-muted-foreground mb-2">
          Administrators can share scenarios with user groups, companies, or individual users.
        </p>
        <ul className="text-sm text-muted-foreground space-y-2">
          <li>&#8226; If your group or company has been granted access to a scenario, it appears on your Scenarios page as a shared scenario.</li>
          <li>&#8226; Shared scenarios are <strong>read-only</strong> unless you are the owner.</li>
          <li>&#8226; When your group or company assignment changes, your visible shared scenarios update automatically.</li>
          <li>&#8226; Scenario access is managed by your administrator. Contact them to request changes.</li>
        </ul>
      </div>

      <div className="bg-muted/50 rounded-lg p-4 mt-4">
        <h4 className="font-semibold mb-2">Scenario Tags</h4>
        <p className="text-sm text-muted-foreground mb-2">
          Tag scenarios to organize and filter them in the list view. Common tags include:
        </p>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>&#8226; <strong>base_case</strong> — The primary operating scenario with expected assumptions</li>
          <li>&#8226; <strong>bull_case</strong> — Optimistic scenario with favorable market conditions</li>
          <li>&#8226; <strong>bear_case</strong> — Conservative scenario with adverse conditions</li>
          <li>&#8226; <strong>stress_test</strong> — Extreme downside scenario for risk assessment</li>
        </ul>
        <p className="text-sm text-muted-foreground mt-2">
          Use the tag filter at the top of the Scenarios page to quickly find scenarios by category.
          Tags are free-form — you can create custom tags beyond the standard set.
        </p>
      </div>

      <div className="bg-muted/50 rounded-lg p-4 mt-4">
        <h4 className="font-semibold mb-2">Batch Comparison</h4>
        <p className="text-sm text-muted-foreground">
          Compare up to 10 scenarios at once to see IRR, NOI, and equity multiple deltas ranked side by side.
          Select multiple scenarios using the checkboxes in the list view, then click <strong>Compare Selected</strong>.
          The comparison view highlights the best and worst performers for each metric, making it easy to
          identify which set of assumptions produces the strongest investor returns.
        </p>
      </div>

      <div className="bg-muted/50 rounded-lg p-4 mt-4">
        <h4 className="font-semibold mb-2">Admin Scenario Governance</h4>
        <p className="text-sm text-muted-foreground">
          Administrators have full control over all scenarios platform-wide. They can create scenarios for any user,
          edit or delete any scenario regardless of ownership, and assign scenario visibility to groups, companies,
          or individual users. Admin access always bypasses the per-user scenario management toggle.
        </p>
      </div>
    </SectionCard>
  );
}
