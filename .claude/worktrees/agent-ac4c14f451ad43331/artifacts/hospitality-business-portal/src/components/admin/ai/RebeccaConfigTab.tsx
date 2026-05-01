import { RebeccaConfig, type RebeccaConfigProps } from "../ai-agents/RebeccaConfig";

export type { RebeccaConfigProps };
export default function RebeccaConfigTab(props: RebeccaConfigProps) {
  return <RebeccaConfig {...props} />;
}
