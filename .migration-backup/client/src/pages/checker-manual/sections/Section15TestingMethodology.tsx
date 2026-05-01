import { SectionCard } from "@/components/ui/section-card";
  import { ManualTable } from "@/components/ui/manual-table";

  import { IconVerify } from "@/components/icons";interface SectionProps {
    expanded: boolean;
    onToggle: () => void;
    sectionRef: (el: HTMLDivElement | null) => void;
  }

  export default function Section15TestingMethodology({ expanded, onToggle, sectionRef }: SectionProps) {
    return (
      <SectionCard
        id="testing-methodology"
        title="15. Testing Methodology"
        icon={IconVerify}
        expanded={expanded}
        onToggle={onToggle}
        sectionRef={sectionRef}
      >
        <ManualTable
          headers={["Method", "Description", "Target"]}
          rows={[
            ["Unit Tests", "Vitest suite for core calculation functions", "loanCalculations, equityCalculations, financialEngine"],
            ["Golden Tests", "Comparison of engine output against known correct snapshots", "Full pro-forma outputs"],
            ["Identity Tests", "Verifying BS/CF/IS identities hold across 10 years", "Data integrity"],
            ["Manual Sync", "Cross-checking UI values against Excel export", "End-to-end verification"],
            ["Domain Boundary Tests", "Enforces calc/ module purity — the financial engine (calc/) has zero dependencies on server/, client/, or AI modules. Import boundaries are validated to guarantee that calculation logic is deterministic, side-effect-free, and produces identical results regardless of runtime context. This also provides the AI isolation guarantee: no AI-generated code can influence core financial calculations.", "calc/ module purity, deterministic output, AI isolation"],
            ["Independent Checker", "Dual-implementation verification pattern where a second, independently written calculation pipeline recomputes key financial outputs (NOI, ANOI, cash flows, IRR, equity multiple) from raw assumptions and compares against the primary engine. Any discrepancy beyond floating-point tolerance triggers an alert. This provides defense-in-depth against systematic errors in the primary engine.", "Cross-verification of primary engine outputs"],
          ]}
        />
      </SectionCard>
    );
  }
