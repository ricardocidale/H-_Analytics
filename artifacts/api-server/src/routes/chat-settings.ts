import { z } from "zod";
import {
  mergeRebeccaSettings,
  rebeccaSettingsPatchSchema,
  type RebeccaSettings,
} from "@shared/rebecca-settings";

type SettingsPatch = z.infer<typeof rebeccaSettingsPatchSchema>;

/** Deep-merge an admin preview-settings patch onto the base RebeccaSettings. */
export function patchRebeccaSettings(
  base: RebeccaSettings,
  patch: SettingsPatch,
): RebeccaSettings {
  const s = patch.sources ?? {};
  return mergeRebeccaSettings({
    identity: { ...base.identity, ...(patch.identity ?? {}) },
    personality: { ...base.personality, ...(patch.personality ?? {}) },
    voice: { ...base.voice, ...(patch.voice ?? {}) },
    behavior: { ...base.behavior, ...(patch.behavior ?? {}) },
    llm: { ...base.llm, ...(patch.llm ?? {}) },
    sources: {
      knowledgeBase: { ...base.sources.knowledgeBase, ...(s.knowledgeBase ?? {}) },
      portfolio: { ...base.sources.portfolio, ...(s.portfolio ?? {}) },
      research: { ...base.sources.research, ...(s.research ?? {}) },
      documents: { ...base.sources.documents, ...(s.documents ?? {}) },
      webSearch: { ...base.sources.webSearch, ...(s.webSearch ?? {}) },
      uploadedFiles: { ...base.sources.uploadedFiles, ...(s.uploadedFiles ?? {}) },
    },
  });
}
