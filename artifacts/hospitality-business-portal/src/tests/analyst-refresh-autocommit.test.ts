/**
 * Task #910 — Frontend auto-commit contract tests
 *
 * Pins the contract that governs whether the RefreshDiffDialog is shown
 * after a POST /api/admin/analyst-tables/:id/refresh response.
 *
 * The AnalystTables component calls shouldOpenDiffDialog(payload) to decide:
 *   false → auto-committed (reference_brands): skip dialog, show toast
 *   true  → manual review tables (capital_raise_benchmarks, exit_multiples):
 *            open RefreshDiffDialog so the admin can inspect and commit/discard
 *
 * Layer 1: Unit tests for the pure helpers (shouldOpenDiffDialog, toast description).
 * Layer 2: Simulated onSuccess interaction tests that mirror the exact callback
 *          in AnalystTables.tsx and verify RefreshDiffDialog is not triggered
 *          when autoCommitted is true.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  shouldOpenDiffDialog,
  buildAutoCommitToastDescription,
  type RefreshPayloadShape,
} from '@/lib/analyst-refresh-helpers';

function makePayload(overrides: Partial<RefreshPayloadShape> = {}): RefreshPayloadShape {
  return {
    autoCommitted: false,
    proposedRanges: [],
    ...overrides,
  };
}

describe('shouldOpenDiffDialog()', () => {
  it('returns false when autoCommitted is true (reference_brands path)', () => {
    const payload = makePayload({ autoCommitted: true, proposedRanges: [{ dimensionKey: 'brand_1' }] });
    expect(shouldOpenDiffDialog(payload)).toBe(false);
  });

  it('returns true when autoCommitted is false (capital_raise_benchmarks / exit_multiples path)', () => {
    const payload = makePayload({ autoCommitted: false });
    expect(shouldOpenDiffDialog(payload)).toBe(true);
  });

  it('diff dialog IS shown for non-auto-committed tables regardless of proposedRanges length', () => {
    const withRanges = makePayload({
      autoCommitted: false,
      proposedRanges: [{ dimensionKey: 'seed' }, { dimensionKey: 'series_a' }],
    });
    expect(shouldOpenDiffDialog(withRanges)).toBe(true);
  });

  it('diff dialog is NOT shown for auto-committed table even with many ranges', () => {
    const withRanges = makePayload({
      autoCommitted: true,
      proposedRanges: Array.from({ length: 20 }, (_, i) => ({ dimensionKey: `brand_${i}` })),
    });
    expect(shouldOpenDiffDialog(withRanges)).toBe(false);
  });

  it('empty proposedRanges + autoCommitted: true still skips diff dialog', () => {
    const payload = makePayload({ autoCommitted: true, proposedRanges: [] });
    expect(shouldOpenDiffDialog(payload)).toBe(false);
  });
});

describe('buildAutoCommitToastDescription()', () => {
  it('formats the brand count correctly when brands are present', () => {
    const payload = makePayload({
      autoCommitted: true,
      proposedRanges: [
        { dimensionKey: 'brand_1' },
        { dimensionKey: 'brand_2' },
        { dimensionKey: 'brand_3' },
      ],
    });
    const msg = buildAutoCommitToastDescription(payload);
    expect(msg).toContain('3');
    expect(msg).toContain('auto-committed');
  });

  it('formats zero brands gracefully', () => {
    const payload = makePayload({ autoCommitted: true, proposedRanges: [] });
    const msg = buildAutoCommitToastDescription(payload);
    expect(msg).toContain('0');
  });

  it('always mentions auto-committed to make the action clear to the admin', () => {
    const payload = makePayload({ autoCommitted: true, proposedRanges: [{ dimensionKey: 'brand_1' }] });
    expect(buildAutoCommitToastDescription(payload)).toMatch(/auto-committed/i);
  });
});

describe('auto-commit branching — architectural contract', () => {
  it('autoCommitted=true and autoCommitted=false are mutually exclusive in dialog routing', () => {
    const autoCommittedPayload = makePayload({ autoCommitted: true });
    const manualPayload = makePayload({ autoCommitted: false });

    const showDialogForAutoCommit = shouldOpenDiffDialog(autoCommittedPayload);
    const showDialogForManual = shouldOpenDiffDialog(manualPayload);

    expect(showDialogForAutoCommit).toBe(false);
    expect(showDialogForManual).toBe(true);
    expect(showDialogForAutoCommit).not.toBe(showDialogForManual);
  });
});

// ── Layer 2: Simulated onSuccess interaction tests ────────────────────────────
// These tests mirror the exact onSuccess callback logic from AnalystTables.tsx:
//
//   onSuccess: (payload) => {
//     if (!shouldOpenDiffDialog(payload)) {
//       setTheaterTable(null);
//       toast({ title: "Brands updated", description: buildAutoCommitToastDescription(payload) });
//       qc.invalidateQueries({ queryKey: ["/api/admin/analyst-tables"] });
//     } else {
//       setPendingRefresh(payload); // <-- this triggers RefreshDiffDialog rendering
//     }
//   }
//
// By simulating this callback and checking whether setPendingRefresh was called,
// we can assert that RefreshDiffDialog is NOT triggered for reference_brands.
describe('AnalystTables onSuccess handler — RefreshDiffDialog not shown for auto-commit', () => {
  function makeOnSuccessHandler(deps: {
    setPendingRefresh: (p: RefreshPayloadShape) => void;
    setTheaterTable: (t: null) => void;
    toast: (opts: { title: string; description: string }) => void;
    invalidateQueries: (opts: { queryKey: string[] }) => void;
  }) {
    return (payload: RefreshPayloadShape) => {
      if (!shouldOpenDiffDialog(payload)) {
        deps.setTheaterTable(null);
        deps.toast({ title: 'Brands updated', description: buildAutoCommitToastDescription(payload) });
        deps.invalidateQueries({ queryKey: ['/api/admin/analyst-tables'] });
      } else {
        deps.setPendingRefresh(payload);
      }
    };
  }

  it('autoCommitted: true — setPendingRefresh NOT called (RefreshDiffDialog not shown)', () => {
    const setPendingRefresh = vi.fn();
    const setTheaterTable = vi.fn();
    const toast = vi.fn();
    const invalidateQueries = vi.fn();
    const onSuccess = makeOnSuccessHandler({ setPendingRefresh, setTheaterTable, toast, invalidateQueries });

    onSuccess(makePayload({
      autoCommitted: true,
      proposedRanges: [{ dimensionKey: 'brand_1' }, { dimensionKey: 'brand_2' }],
    }));

    expect(setPendingRefresh).not.toHaveBeenCalled();
    expect(setTheaterTable).toHaveBeenCalledWith(null);
    expect(toast).toHaveBeenCalledOnce();
    expect(invalidateQueries).toHaveBeenCalledOnce();
  });

  it('autoCommitted: true — toast description mentions the brand count', () => {
    const toast = vi.fn();
    const onSuccess = makeOnSuccessHandler({
      setPendingRefresh: vi.fn(),
      setTheaterTable: vi.fn(),
      toast,
      invalidateQueries: vi.fn(),
    });

    onSuccess(makePayload({
      autoCommitted: true,
      proposedRanges: Array.from({ length: 18 }, (_, i) => ({ dimensionKey: `brand_${i}` })),
    }));

    expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      description: expect.stringContaining('18'),
    }));
  });

  it('autoCommitted: false — setPendingRefresh IS called (RefreshDiffDialog WILL show)', () => {
    const setPendingRefresh = vi.fn();
    const setTheaterTable = vi.fn();
    const toast = vi.fn();
    const onSuccess = makeOnSuccessHandler({
      setPendingRefresh,
      setTheaterTable,
      toast,
      invalidateQueries: vi.fn(),
    });
    const payload = makePayload({ autoCommitted: false, proposedRanges: [{ dimensionKey: 'seed' }] });

    onSuccess(payload);

    expect(setPendingRefresh).toHaveBeenCalledWith(payload);
    expect(setTheaterTable).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('autoCommitted absent (undefined) — treated as false, dialog IS shown', () => {
    const setPendingRefresh = vi.fn();
    const onSuccess = makeOnSuccessHandler({
      setPendingRefresh,
      setTheaterTable: vi.fn(),
      toast: vi.fn(),
      invalidateQueries: vi.fn(),
    });

    onSuccess({ proposedRanges: [] }); // autoCommitted not set (non-reference_brands response)

    expect(setPendingRefresh).toHaveBeenCalledOnce();
  });
});
