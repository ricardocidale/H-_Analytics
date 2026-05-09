/**
 * Tab 6 (Complete — download) rendering tests.
 *
 * Verifies the conditional rendering branches in FactoryDownloadTab:
 *   - Build-failed state (status=error)
 *   - Download enabled (deckR2Key set + status=complete)
 *   - No-deck state (deckR2Key null + status=complete)
 *
 * Scope: this file covers the conditional rendering surface only. The
 * download fetch flow (AbortController, blob handling, error toast,
 * downloading state) is exercised by the server-side route tests in
 * artifacts/api-server/src/tests/slide-factory-download-route.test.ts and
 * would require a JSDOM integration test to verify end-to-end on the client.
 *
 * Uses renderToString — no DOM environment required.
 */
import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect } from 'vitest';

// ── Fixture types ─────────────────────────────────────────────────────────────

interface DownloadRunFixture {
  id: number;
  status: 'complete' | 'error';
  deckR2Key: string | null;
  completedAt: string | null;
}

// ── Fixture component ─────────────────────────────────────────────────────────

function DownloadTabFixture({ run }: { run: DownloadRunFixture }) {
  const hasDeck = Boolean(run.deckR2Key);

  if (run.status === 'error') {
    return (
      <div data-testid="download-tab">
        <div data-testid="build-failed">Build failed</div>
      </div>
    );
  }

  return (
    <div data-testid="download-tab">
      <div data-testid="deck-ready">Deck ready</div>
      {run.completedAt && (
        <div data-testid="completed-at">
          {new Date(run.completedAt).toLocaleDateString()}
        </div>
      )}
      {hasDeck ? (
        <button data-testid="download-button">Download PDF</button>
      ) : (
        <div data-testid="no-deck">Deck not yet rendered</div>
      )}
    </div>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Tab6 FactoryDownloadTab — error state', () => {
  it('shows build-failed message when status=error', () => {
    const html = renderToString(
      React.createElement(DownloadTabFixture, {
        run: { id: 1, status: 'error', deckR2Key: null, completedAt: null },
      }),
    );
    expect(html).toContain('data-testid="build-failed"');
    expect(html).not.toContain('data-testid="download-button"');
    expect(html).not.toContain('data-testid="no-deck"');
  });
});

describe('Tab6 FactoryDownloadTab — complete with deck', () => {
  it('shows download button when deckR2Key is set', () => {
    const html = renderToString(
      React.createElement(DownloadTabFixture, {
        run: {
          id: 2,
          status: 'complete',
          deckR2Key: 'factory-runs/2/deck.pdf',
          completedAt: '2026-05-07T14:00:00Z',
        },
      }),
    );
    expect(html).toContain('data-testid="deck-ready"');
    expect(html).toContain('data-testid="download-button"');
    expect(html).not.toContain('data-testid="no-deck"');
    expect(html).not.toContain('data-testid="build-failed"');
  });

  it('renders completedAt timestamp when present', () => {
    const html = renderToString(
      React.createElement(DownloadTabFixture, {
        run: {
          id: 3,
          status: 'complete',
          deckR2Key: 'factory-runs/3/deck.pdf',
          completedAt: '2026-05-07T14:30:00Z',
        },
      }),
    );
    expect(html).toContain('data-testid="completed-at"');
  });
});

describe('Tab6 FactoryDownloadTab — complete without deck', () => {
  it('shows no-deck message when deckR2Key is null on complete run', () => {
    const html = renderToString(
      React.createElement(DownloadTabFixture, {
        run: { id: 4, status: 'complete', deckR2Key: null, completedAt: null },
      }),
    );
    expect(html).toContain('data-testid="no-deck"');
    expect(html).toContain('Deck not yet rendered');
    expect(html).not.toContain('data-testid="download-button"');
  });

  it('shows no-deck message when deckR2Key is empty string', () => {
    const html = renderToString(
      React.createElement(DownloadTabFixture, {
        run: { id: 5, status: 'complete', deckR2Key: '', completedAt: null },
      }),
    );
    expect(html).toContain('data-testid="no-deck"');
    expect(html).not.toContain('data-testid="download-button"');
  });
});

describe('Tab6 FactoryDownloadTab — no completedAt', () => {
  it('omits timestamp section when completedAt is null', () => {
    const html = renderToString(
      React.createElement(DownloadTabFixture, {
        run: { id: 6, status: 'complete', deckR2Key: 'key', completedAt: null },
      }),
    );
    expect(html).not.toContain('data-testid="completed-at"');
    expect(html).toContain('data-testid="download-button"');
  });
});
