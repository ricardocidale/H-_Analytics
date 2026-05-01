import { SectionCard } from "@/components/ui/section-card";
  import { ManualTable } from "@/components/ui/manual-table";

  import { IconSwatchBook } from "@/components/icons";interface SectionProps {
    expanded: boolean;
    onToggle: () => void;
    sectionRef: (el: HTMLDivElement | null) => void;
  }

  export default function Section09DesignConfig({ expanded, onToggle, sectionRef }: SectionProps) {
    return (
      <SectionCard
        id="design-config"
        title="9. Design Configuration"
        icon={IconSwatchBook}
        expanded={expanded}
        onToggle={onToggle}
        sectionRef={sectionRef}
      >
        <ManualTable
          headers={["Element", "Value"]}
          rows={[
            ["Primary Color", "Sage Green (theme primary)"],
            ["Secondary Color", "Green (theme secondary)"],
            ["Background", "Warm Off-White (theme background)"],
            ["Accent", "Coral (theme accent)"],
            ["Heading Font", "Playfair Display (serif)"],
            ["Body Font", "Inter (sans-serif)"],
            ["Dark Theme", "Glass effect with backdrop blur"],
            ["Light Theme", "Clean white cards for assumption pages"],
          ]}
        />
      </SectionCard>
    );
  }
  