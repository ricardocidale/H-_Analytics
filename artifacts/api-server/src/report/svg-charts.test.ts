/**
 * Unit tests for svg-charts.ts — deterministic SVG generation helpers.
 *
 * Task #1648: Expand the report test suite beyond otavio-pagination.
 * Covers:
 *   - renderChartSvg: empty guard, SVG structure, year label formatting,
 *     single-point series skip, negative value handling, legend items
 *   - renderSeasonalityBarSvg: wrong-length guard, SVG structure,
 *     baseline annotation, month labels
 */

import { describe, it, expect } from 'vitest';
import { renderChartSvg, renderSeasonalityBarSvg } from './svg-charts';
import type { ChartSeries, DesignTokens } from './types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TOKENS: DesignTokens = {
  primary: '#1a3c5e',
  secondary: '#4a7c59',
  accent: '#2d5a3d',
  foreground: '#1a1a1a',
  border: '#cccccc',
  muted: '#f5f5f5',
  surface: '#fafafa',
  background: '#ffffff',
  white: '#ffffff',
  negativeRed: '#dc2626',
  chart: ['#1a3c5e', '#4a7c59', '#e07b39', '#8b5cf6'],
  line: ['#1a3c5e', '#4a7c59'],
};

function series(label: string, values: number[], color = '#1a3c5e'): ChartSeries {
  return { label, values, color };
}

const YEARS_3 = ['2025', '2026', '2027'];
const YEARS_1 = ['2025'];

// ─── renderChartSvg ───────────────────────────────────────────────────────────

describe('renderChartSvg — empty guards', () => {
  it('returns empty string when series array is empty', () => {
    expect(renderChartSvg([], YEARS_3, TOKENS)).toBe('');
  });

  it('returns empty string when years array is empty', () => {
    const s = series('Revenue', [100, 200, 300]);
    expect(renderChartSvg([s], [], TOKENS)).toBe('');
  });

  it('returns empty string when both series and years are empty', () => {
    expect(renderChartSvg([], [], TOKENS)).toBe('');
  });
});

describe('renderChartSvg — SVG structure', () => {
  it('output starts with <svg and ends with </svg>', () => {
    const s = series('Revenue', [100, 200, 300]);
    const svg = renderChartSvg([s], YEARS_3, TOKENS);
    expect(svg.trimStart()).toMatch(/^<svg /);
    expect(svg.trimEnd()).toMatch(/<\/svg>$/);
  });

  it('SVG contains the xmlns attribute', () => {
    const s = series('Revenue', [100, 200, 300]);
    const svg = renderChartSvg([s], YEARS_3, TOKENS);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('SVG declares explicit width and height attributes', () => {
    const s = series('Revenue', [100, 200, 300]);
    const svg = renderChartSvg([s], YEARS_3, TOKENS);
    expect(svg).toMatch(/width="\d+"/);
    expect(svg).toMatch(/height="\d+"/);
  });

  it('custom width option is reflected in the SVG dimensions', () => {
    const s = series('Revenue', [100, 200, 300]);
    const svg = renderChartSvg([s], YEARS_3, TOKENS, { width: 400 });
    expect(svg).toContain('width="400"');
  });

  it('custom height option is reflected in the SVG dimensions', () => {
    const s = series('Revenue', [100, 200, 300]);
    const svg = renderChartSvg([s], YEARS_3, TOKENS, { height: 300 });
    expect(svg).toContain('height="300"');
  });

  it('emits grid lines — contains <line elements', () => {
    const s = series('Revenue', [100, 200, 300]);
    const svg = renderChartSvg([s], YEARS_3, TOKENS);
    expect(svg).toMatch(/<line /);
  });

  it('emits a <path for the series line when values.length >= 2', () => {
    const s = series('Revenue', [100, 200, 300]);
    const svg = renderChartSvg([s], YEARS_3, TOKENS);
    expect(svg).toMatch(/<path /);
  });

  it('emits <circle elements for data point markers', () => {
    const s = series('Revenue', [100, 200, 300]);
    const svg = renderChartSvg([s], YEARS_3, TOKENS);
    expect(svg).toMatch(/<circle /);
  });
});

describe('renderChartSvg — year label formatting', () => {
  it('4-digit years are abbreviated to \'YY format', () => {
    const s = series('Revenue', [100, 200, 300]);
    const svg = renderChartSvg([s], ['2024', '2025', '2026'], TOKENS);
    expect(svg).toContain("'24");
    expect(svg).toContain("'25");
    expect(svg).toContain("'26");
  });

  it('non-4-digit year labels are rendered verbatim', () => {
    const s = series('Revenue', [100, 200]);
    const svg = renderChartSvg([s], ['Q1', 'Q2'], TOKENS);
    expect(svg).toContain('>Q1<');
    expect(svg).toContain('>Q2<');
  });
});

describe('renderChartSvg — single-point series', () => {
  it('series with exactly one value produces no <path element', () => {
    const s = series('Revenue', [500]);
    const svg = renderChartSvg([s], YEARS_1, TOKENS);
    expect(svg).not.toMatch(/<path /);
  });

  it('series with zero values produces no <path element', () => {
    const s = series('Revenue', []);
    const svg = renderChartSvg([s], YEARS_1, TOKENS);
    expect(svg).not.toMatch(/<path /);
  });
});

describe('renderChartSvg — legend', () => {
  it('series label appears in the SVG legend text', () => {
    const s = series('Net Operating Income', [100_000, 150_000, 200_000]);
    const svg = renderChartSvg([s], YEARS_3, TOKENS);
    expect(svg).toContain('Net Operating Income');
  });

  it('multiple series produce multiple legend items', () => {
    const s1 = series('Revenue', [100, 200, 300]);
    const s2 = series('Expenses', [80, 150, 220]);
    const svg = renderChartSvg([s1, s2], YEARS_3, TOKENS);
    expect(svg).toContain('Revenue');
    expect(svg).toContain('Expenses');
  });
});

describe('renderChartSvg — XML safety', () => {
  it('ampersand in series label is escaped', () => {
    const s = series('Food & Beverage', [100, 200, 300]);
    const svg = renderChartSvg([s], YEARS_3, TOKENS);
    expect(svg).not.toContain('Food & Beverage');
    expect(svg).toContain('Food &amp; Beverage');
  });

  it('angle brackets in year labels are escaped', () => {
    const s = series('Revenue', [100, 200]);
    const svg = renderChartSvg([s], ['<2025>', '<2026>'], TOKENS);
    expect(svg).not.toContain('<2025>');
    expect(svg).toContain('&lt;2025&gt;');
  });
});

describe('renderChartSvg — negative values', () => {
  it('negative values produce valid paths (no crash)', () => {
    const s = series('Net Income', [-100_000, -50_000, 50_000]);
    expect(() => renderChartSvg([s], YEARS_3, TOKENS)).not.toThrow();
  });

  it('all-zero series still produces a valid SVG', () => {
    const s = series('Empty Line', [0, 0, 0]);
    const svg = renderChartSvg([s], YEARS_3, TOKENS);
    expect(svg.trimStart()).toMatch(/^<svg /);
    expect(svg.trimEnd()).toMatch(/<\/svg>$/);
  });
});

describe('renderChartSvg — two-point series uses straight line', () => {
  it('two-point series still emits a <path element', () => {
    const s = series('Revenue', [100, 200]);
    const svg = renderChartSvg([s], ['2025', '2026'], TOKENS);
    expect(svg).toMatch(/<path /);
  });
});

// ─── renderSeasonalityBarSvg ──────────────────────────────────────────────────

describe('renderSeasonalityBarSvg — empty/invalid guards', () => {
  it('returns empty string when profile is empty', () => {
    expect(renderSeasonalityBarSvg([], TOKENS)).toBe('');
  });

  it('returns empty string when profile has fewer than 12 values', () => {
    const short = Array(6).fill(1.0);
    expect(renderSeasonalityBarSvg(short, TOKENS)).toBe('');
  });

  it('returns empty string when profile has more than 12 values', () => {
    const long = Array(13).fill(1.0);
    expect(renderSeasonalityBarSvg(long, TOKENS)).toBe('');
  });
});

describe('renderSeasonalityBarSvg — SVG structure', () => {
  const FLAT_PROFILE = Array(12).fill(1.0);

  it('returns a non-empty string for a valid 12-value profile', () => {
    const svg = renderSeasonalityBarSvg(FLAT_PROFILE, TOKENS);
    expect(svg.length).toBeGreaterThan(0);
  });

  it('output starts with <svg and ends with </svg>', () => {
    const svg = renderSeasonalityBarSvg(FLAT_PROFILE, TOKENS);
    expect(svg.trimStart()).toMatch(/^<svg /);
    expect(svg.trimEnd()).toMatch(/<\/svg>$/);
  });

  it('SVG contains the xmlns attribute', () => {
    const svg = renderSeasonalityBarSvg(FLAT_PROFILE, TOKENS);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it('emits exactly 12 bar <rect elements', () => {
    const svg = renderSeasonalityBarSvg(FLAT_PROFILE, TOKENS);
    const rectMatches = svg.match(/<rect /g);
    expect(rectMatches).not.toBeNull();
    expect(rectMatches!.length).toBe(12);
  });

  it('custom width is reflected in the SVG attributes', () => {
    const svg = renderSeasonalityBarSvg(FLAT_PROFILE, TOKENS, { width: 400 });
    expect(svg).toContain('width="400"');
  });

  it('custom height is reflected in the SVG attributes', () => {
    const svg = renderSeasonalityBarSvg(FLAT_PROFILE, TOKENS, { height: 150 });
    expect(svg).toContain('height="150"');
  });
});

describe('renderSeasonalityBarSvg — month labels', () => {
  const FLAT_PROFILE = Array(12).fill(1.0);
  const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  it('all 12 month abbreviations appear in the SVG', () => {
    const svg = renderSeasonalityBarSvg(FLAT_PROFILE, TOKENS);
    for (const label of MONTH_LABELS) {
      expect(svg).toContain(`>${label}<`);
    }
  });
});

describe('renderSeasonalityBarSvg — baseline annotation', () => {
  const FLAT_PROFILE = Array(12).fill(1.0);

  it('baseline label 1.0× appears in the SVG', () => {
    const svg = renderSeasonalityBarSvg(FLAT_PROFILE, TOKENS);
    expect(svg).toContain('1.0×');
  });

  it('emits a dashed baseline line', () => {
    const svg = renderSeasonalityBarSvg(FLAT_PROFILE, TOKENS);
    expect(svg).toContain('stroke-dasharray');
  });
});

describe('renderSeasonalityBarSvg — value labels on bars', () => {
  it('each bar carries a formatted multiplier label (×)', () => {
    const profile = [0.80, 0.85, 0.90, 0.95, 1.10, 1.20, 1.30, 1.25, 1.15, 1.05, 0.90, 0.75];
    const svg = renderSeasonalityBarSvg(profile, TOKENS);
    expect(svg).toContain('0.80×');
    expect(svg).toContain('1.30×');
    expect(svg).toContain('0.75×');
  });
});

describe('renderSeasonalityBarSvg — profile with negative value', () => {
  it('does not throw for a profile containing negative values', () => {
    const profile = [1.0, -0.5, 1.2, 0.9, 1.1, 1.3, 1.4, 1.2, 1.0, 0.8, 0.7, 0.6];
    expect(() => renderSeasonalityBarSvg(profile, TOKENS)).not.toThrow();
  });
});
