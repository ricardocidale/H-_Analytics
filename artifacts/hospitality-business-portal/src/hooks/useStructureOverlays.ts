import { useMemo, useState } from "react";
import { type StructureOverlaysMap } from "@/lib/api/structure-comparison";
import {
  type OperatingStructureId,
} from "@shared/constants-operating-structures";

export interface UseStructureOverlaysReturn {
  pendingOverlays: StructureOverlaysMap;
  appliedOverlays: StructureOverlaysMap;
  overlaysDirty: boolean;
  updateOverlay: (
    id: OperatingStructureId,
    section: "feeOverlay" | "lease",
    field: string,
    value: number | undefined,
  ) => void;
  updateOverlayScalar: (
    id: OperatingStructureId,
    field: "capexFactor",
    value: number | undefined,
  ) => void;
  applyOverrides: () => void;
  resetOverrides: () => void;
}

export function useStructureOverlays(): UseStructureOverlaysReturn {
  const [pendingOverlays, setPendingOverlays] = useState<StructureOverlaysMap>({});
  const [appliedOverlays, setAppliedOverlays] = useState<StructureOverlaysMap>({});

  const overlaysDirty = useMemo(
    () => JSON.stringify(pendingOverlays) !== JSON.stringify(appliedOverlays),
    [pendingOverlays, appliedOverlays],
  );

  function updateOverlay(
    id: OperatingStructureId,
    section: "feeOverlay" | "lease",
    field: string,
    value: number | undefined,
  ) {
    setPendingOverlays((prev) => {
      const next = { ...prev };
      const patch = { ...(next[id] ?? {}) };
      const sub = { ...((patch[section] ?? {}) as Record<string, unknown>) };
      if (value === undefined || Number.isNaN(value)) {
        delete sub[field];
      } else {
        sub[field] = value;
      }
      if (Object.keys(sub).length === 0) {
        delete (patch as Record<string, unknown>)[section];
      } else {
        (patch as Record<string, unknown>)[section] = sub;
      }
      if (Object.keys(patch).length === 0) {
        delete next[id];
      } else {
        next[id] = patch;
      }
      return next;
    });
  }

  function updateOverlayScalar(
    id: OperatingStructureId,
    field: "capexFactor",
    value: number | undefined,
  ) {
    setPendingOverlays((prev) => {
      const next = { ...prev };
      const patch = { ...(next[id] ?? {}) };
      if (value === undefined || Number.isNaN(value)) {
        delete patch[field];
      } else {
        patch[field] = value;
      }
      if (Object.keys(patch).length === 0) {
        delete next[id];
      } else {
        next[id] = patch;
      }
      return next;
    });
  }

  function applyOverrides() {
    setAppliedOverlays(pendingOverlays);
  }

  function resetOverrides() {
    setPendingOverlays({});
    setAppliedOverlays({});
  }

  return {
    pendingOverlays,
    appliedOverlays,
    overlaysDirty,
    updateOverlay,
    updateOverlayScalar,
    applyOverrides,
    resetOverrides,
  };
}
