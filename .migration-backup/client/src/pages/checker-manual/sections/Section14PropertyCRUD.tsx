import { SectionCard } from "@/components/ui/section-card";
  import { ManualTable } from "@/components/ui/manual-table";
  import { Callout } from "@/components/ui/callout";
  import { IconImage } from "@/components/icons";interface SectionProps {
    expanded: boolean;
    onToggle: () => void;
    sectionRef: (el: HTMLDivElement | null) => void;
  }

  export default function Section14PropertyCRUD({ expanded, onToggle, sectionRef }: SectionProps) {
    return (
      <SectionCard
        id="property-crud"
        title="14. Property CRUD & Images"
        icon={IconImage}
        expanded={expanded}
        onToggle={onToggle}
        sectionRef={sectionRef}
      >
        <ManualTable
          headers={["Feature", "Description", "Business Logic"]}
          rows={[
            ["Add Property", "Create new SPV entity", "Initializes with global defaults; increments portfolio count; auto-creates initial photo if imageUrl provided"],
            ["Edit Property", "Modify assumptions", "Triggers instant recalculation across all tabs"],
            ["Delete Property", "Remove SPV from portfolio", "Removes from consolidated financials; cascades to delete all photos; cannot be undone"],
            ["Photo Album", "Multiple photos per property", "Grid display; one hero photo synced to property card and header; drag-reorder; inline captions"],
            ["Hero Selection", "Designate primary photo", "Gold star indicator; syncs imageUrl to properties table for backward compat; auto-promotes next photo on hero delete"],
            ["Upload Photos", "Batch file upload to album", "Supports JPEG, PNG, WebP; stored in object storage; first upload auto-sets as hero"],
            ["AI Generation", "Generate photo from property details", "Uses Nano Banana (Gemini) with OpenAI fallback; auto-prompt from name, location, rooms, type; preview before adding"],
          ]}
        />

        <Callout severity="info">
          Photo albums are included in scenario snapshots. Loading a scenario restores all photos with correct hero assignments. The <code>properties.imageUrl</code> field is kept as a cached reference to the hero photo for backward compatibility across all existing display locations and exports.
        </Callout>
      </SectionCard>
    );
  }
