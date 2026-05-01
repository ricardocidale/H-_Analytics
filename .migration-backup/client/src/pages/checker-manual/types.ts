import type { ComponentType, SVGProps } from "react";

export interface ManualSection {
  id: string;
  title: string;
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
}

export interface CheckerManualProps {
  embedded?: boolean;
}
