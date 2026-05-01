import { SectionCard } from "@/components/ui/section-card";
  import { ManualTable } from "@/components/ui/manual-table";
  import { Callout } from "@/components/ui/callout";
  import { IconExport } from "@/components/icons";interface SectionProps {
    expanded: boolean;
    onToggle: () => void;
    sectionRef: (el: HTMLDivElement | null) => void;
  }

  export default function Section08ExportSystem({ expanded, onToggle, sectionRef }: SectionProps) {
    return (
      <SectionCard
        id="export-system"
        title="8. Export System"
        icon={IconExport}
        expanded={expanded}
        onToggle={onToggle}
        sectionRef={sectionRef}
      >
        <ManualTable
          headers={["Format", "Extension", "Best For", "How to Use"]}
          rows={[
            ["PDF", ".pdf", "Formal reports", "Export Menu → PDF"],
            ["Excel", ".xlsx", "Offline formula verification", "Export Menu → Excel"],
            ["CSV", ".csv", "Import to other tools", "Export Menu → CSV"],
            ["PowerPoint", ".pptx", "Investor presentations", "Export Menu → PowerPoint"],
            ["Chart PNG", ".png", "Document embedding", "Export Menu → Chart Image"],
            ["Table PNG", ".png", "Document embedding", "Export Menu → Table Image"],
          ]}
        />
        <Callout>CHECKER TIP: Always export to Excel or CSV FIRST. Rebuild calculations independently in a spreadsheet to verify the engine's output.</Callout>
      </SectionCard>
    );
  }
  