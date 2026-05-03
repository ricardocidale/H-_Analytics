import SourcesTab from "./SourcesTab";
import type { AdminSaveState } from "./save-state";

interface KnowledgeBaseTabProps {
  onSaveStateChange?: (state: AdminSaveState | null) => void;
}

export default function KnowledgeBaseTab({ onSaveStateChange }: KnowledgeBaseTabProps) {
  return (
    <div data-testid="knowledge-base-tab">
      <SourcesTab onSaveStateChange={onSaveStateChange ?? (() => {})} />
    </div>
  );
}
