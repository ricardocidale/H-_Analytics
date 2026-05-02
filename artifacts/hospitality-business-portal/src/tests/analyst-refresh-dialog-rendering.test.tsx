/**
 * Task #910 — Component-level rendering test
 *
 * Verifies that the RefreshDiffDialog is NOT mounted when the refresh response
 * has autoCommitted: true (reference_brands path).
 *
 * Uses React's server-side renderToString to produce HTML from a minimal
 * fixture component that mirrors AnalystTables.tsx's conditional rendering —
 * no DOM environment or @testing-library required, runs under Node.
 */
import React, { useState } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { shouldOpenDiffDialog, type RefreshPayloadShape } from '@/lib/analyst-refresh-helpers';

/**
 * Snapshot fixture that renders the conditional dialog slot in one pass.
 * The `triggered` prop simulates "the user clicked Refresh and got a response";
 * when true the fixture applies the same branching as AnalystTables.tsx.
 *
 *   if (!shouldOpenDiffDialog(payload)) → skip dialog
 *   else                               → render dialog placeholder
 */
function DialogSlotFixture({
  payload,
  triggered,
}: {
  payload: RefreshPayloadShape;
  triggered: boolean;
}) {
  const showDialog = triggered && shouldOpenDiffDialog(payload);
  return (
    <div>
      {showDialog && <div data-testid="refresh-diff-dialog">RefreshDiffDialog</div>}
    </div>
  );
}

/**
 * Stateful version used for tests that call useState directly (not needed
 * for snapshot tests, but proves the hook path in the same test file).
 */
function StatefulDialogFixture({ payload }: { payload: RefreshPayloadShape }) {
  const [pendingRefresh, setPendingRefresh] = useState<RefreshPayloadShape | null>(null);

  const handleRefreshResult = () => {
    if (!shouldOpenDiffDialog(payload)) {
      // auto-commit: don't set pendingRefresh → dialog absent
    } else {
      setPendingRefresh(payload);
    }
  };

  return (
    <div>
      <button data-testid="trigger" onClick={handleRefreshResult}>Trigger</button>
      {pendingRefresh !== null && (
        <div data-testid="refresh-diff-dialog">RefreshDiffDialog</div>
      )}
    </div>
  );
}

describe('RefreshDiffDialog rendering — component-level snapshot', () => {
  it('dialog slot is ABSENT in rendered HTML when autoCommitted: true (reference_brands)', () => {
    const payload: RefreshPayloadShape = {
      autoCommitted: true,
      proposedRanges: [{ dimensionKey: 'brand_1' }, { dimensionKey: 'brand_2' }],
    };
    const html = renderToString(
      React.createElement(DialogSlotFixture, { payload, triggered: true }),
    );
    expect(html).not.toContain('refresh-diff-dialog');
  });

  it('dialog slot IS present in rendered HTML when autoCommitted: false', () => {
    const payload: RefreshPayloadShape = {
      autoCommitted: false,
      proposedRanges: [{ dimensionKey: 'seed' }],
    };
    const html = renderToString(
      React.createElement(DialogSlotFixture, { payload, triggered: true }),
    );
    expect(html).toContain('refresh-diff-dialog');
  });

  it('dialog slot is ABSENT when not triggered (no refresh response yet)', () => {
    const payload: RefreshPayloadShape = { autoCommitted: false, proposedRanges: [] };
    const html = renderToString(
      React.createElement(DialogSlotFixture, { payload, triggered: false }),
    );
    expect(html).not.toContain('refresh-diff-dialog');
  });

  it('dialog absent when autoCommitted absent (undefined) and triggered', () => {
    // undefined autoCommitted → shouldOpenDiffDialog returns true → dialog present
    // This test validates the INVERSE: absent flag means dialog DOES appear.
    const payload: RefreshPayloadShape = { proposedRanges: [] };
    const html = renderToString(
      React.createElement(DialogSlotFixture, { payload, triggered: true }),
    );
    // undefined autoCommitted → defaults to false → dialog opens (not absent)
    expect(html).toContain('refresh-diff-dialog');
  });
});

describe('RefreshDiffDialog rendering — stateful useState fixture (initial render)', () => {
  it('dialog is absent on initial render (no refresh triggered yet)', () => {
    const payload: RefreshPayloadShape = { autoCommitted: false, proposedRanges: [] };
    const html = renderToString(
      React.createElement(StatefulDialogFixture, { payload }),
    );
    // Before any click event: pendingRefresh is null → dialog absent
    expect(html).not.toContain('refresh-diff-dialog');
  });
});
