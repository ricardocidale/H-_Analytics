import { describe, it, expect } from 'vitest';
import {
  buildPersonaOverlay,
  DEFAULT_REBECCA_SETTINGS,
  REBECCA_CITATION_STYLES,
  REBECCA_TONE_PRESETS,
  REBECCA_LENGTH_PREFERENCES,
  REBECCA_READING_LEVELS,
  RebeccaSettings,
} from '@shared/rebecca-settings';

const NAME = "Rebecca";

function settingsWithBehavior(patch: Partial<RebeccaSettings['behavior']>): RebeccaSettings {
  return {
    ...DEFAULT_REBECCA_SETTINGS,
    behavior: { ...DEFAULT_REBECCA_SETTINGS.behavior, ...patch },
  };
}

function settingsWithVoice(patch: Partial<RebeccaSettings['voice']>): RebeccaSettings {
  return {
    ...DEFAULT_REBECCA_SETTINGS,
    voice: { ...DEFAULT_REBECCA_SETTINGS.voice, ...patch },
  };
}

describe('buildPersonaOverlay — citationStyle', () => {
  const EXPECTED: Record<typeof REBECCA_CITATION_STYLES[number], string> = {
    inline:    '- Citations: use inline citation style.',
    footnotes: '- Citations: use footnotes citation style.',
    none:      '- Citations: do not cite sources.',
  };

  for (const style of REBECCA_CITATION_STYLES) {
    it(`citationStyle="${style}" renders correct citations line`, () => {
      const overlay = buildPersonaOverlay(settingsWithBehavior({ citationStyle: style }), NAME);
      expect(overlay).toContain(EXPECTED[style]);
    });
  }
});

describe('buildPersonaOverlay — tonePreset', () => {
  for (const preset of REBECCA_TONE_PRESETS) {
    it(`tonePreset="${preset}" appears verbatim in the overlay`, () => {
      const overlay = buildPersonaOverlay(settingsWithVoice({ tonePreset: preset }), NAME);
      expect(overlay).toContain(`- Tone preset: ${preset}.`);
    });
  }
});

describe('buildPersonaOverlay — lengthPreference', () => {
  for (const pref of REBECCA_LENGTH_PREFERENCES) {
    it(`lengthPreference="${pref}" appears verbatim in the overlay`, () => {
      const overlay = buildPersonaOverlay(settingsWithVoice({ lengthPreference: pref }), NAME);
      expect(overlay).toContain(`- Length preference: ${pref}.`);
    });
  }
});

describe('buildPersonaOverlay — readingLevel', () => {
  for (const level of REBECCA_READING_LEVELS) {
    it(`readingLevel="${level}" appears verbatim in the overlay`, () => {
      const overlay = buildPersonaOverlay(settingsWithVoice({ readingLevel: level }), NAME);
      expect(overlay).toContain(`- Reading level: ${level}.`);
    });
  }
});
