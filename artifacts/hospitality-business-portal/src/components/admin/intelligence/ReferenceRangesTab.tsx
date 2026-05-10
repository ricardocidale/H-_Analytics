/**
 * ReferenceRangesTab — admin grid for the `reference_range` table.
 *
 * Lets admins filter the corpus of low/mid/high reference ranges by
 * domain, country, and year, create / edit / archive / restore rows,
 * and trigger an Analyst refresh when the server-side endpoint is
 * available.
 *
 * The original 1,000+ line implementation has been split (task-1360)
 * into a directory of focused sub-components under `./reference-ranges/`.
 * This file is the page shell — it owns local UI state (filters, form,
 * dialogs, analyst animation) and composes the sub-components. Data
 * fetching and the four CRUD mutations live in `useReferenceRanges`.
 * All UI behavior, mutations, query keys, toast messages, validation,
 * and data-testid attributes are preserved byte-identical to the
 * pre-split source.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { ArchiveConfirmation } from "./reference-ranges/ArchiveConfirmation";
import { EditDialog } from "./reference-ranges/EditDialog";
import { FilterBar } from "./reference-ranges/FilterBar";
import { RangesTable } from "./reference-ranges/RangesTable";
import { ANALYST_STEPS, ANY, EMPTY_FORM } from "./reference-ranges/constants";
import { formToPayload, rowToForm, validateForm } from "./reference-ranges/helpers";
import { useReferenceRanges } from "./reference-ranges/useReferenceRanges";
import type {
  DialogMode,
  FormState,
  ReferenceRangeRow,
} from "./reference-ranges/types";

export default function ReferenceRangesTab() {
  const [domain, setDomain] = useState<string>(ANY);
  const [country, setCountry] = useState<string>(ANY);
  const [year, setYear] = useState<string>(ANY);
  const [metricSearch, setMetricSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [analystStep, setAnalystStep] = useState<number | null>(null);
  const [analystError, setAnalystError] = useState<string | null>(null);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Dialog + mutation state
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ReferenceRangeRow | null>(null);

  useEffect(() => {
    return () => {
      for (const t of timeoutsRef.current) clearTimeout(t);
      timeoutsRef.current = [];
    };
  }, []);

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (domain !== ANY) p.set("domain", domain);
    if (country !== ANY) p.set("country", country);
    if (year !== ANY) p.set("year", year);
    if (metricSearch.trim()) p.set("metricKey", metricSearch.trim());
    if (showArchived) p.set("includeArchived", "true");
    return p.toString();
  }, [domain, country, year, metricSearch, showArchived]);

  const {
    rowsQuery,
    facetsQuery,
    createMutation,
    updateMutation,
    archiveMutation,
    restoreMutation,
    invalidateGrid,
  } = useReferenceRanges({
    queryParams,
    onMutationSuccess: () => setDialogMode(null),
    onMutationError: (message) => {
      if (/\b409\b/.test(message)) {
        setFormError("A range with that combination already exists.");
      } else {
        setFormError(message);
      }
    },
    onArchiveSuccess: () => setArchiveTarget(null),
  });

  const rows = rowsQuery.data?.rows ?? [];
  const rowsLoading = rowsQuery.isLoading;
  const facets = facetsQuery.data;

  const clearFilters = () => {
    setDomain(ANY);
    setCountry(ANY);
    setYear(ANY);
    setMetricSearch("");
  };

  const hasActiveFilter = domain !== ANY || country !== ANY || year !== ANY || metricSearch.trim().length > 0;

  const analystBusy = analystStep !== null && analystStep < ANALYST_STEPS.length - 1;

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setDialogMode({ kind: "create" });
  };

  const openEdit = (row: ReferenceRangeRow) => {
    setForm(rowToForm(row));
    setFormError(null);
    setDialogMode({ kind: "edit", row });
  };

  const handleSubmit = () => {
    setFormError(null);
    const validation = validateForm(form);
    if (validation) {
      setFormError(validation);
      return;
    }
    const payload = formToPayload(form);
    if (dialogMode?.kind === "edit") {
      updateMutation.mutate({ id: dialogMode.row.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const submitting = createMutation.isPending || updateMutation.isPending;

  const askTheAnalyst = async () => {
    if (analystStep !== null) return;
    setAnalystError(null);

    for (const t of timeoutsRef.current) clearTimeout(t);
    timeoutsRef.current = [];

    // Await the refresh endpoint before starting the animation so
    // a missing or failed backend surfaces honestly instead of
    // playing a success animation over a no-op.
    try {
      const res = await apiRequest("POST", "/api/admin/reference-ranges/refresh");
      // Drain the body so the connection closes cleanly; we don't use it.
      try { await res.json(); } catch { /* empty body is fine */ }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // 404 / 405 → endpoint not deployed yet. Any other error → surface as-is.
      const notWired = /\b404\b|\b405\b|Not Found|Method Not Allowed/i.test(message);
      setAnalystError(
        notWired
          ? "Analyst refresh isn't available yet. The grid below is current as of the last manual update."
          : `Analyst refresh failed: ${message}`,
      );
      // Auto-clear the error after 6s so the UI doesn't get stuck.
      timeoutsRef.current.push(setTimeout(() => setAnalystError(null), 6000));
      return;
    }

    setAnalystStep(0);
    timeoutsRef.current.push(setTimeout(() => setAnalystStep(1), 2000));
    timeoutsRef.current.push(setTimeout(() => setAnalystStep(2), 4000));
    timeoutsRef.current.push(setTimeout(() => setAnalystStep(3), 6000));
    timeoutsRef.current.push(
      setTimeout(() => {
        invalidateGrid();
      }, 8000),
    );
    // Keep the "Done." line visible ~3s after t=6s, then clear.
    timeoutsRef.current.push(setTimeout(() => setAnalystStep(null), 9000));
  };

  return (
    <div className="space-y-4" data-testid="reference-ranges-tab">
      <FilterBar
        domain={domain}
        country={country}
        year={year}
        metricSearch={metricSearch}
        showArchived={showArchived}
        analystStep={analystStep}
        analystError={analystError}
        analystBusy={analystBusy}
        hasActiveFilter={hasActiveFilter}
        facets={facets}
        setDomain={setDomain}
        setCountry={setCountry}
        setYear={setYear}
        setMetricSearch={setMetricSearch}
        setShowArchived={setShowArchived}
        onOpenCreate={openCreate}
        onAskAnalyst={askTheAnalyst}
        onClearFilters={clearFilters}
      />

      <RangesTable
        rows={rows}
        rowsLoading={rowsLoading}
        hasActiveFilter={hasActiveFilter}
        restorePending={restoreMutation.isPending}
        onRestore={(id) => restoreMutation.mutate(id)}
        onEdit={openEdit}
        onArchive={setArchiveTarget}
      />

      <EditDialog
        dialogMode={dialogMode}
        form={form}
        formError={formError}
        submitting={submitting}
        onClose={() => setDialogMode(null)}
        onChange={setForm}
        onSubmit={handleSubmit}
      />

      <ArchiveConfirmation
        archiveTarget={archiveTarget}
        archivePending={archiveMutation.isPending}
        onClose={() => setArchiveTarget(null)}
        onConfirm={() => { if (archiveTarget) archiveMutation.mutate(archiveTarget.id); }}
      />
    </div>
  );
}
