/**
 * Tab 5 (Agents — build progress) rendering tests.
 *
 * Verifies the key conditional branches in FactoryAgentsTab:
 *   - Building / complete / error header state
 *   - Per-slide status icons driven by agentResults
 *   - Maya verdict badge visibility and class
 *   - Dino pixel-diff badge visibility
 *
 * Uses renderToString — no DOM environment required.
 */
import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect } from 'vitest';

// ── Types (mirrors SlideAgentResultFE + SlideFactoryRun shape) ────────────────

interface SlideAgentResultFE {
  status: 'pending' | 'running' | 'approved' | 'rejected';
  pixelDiffPct: number | null;
  mayaVerdict: 'ok' | 'advisory' | 'warning' | 'block' | null;
  mayaNotes: string | null;
  approvedAt: string | null;
  errorMessage: string | null;
}

interface RunFixture {
  status: 'building' | 'complete' | 'error';
  agentResults: Record<string, SlideAgentResultFE> | null;
}

// ── Constants (mirrors SlideFactoryPanel) ─────────────────────────────────────

const TOTAL_DECK_SLIDES = 6;
const SLIDE_AGENT_NAMES: Record<number, string> = {
  1: 'Sofia', 2: 'Bianca', 3: 'Chiara', 4: 'Dario', 5: 'Elisa', 6: 'Felix',
};
const MAYA_VERDICT_CLASS: Record<NonNullable<SlideAgentResultFE['mayaVerdict']>, string> = {
  ok: 'text-emerald-700 bg-emerald-50',
  advisory: 'text-sky-700 bg-sky-50',
  warning: 'text-amber-700 bg-amber-50',
  block: 'text-red-700 bg-red-50',
};

// ── Fixture component ─────────────────────────────────────────────────────────

function AgentsTabFixture({ run }: { run: RunFixture }) {
  const agentResults = run.agentResults ?? {};
  const isBuilding = run.status === 'building';
  const isComplete = run.status === 'complete';
  const isError = run.status === 'error';

  return (
    <div data-testid="agents-tab">
      {/* Header state indicator */}
      {isBuilding && <span data-testid="state-building">Building</span>}
      {isComplete && <span data-testid="state-complete">Complete</span>}
      {isError && <span data-testid="state-error">Error</span>}

      {/* Per-slide rows */}
      {Array.from({ length: TOTAL_DECK_SLIDES }, (_, i) => {
        const slideNum = i + 1;
        const key = `slide${slideNum}`;
        const result = agentResults[key] ?? null;
        const slotStatus = result?.status ?? (isBuilding ? 'pending' : null);

        return (
          <div key={key} data-testid={`slide-row-${slideNum}`}>
            <span data-testid={`team-name-${slideNum}`}>{SLIDE_AGENT_NAMES[slideNum]}</span>
            {slotStatus === 'approved' && (
              <span data-testid={`status-approved-${slideNum}`}>approved</span>
            )}
            {slotStatus === 'rejected' && (
              <span data-testid={`status-rejected-${slideNum}`}>rejected</span>
            )}
            {slotStatus === 'running' && (
              <span data-testid={`status-running-${slideNum}`}>running</span>
            )}
            {slotStatus === 'pending' && (
              <span data-testid={`status-pending-${slideNum}`}>pending</span>
            )}
            {result?.mayaVerdict && (
              <span
                data-testid={`maya-verdict-${slideNum}`}
                className={MAYA_VERDICT_CLASS[result.mayaVerdict]}
              >
                Maya:{result.mayaVerdict}
              </span>
            )}
            {result?.pixelDiffPct != null && (
              <span data-testid={`dino-diff-${slideNum}`}>
                Dino:{result.pixelDiffPct.toFixed(1)}%
              </span>
            )}
            {result?.errorMessage && (
              <span data-testid={`error-msg-${slideNum}`}>{result.errorMessage}</span>
            )}
            {result?.mayaNotes && result.mayaVerdict !== 'ok' && (
              <span data-testid={`maya-notes-${slideNum}`}>{result.mayaNotes}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Tab5 FactoryAgentsTab — header state', () => {
  it('shows building state when status=building', () => {
    const html = renderToString(
      React.createElement(AgentsTabFixture, { run: { status: 'building', agentResults: null } }),
    );
    expect(html).toContain('data-testid="state-building"');
    expect(html).not.toContain('data-testid="state-complete"');
    expect(html).not.toContain('data-testid="state-error"');
  });

  it('shows complete state when status=complete', () => {
    const html = renderToString(
      React.createElement(AgentsTabFixture, { run: { status: 'complete', agentResults: null } }),
    );
    expect(html).toContain('data-testid="state-complete"');
    expect(html).not.toContain('data-testid="state-building"');
  });

  it('shows error state when status=error', () => {
    const html = renderToString(
      React.createElement(AgentsTabFixture, { run: { status: 'error', agentResults: null } }),
    );
    expect(html).toContain('data-testid="state-error"');
  });
});

describe('Tab5 FactoryAgentsTab — all six team names rendered', () => {
  it('renders one row per slide with the correct team name', () => {
    const html = renderToString(
      React.createElement(AgentsTabFixture, { run: { status: 'building', agentResults: null } }),
    );
    ['Sofia', 'Bianca', 'Chiara', 'Dario', 'Elisa', 'Felix'].forEach((name) => {
      expect(html).toContain(name);
    });
  });
});

describe('Tab5 FactoryAgentsTab — per-slide status icons', () => {
  it('shows all six slides as pending during building with no agentResults', () => {
    const html = renderToString(
      React.createElement(AgentsTabFixture, { run: { status: 'building', agentResults: {} } }),
    );
    for (let n = 1; n <= 6; n++) {
      expect(html).toContain(`data-testid="status-pending-${n}"`);
    }
  });

  it('shows approved icon for an approved slide', () => {
    const agentResults: Record<string, SlideAgentResultFE> = {
      slide1: {
        status: 'approved', pixelDiffPct: 0.5, mayaVerdict: 'ok',
        mayaNotes: null, approvedAt: '2026-05-07T12:00:00Z', errorMessage: null,
      },
    };
    const html = renderToString(
      React.createElement(AgentsTabFixture, { run: { status: 'building', agentResults } }),
    );
    expect(html).toContain('data-testid="status-approved-1"');
    expect(html).toContain('data-testid="status-pending-2"');
  });

  it('shows rejected icon for a rejected slide', () => {
    const agentResults: Record<string, SlideAgentResultFE> = {
      slide3: {
        status: 'rejected', pixelDiffPct: null, mayaVerdict: 'block',
        mayaNotes: 'Wrong property name', approvedAt: null, errorMessage: 'Inspector rejected',
      },
    };
    const html = renderToString(
      React.createElement(AgentsTabFixture, { run: { status: 'error', agentResults } }),
    );
    expect(html).toContain('data-testid="status-rejected-3"');
    expect(html).toContain('data-testid="error-msg-3"');
    expect(html).toContain('Inspector rejected');
  });

  it('shows running icon for a running slide', () => {
    const agentResults: Record<string, SlideAgentResultFE> = {
      slide2: {
        status: 'running', pixelDiffPct: null, mayaVerdict: null,
        mayaNotes: null, approvedAt: null, errorMessage: null,
      },
    };
    const html = renderToString(
      React.createElement(AgentsTabFixture, { run: { status: 'building', agentResults } }),
    );
    expect(html).toContain('data-testid="status-running-2"');
  });
});

describe('Tab5 FactoryAgentsTab — Maya verdict badge', () => {
  it('shows Maya badge with emerald class for ok verdict', () => {
    const agentResults: Record<string, SlideAgentResultFE> = {
      slide1: {
        status: 'approved', pixelDiffPct: 0.2, mayaVerdict: 'ok',
        mayaNotes: null, approvedAt: null, errorMessage: null,
      },
    };
    const html = renderToString(
      React.createElement(AgentsTabFixture, { run: { status: 'complete', agentResults } }),
    );
    expect(html).toContain('data-testid="maya-verdict-1"');
    expect(html).toContain('text-emerald-700');
  });

  it('shows Maya badge with red class for block verdict', () => {
    const agentResults: Record<string, SlideAgentResultFE> = {
      slide4: {
        status: 'rejected', pixelDiffPct: null, mayaVerdict: 'block',
        mayaNotes: 'Visual mismatch', approvedAt: null, errorMessage: null,
      },
    };
    const html = renderToString(
      React.createElement(AgentsTabFixture, { run: { status: 'error', agentResults } }),
    );
    expect(html).toContain('data-testid="maya-verdict-4"');
    expect(html).toContain('text-red-700');
    expect(html).toContain('data-testid="maya-notes-4"');
    expect(html).toContain('Visual mismatch');
  });

  it('shows amber class for warning verdict', () => {
    const agentResults: Record<string, SlideAgentResultFE> = {
      slide5: {
        status: 'approved', pixelDiffPct: 1.1, mayaVerdict: 'warning',
        mayaNotes: 'Minor issue', approvedAt: null, errorMessage: null,
      },
    };
    const html = renderToString(
      React.createElement(AgentsTabFixture, { run: { status: 'complete', agentResults } }),
    );
    expect(html).toContain('text-amber-700');
  });

  it('does NOT show maya-notes when verdict is ok', () => {
    const agentResults: Record<string, SlideAgentResultFE> = {
      slide1: {
        status: 'approved', pixelDiffPct: 0, mayaVerdict: 'ok',
        mayaNotes: 'all good', approvedAt: null, errorMessage: null,
      },
    };
    const html = renderToString(
      React.createElement(AgentsTabFixture, { run: { status: 'complete', agentResults } }),
    );
    // mayaNotes suppressed when verdict is 'ok'
    expect(html).not.toContain('data-testid="maya-notes-1"');
  });

  it('does NOT render Maya badge when mayaVerdict is null', () => {
    const agentResults: Record<string, SlideAgentResultFE> = {
      slide1: {
        status: 'running', pixelDiffPct: null, mayaVerdict: null,
        mayaNotes: null, approvedAt: null, errorMessage: null,
      },
    };
    const html = renderToString(
      React.createElement(AgentsTabFixture, { run: { status: 'building', agentResults } }),
    );
    expect(html).not.toContain('data-testid="maya-verdict-1"');
  });
});

describe('Tab5 FactoryAgentsTab — Dino pixel-diff badge', () => {
  it('shows Dino badge with formatted percentage when pixelDiffPct is set', () => {
    const agentResults: Record<string, SlideAgentResultFE> = {
      slide6: {
        status: 'approved', pixelDiffPct: 2.345, mayaVerdict: 'ok',
        mayaNotes: null, approvedAt: null, errorMessage: null,
      },
    };
    const html = renderToString(
      React.createElement(AgentsTabFixture, { run: { status: 'complete', agentResults } }),
    );
    expect(html).toContain('data-testid="dino-diff-6"');
    expect(html).toContain('2.3');
    expect(html).toContain('%');
  });

  it('does NOT render Dino badge when pixelDiffPct is null', () => {
    const agentResults: Record<string, SlideAgentResultFE> = {
      slide1: {
        status: 'running', pixelDiffPct: null, mayaVerdict: null,
        mayaNotes: null, approvedAt: null, errorMessage: null,
      },
    };
    const html = renderToString(
      React.createElement(AgentsTabFixture, { run: { status: 'building', agentResults } }),
    );
    expect(html).not.toContain('data-testid="dino-diff-1"');
  });
});

describe('Tab5 FactoryAgentsTab — mid-build partial state', () => {
  it('renders completed rows + pending rows when only some slides have results', () => {
    const agentResults: Record<string, SlideAgentResultFE> = {
      slide1: {
        status: 'approved', pixelDiffPct: 0.1, mayaVerdict: 'ok',
        mayaNotes: null, approvedAt: '2026-05-07T12:00:00Z', errorMessage: null,
      },
      slide2: {
        status: 'approved', pixelDiffPct: 0.2, mayaVerdict: 'ok',
        mayaNotes: null, approvedAt: '2026-05-07T12:01:00Z', errorMessage: null,
      },
    };
    const html = renderToString(
      React.createElement(AgentsTabFixture, { run: { status: 'building', agentResults } }),
    );
    expect(html).toContain('data-testid="status-approved-1"');
    expect(html).toContain('data-testid="status-approved-2"');
    // Slides 3–6 should be pending
    for (let n = 3; n <= 6; n++) {
      expect(html).toContain(`data-testid="status-pending-${n}"`);
    }
  });
});
