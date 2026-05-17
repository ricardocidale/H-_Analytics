import { REBECCA_CARDS, ANALYST_CARDS } from "./animationCatalog";
import { AnimationFamilyCollapsible } from "./AnimationFamilyCollapsible";

export default function AnimationsTab() {
  return (
    <div className="space-y-3" data-testid="admin-animations-tab">
      <p className="text-sm text-muted-foreground mb-4">
        Motion and animation assets for agent personas. Press play on any animation to preview it.
        These are read-only — contact engineering to add or remove animations.
      </p>

      <AnimationFamilyCollapsible
        title="Rebecca"
        count={REBECCA_CARDS.length}
        cards={REBECCA_CARDS}
        defaultOpen
      />

      <AnimationFamilyCollapsible
        title="The Analyst"
        count={ANALYST_CARDS.length}
        cards={ANALYST_CARDS}
        defaultOpen
      />
    </div>
  );
}
