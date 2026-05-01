import { SectionCard } from "@/components/ui/section-card";
import { IconProfile } from "@/components/icons";interface SectionProps {
  expanded: boolean;
  onToggle: () => void;
  sectionRef: (el: HTMLDivElement | null) => void;
}

export default function Section14Profile({ expanded, onToggle, sectionRef }: SectionProps) {
  return (
    <SectionCard
      id="profile"
      title="14. My Profile"
      icon={IconProfile}
      variant="light"
      expanded={expanded}
      onToggle={onToggle}
      sectionRef={sectionRef}
    >
      <p className="text-sm text-muted-foreground">
        The Profile page lets you manage your account settings.
      </p>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Available Settings</h4>
        <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-5">
          <li><strong>Display Name</strong> — how your name appears across the portal.</li>
          <li><strong>Email</strong> — your contact email address.</li>
          <li><strong>Password</strong> — change your password at any time.</li>
        </ul>
      </div>
    </SectionCard>
  );
}
