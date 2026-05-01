import { SectionCard } from "@/components/ui/section-card";
import { IconSwatchBook } from "@/components/icons";interface SectionProps {
  expanded: boolean;
  onToggle: () => void;
  sectionRef: (el: HTMLDivElement | null) => void;
}

export default function Section15Branding({ expanded, onToggle, sectionRef }: SectionProps) {
  return (
    <SectionCard
      id="branding"
      title="15. Branding & Themes"
      icon={IconSwatchBook}
      variant="light"
      expanded={expanded}
      onToggle={onToggle}
      sectionRef={sectionRef}
    >
      <p className="text-sm text-muted-foreground">
        The portal supports customizable branding including logos, color themes, and design elements.
        Branding is managed by your administrator. Contact them to request changes to logos, themes, or design elements.
      </p>

      <div className="bg-muted/50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">Branding Hierarchy</h4>
        <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-5">
          <li><strong>User-level</strong> — if a user has specific branding, it takes priority.</li>
          <li><strong>User Group-level</strong> — if the user belongs to a group with custom branding, that applies.</li>
          <li><strong>System Default</strong> — the fallback branding when no overrides exist.</li>
        </ul>
      </div>
    </SectionCard>
  );
}
