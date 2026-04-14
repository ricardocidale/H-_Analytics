import { SectionCard } from "@/components/ui/section-card";

  import { IconProfile } from "@/components/icons";interface SectionProps {
    expanded: boolean;
    onToggle: () => void;
    sectionRef: (el: HTMLDivElement | null) => void;
  }

  export default function Section11MyProfile({ expanded, onToggle, sectionRef }: SectionProps) {
    return (
      <SectionCard
        id="my-profile"
        title="11. My Profile"
        icon={IconProfile}
        expanded={expanded}
        onToggle={onToggle}
        sectionRef={sectionRef}
      >
        <ul className="text-muted-foreground text-sm space-y-1 list-disc list-inside">
          <li>Edit name, email, company, and title</li>
          <li>Change password (current + new + confirm)</li>
          <li>Checker Manual button visible for checker and admin roles</li>
        </ul>
      </SectionCard>
    );
  }
  