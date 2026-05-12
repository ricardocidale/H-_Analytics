import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { adminFetch } from "@/components/admin/hooks";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { AnalystActionButton } from "@/components/analyst";
import AnalystRefreshTheater from "../AnalystRefreshTheater";
import ReferenceBrandsGrid, { type BrandSummary } from "../ReferenceBrandsGrid";
import { FreshnessBadge } from "./FreshnessBadge";
import { VectorChunkViewer } from "./VectorChunkViewer";
import { ChevronDown, ChevronRight } from "@/components/icons/themed-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RegistryEntry {
  id: string;
  displayName: string;
  description: string;
  howBuilt: string;
  sourceDescription: string;
  renewalMechanism: string;
  assetType: string;
  assetRef: string;
  lastRefreshedAt: string | null;
  liveCount: number | null;
}

interface Range {
  dimensionKey: string;
  label: string;
  unit: string;
  valueLow: number | null;
  valueMid: number | null;
  valueHigh: number | null;
}

interface AnalystTableRow {
  id: string;
  label: string;
  ranges: Range[];
  brands?: BrandSummary[];
}

interface CountryRow {
  countryCode: string;
  countryName: string;
  inflationRate: string | null;
  fxRateToUsd: string | null;
  gdpGrowthRate: string | null;
  interestRate: string | null;
  sourcedAt: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: string | null | undefined): string {
  if (n == null) return "—";
  const v = parseFloat(n);
  return isNaN(v) ? "—" : v.toFixed(2);
}

function fmtPct(n: string | null | undefined): string {
  if (n == null) return "—";
  const v = parseFloat(n);
  return isNaN(v) ? "—" : `${v.toFixed(2)}%`;
}

function fmtCount(liveCount: number | null, assetType: string): string {
  if (liveCount == null) return "—";
  if (assetType === "vector_namespace") return `${liveCount.toLocaleString()} chunks`;
  return `${liveCount.toLocaleString()} rows`;
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

// Asset refs that have no batch regeneration path
const NO_BATCH_REFRESH = new Set(["assumption-guidance", "comparables"]);

function hasRefreshButton(entry: RegistryEntry): boolean {
  if (entry.assetType === "vector_namespace") return !NO_BATCH_REFRESH.has(entry.assetRef);
  return (
    entry.assetType === "benchmark_table" ||
    entry.assetType === "benchmark_brands" ||
    entry.assetType === "country_data" ||
    entry.assetType === "catalog_table"
  );
}

function regenerateUrl(entry: RegistryEntry): string {
  return `/api/admin/knowledge-registry/${entry.id}/regenerate`;
}

// ── Type-specific content viewers ─────────────────────────────────────────────

function RangesGrid({ ranges }: { ranges: Range[] }) {
  if (ranges.length === 0) {
    return <p className="text-sm text-muted-foreground">No ranges available.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="text-left py-1.5 pr-4 font-medium">Dimension</th>
            <th className="text-right py-1.5 px-2 font-medium">Low</th>
            <th className="text-right py-1.5 px-2 font-medium">Mid</th>
            <th className="text-right py-1.5 px-2 font-medium">High</th>
            <th className="text-right py-1.5 pl-2 font-medium">Unit</th>
          </tr>
        </thead>
        <tbody>
          {ranges.map((r) => (
            <tr key={r.dimensionKey} className="border-b border-border/50">
              <td className="py-1.5 pr-4 text-foreground/90">{r.label}</td>
              <td className="text-right py-1.5 px-2 tabular-nums">
                {r.valueLow != null ? r.valueLow.toLocaleString() : "—"}
              </td>
              <td className="text-right py-1.5 px-2 tabular-nums font-medium">
                {r.valueMid != null ? r.valueMid.toLocaleString() : "—"}
              </td>
              <td className="text-right py-1.5 px-2 tabular-nums">
                {r.valueHigh != null ? r.valueHigh.toLocaleString() : "—"}
              </td>
              <td className="text-right py-1.5 pl-2 text-muted-foreground">{r.unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompactCountryTable({ rows }: { rows: CountryRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No country data available.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="text-left py-1.5 pr-4 font-medium">Country</th>
            <th className="text-right py-1.5 px-2 font-medium">Inflation</th>
            <th className="text-right py-1.5 px-2 font-medium">FX / USD</th>
            <th className="text-right py-1.5 px-2 font-medium">GDP Growth</th>
            <th className="text-right py-1.5 pl-2 font-medium">Interest</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.countryCode} className="border-b border-border/50">
              <td className="py-1.5 pr-4">
                <span className="font-mono text-[10px] text-muted-foreground mr-1">{r.countryCode}</span>
                {r.countryName}
              </td>
              <td className="text-right py-1.5 px-2 tabular-nums">{fmtPct(r.inflationRate)}</td>
              <td className="text-right py-1.5 px-2 tabular-nums">{fmt(r.fxRateToUsd)}</td>
              <td className="text-right py-1.5 px-2 tabular-nums">{fmtPct(r.gdpGrowthRate)}</td>
              <td className="text-right py-1.5 pl-2 tabular-nums">{fmtPct(r.interestRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── IcpBracketCatalogViewer ───────────────────────────────────────────────────

interface IcpBracket {
  id: number;
  slug: string;
  name: string;
  archetype_label: string;
  customer_type: string;
  service_consumption_profile: string;
  target_adr_band_low: number | null;
  target_adr_band_high: number | null;
  comp_set_names: string[] | null;
  description: string | null;
  source_note: string | null;
  is_active: boolean;
  sort_order: number;
}

interface BracketFormState {
  slug: string;
  name: string;
  archetypeLabel: string;
  customerType: "hotel" | "str";
  serviceConsumptionProfile: "full" | "str_only";
  targetAdrBandLow: string;
  targetAdrBandHigh: string;
  compSetNames: string;
  description: string;
  sourceNote: string;
  sortOrder: string;
}

const EMPTY_BRACKET_FORM: BracketFormState = {
  slug: "",
  name: "",
  archetypeLabel: "",
  customerType: "hotel",
  serviceConsumptionProfile: "full",
  targetAdrBandLow: "",
  targetAdrBandHigh: "",
  compSetNames: "",
  description: "",
  sourceNote: "",
  sortOrder: "",
};

function bracketToForm(b: IcpBracket): BracketFormState {
  return {
    slug: b.slug,
    name: b.name,
    archetypeLabel: b.archetype_label,
    customerType: b.customer_type === "str" ? "str" : "hotel",
    serviceConsumptionProfile: b.service_consumption_profile === "str_only" ? "str_only" : "full",
    targetAdrBandLow: b.target_adr_band_low != null ? String(b.target_adr_band_low) : "",
    targetAdrBandHigh: b.target_adr_band_high != null ? String(b.target_adr_band_high) : "",
    compSetNames: (b.comp_set_names ?? []).join(", "),
    description: b.description ?? "",
    sourceNote: b.source_note ?? "",
    sortOrder: String(b.sort_order),
  };
}

interface BracketPayload {
  slug: string;
  name: string;
  archetypeLabel: string;
  customerType: "hotel" | "str";
  serviceConsumptionProfile: "full" | "str_only";
  targetAdrBandLow: number | null;
  targetAdrBandHigh: number | null;
  compSetNames: string[] | null;
  description: string | null;
  sourceNote: string | null;
  sortOrder?: number;
}

function formToPayload(f: BracketFormState): { ok: true; value: BracketPayload } | { ok: false; error: string } {
  if (!f.slug.trim()) return { ok: false, error: "Slug is required" };
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(f.slug.trim())) {
    return { ok: false, error: "Slug must be kebab-case (lowercase letters, digits, hyphens)" };
  }
  if (!f.name.trim()) return { ok: false, error: "Name is required" };
  if (!f.archetypeLabel.trim()) return { ok: false, error: "Archetype label is required" };

  const parseNum = (s: string): number | null => {
    const trimmed = s.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : NaN;
  };
  const low = parseNum(f.targetAdrBandLow);
  const high = parseNum(f.targetAdrBandHigh);
  if (Number.isNaN(low)) return { ok: false, error: "ADR band low must be a number" };
  if (Number.isNaN(high)) return { ok: false, error: "ADR band high must be a number" };

  const sortOrderRaw = f.sortOrder.trim();
  let sortOrder: number | undefined;
  if (sortOrderRaw) {
    const n = Number(sortOrderRaw);
    if (!Number.isInteger(n) || n < 0) return { ok: false, error: "Sort order must be a non-negative integer" };
    sortOrder = n;
  }

  const compSetNames = f.compSetNames
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    ok: true,
    value: {
      slug: f.slug.trim(),
      name: f.name.trim(),
      archetypeLabel: f.archetypeLabel.trim(),
      customerType: f.customerType,
      serviceConsumptionProfile: f.serviceConsumptionProfile,
      targetAdrBandLow: low,
      targetAdrBandHigh: high,
      compSetNames: compSetNames.length > 0 ? compSetNames : null,
      description: f.description.trim() || null,
      sourceNote: f.sourceNote.trim() || null,
      sortOrder,
    },
  };
}

function BracketEditorDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: IcpBracket | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<BracketFormState>(() =>
    editing ? bracketToForm(editing) : EMPTY_BRACKET_FORM,
  );
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (payload: BracketPayload) => {
      const url = editing
        ? `/api/admin/knowledge-registry/icp-bracket-catalog/data/${editing.id}`
        : `/api/admin/knowledge-registry/icp-bracket-catalog/data`;
      const method = editing ? "PATCH" : "POST";
      const res = await apiRequest(method, url, payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: editing ? "Bracket updated" : "Bracket created" });
      onSaved();
      onOpenChange(false);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  function handleSubmit() {
    setError(null);
    const result = formToPayload(form);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    mutation.mutate(result.value);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) {
          setForm(editing ? bracketToForm(editing) : EMPTY_BRACKET_FORM);
          setError(null);
        }
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit bracket — ${editing.name}` : "Add bracket"}</DialogTitle>
          <DialogDescription>
            Brackets are shared across all Management Companies. Soft-delete a bracket via the “Retire”
            action on the catalog row instead of removing it here.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
          <div className="space-y-1">
            <Label htmlFor="icp-bracket-slug">Slug</Label>
            <Input
              id="icp-bracket-slug"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              placeholder="boutique-upscale-hotel"
              disabled={!!editing}
              data-testid="input-icp-bracket-slug"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="icp-bracket-name">Name</Label>
            <Input
              id="icp-bracket-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              data-testid="input-icp-bracket-name"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="icp-bracket-archetype">Archetype label</Label>
            <Input
              id="icp-bracket-archetype"
              value={form.archetypeLabel}
              onChange={(e) => setForm({ ...form, archetypeLabel: e.target.value })}
              placeholder="Hotel · Upscale"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="icp-bracket-customer">Customer type</Label>
            <Select
              value={form.customerType}
              onValueChange={(v) => setForm({ ...form, customerType: v as "hotel" | "str" })}
            >
              <SelectTrigger id="icp-bracket-customer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hotel">Hotel</SelectItem>
                <SelectItem value="str">STR</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="icp-bracket-profile">Service consumption profile</Label>
            <Select
              value={form.serviceConsumptionProfile}
              onValueChange={(v) =>
                setForm({ ...form, serviceConsumptionProfile: v as "full" | "str_only" })
              }
            >
              <SelectTrigger id="icp-bracket-profile">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full">Full (all service lines)</SelectItem>
                <SelectItem value="str_only">STR-only (marketing + bonus)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="icp-bracket-sort">Sort order</Label>
            <Input
              id="icp-bracket-sort"
              type="number"
              min={0}
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
              placeholder="0"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="icp-bracket-adr-low">Target ADR band low (USD)</Label>
            <Input
              id="icp-bracket-adr-low"
              type="number"
              min={0}
              value={form.targetAdrBandLow}
              onChange={(e) => setForm({ ...form, targetAdrBandLow: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="icp-bracket-adr-high">Target ADR band high (USD)</Label>
            <Input
              id="icp-bracket-adr-high"
              type="number"
              min={0}
              value={form.targetAdrBandHigh}
              onChange={(e) => setForm({ ...form, targetAdrBandHigh: e.target.value })}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="icp-bracket-compset">Comp set (comma-separated brand names)</Label>
            <Input
              id="icp-bracket-compset"
              value={form.compSetNames}
              onChange={(e) => setForm({ ...form, compSetNames: e.target.value })}
              placeholder="Auberge Resorts, Kimpton, Autograph Collection"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="icp-bracket-description">Description</Label>
            <Textarea
              id="icp-bracket-description"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="icp-bracket-source">Source note</Label>
            <Input
              id="icp-bracket-source"
              value={form.sourceNote}
              onChange={(e) => setForm({ ...form, sourceNote: e.target.value })}
              placeholder="HVS Fee Survey 2024 · STR Boutique Benchmarking Report 2024"
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive" data-testid="text-icp-bracket-error">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={mutation.isPending}
            data-testid="button-icp-bracket-save"
          >
            {mutation.isPending ? "Saving…" : editing ? "Save changes" : "Create bracket"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IcpBracketCatalogViewer() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<IcpBracket | null>(null);

  const { data, isLoading, isError } = useQuery<{ brackets: IcpBracket[] }>({
    queryKey: ["/api/admin/knowledge-registry/icp-bracket-catalog/data"],
    queryFn: adminFetch<{ brackets: IcpBracket[] }>(
      "/api/admin/knowledge-registry/icp-bracket-catalog/data",
      "Failed to load ICP bracket catalog",
    ),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = await apiRequest(
        "PATCH",
        `/api/admin/knowledge-registry/icp-bracket-catalog/data/${id}`,
        { isActive },
      );
      return res.json();
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/knowledge-registry/icp-bracket-catalog/data"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/knowledge-registry"] });
      toast({ title: vars.isActive ? "Bracket restored" : "Bracket retired" });
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  function handleAdd() {
    setEditing(null);
    setEditorOpen(true);
  }
  function handleEdit(b: IcpBracket) {
    setEditing(b);
    setEditorOpen(true);
  }
  function handleSaved() {
    qc.invalidateQueries({ queryKey: ["/api/admin/knowledge-registry/icp-bracket-catalog/data"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/knowledge-registry"] });
  }

  if (isLoading) return <p className="text-xs text-muted-foreground py-2">Loading…</p>;
  if (isError) return <p className="text-xs text-destructive py-2">Failed to load ICP bracket catalog.</p>;

  const brackets = data?.brackets ?? [];

  return (
    <div className="space-y-3">
      {isAdmin && (
        <div className="flex items-center justify-end">
          <Button size="sm" onClick={handleAdd} data-testid="button-icp-bracket-add">
            Add bracket
          </Button>
        </div>
      )}

      {brackets.length === 0 ? (
        <p className="text-sm text-muted-foreground">No brackets in catalog.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-1.5 pr-3 font-medium">Name</th>
                <th className="text-left py-1.5 px-2 font-medium">Type</th>
                <th className="text-left py-1.5 px-2 font-medium hidden sm:table-cell">Service Profile</th>
                <th className="text-right py-1.5 px-2 font-medium hidden md:table-cell">ADR Band (USD)</th>
                <th className="text-left py-1.5 px-2 font-medium hidden lg:table-cell">Sources</th>
                {isAdmin && <th className="text-right py-1.5 pl-2 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {brackets.map((b) => (
                <tr
                  key={b.slug}
                  className={`border-b border-border/50 align-top ${b.is_active ? "" : "opacity-50"}`}
                  data-testid={`row-icp-bracket-${b.slug}`}
                >
                  <td className="py-2 pr-3">
                    <div className="font-medium text-foreground/90 flex items-center gap-1.5">
                      {b.name}
                      {!b.is_active && (
                        <span className="text-[9px] uppercase tracking-wide text-muted-foreground border border-border rounded px-1 py-0.5">
                          Retired
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{b.archetype_label}</div>
                  </td>
                  <td className="py-2 px-2">
                    <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      b.customer_type === "hotel"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                    }`}>
                      {b.customer_type === "hotel" ? "Hotel" : "STR"}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-muted-foreground hidden sm:table-cell">
                    {b.service_consumption_profile === "full" ? "Full" : "STR-only"}
                  </td>
                  <td className="py-2 px-2 tabular-nums text-right hidden md:table-cell">
                    {b.target_adr_band_low != null && b.target_adr_band_high != null
                      ? `$${b.target_adr_band_low}–$${b.target_adr_band_high}`
                      : "—"}
                  </td>
                  <td className="py-2 px-2 text-muted-foreground hidden lg:table-cell">
                    {b.source_note ?? "—"}
                  </td>
                  {isAdmin && (
                    <td className="py-2 pl-2 text-right whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => handleEdit(b)}
                        data-testid={`button-icp-bracket-edit-${b.slug}`}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        disabled={toggleActiveMutation.isPending}
                        onClick={() =>
                          toggleActiveMutation.mutate({ id: b.id, isActive: !b.is_active })
                        }
                        data-testid={`button-icp-bracket-toggle-${b.slug}`}
                      >
                        {b.is_active ? "Retire" : "Restore"}
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">
        Consumers: Cecília (ICP agent), Marco (orchestrator). Starter brackets are seeded by code; admins can add new
        archetypes or retire (soft-delete) outdated ones without a code deploy. Retired brackets stay in the database
        so historical company bracket-mix references remain valid.
      </p>

      {isAdmin && editorOpen && (
        <BracketEditorDialog
          key={editing?.id ?? "new"}
          open={editorOpen}
          onOpenChange={setEditorOpen}
          editing={editing}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

// ── TypeSpecificViewer ────────────────────────────────────────────────────────

// Maps knowledge_registry.assetRef → analyst-tables id (3 original benchmark tables only)
const BENCHMARK_TABLE_ID: Record<string, string> = {
  "capital-raise": "capital_raise_benchmarks",
  "exit-multiples": "exit_multiples",
  "reference-brands": "reference_brands",
};

// The 4 reference data tables are populated by Analyst LLM refresh only;
// they are not backed by the analyst-tables API endpoint.
const REFERENCE_DATA_ASSET_REFS = new Set([
  "geography-dimension",
  "jurisdictional-taxes",
  "regulatory-fees",
  "market-cap-rates",
]);

function ReferenceDataViewer({ entry }: { entry: RegistryEntry }) {
  return (
    <div className="py-3 text-sm text-muted-foreground space-y-1">
      <p>
        {entry.liveCount != null && entry.liveCount > 0
          ? `${entry.liveCount.toLocaleString()} rows loaded.`
          : "No data yet — this table starts empty."}
      </p>
      <p className="text-xs">
        Click the Analyst button to run LLM research and populate this table.
        Rows are appended on each refresh; geography rows are upserted by ISO code.
      </p>
    </div>
  );
}

function TypeSpecificViewer({ entry }: { entry: RegistryEntry }) {
  if (entry.assetType === "vector_namespace") {
    return <VectorChunkViewer entryId={entry.id} />;
  }

  if (entry.assetType === "benchmark_table" || entry.assetType === "benchmark_brands") {
    if (REFERENCE_DATA_ASSET_REFS.has(entry.assetRef)) {
      return <ReferenceDataViewer entry={entry} />;
    }
    const tableId = BENCHMARK_TABLE_ID[entry.assetRef];
    return <BenchmarkViewer tableId={tableId} assetType={entry.assetType} />;
  }

  if (entry.assetType === "country_data") {
    return <CountryDataViewer />;
  }

  if (entry.assetType === "catalog_table" && entry.assetRef === "icp-bracket-catalog") {
    return <IcpBracketCatalogViewer />;
  }

  return null;
}

function BenchmarkViewer({ tableId, assetType }: { tableId: string; assetType: string }) {
  const { data: tables, isLoading, isError } = useQuery<AnalystTableRow[]>({
    queryKey: ["/api/admin/analyst-tables"],
    queryFn: adminFetch<AnalystTableRow[]>("/api/admin/analyst-tables", "Failed to load analyst tables"),
  });

  if (isLoading) return <p className="text-xs text-muted-foreground py-2">Loading…</p>;
  if (isError) return <p className="text-xs text-destructive py-2">Failed to load benchmark data.</p>;

  const table = tables?.find((t) => t.id === tableId);
  if (!table) return <p className="text-xs text-muted-foreground py-2">No data.</p>;

  if (assetType === "benchmark_brands" && table.brands != null) {
    return <ReferenceBrandsGrid brands={table.brands} />;
  }

  return <RangesGrid ranges={table.ranges} />;
}

function CountryDataViewer() {
  const { data: rows, isLoading, isError } = useQuery<CountryRow[]>({
    queryKey: ["/api/admin/knowledge-registry/country-economic-data"],
    queryFn: adminFetch<CountryRow[]>("/api/admin/knowledge-registry/country-economic-data", "Failed to load country economic data"),
  });

  if (isLoading) return <p className="text-xs text-muted-foreground py-2">Loading…</p>;
  if (isError) return <p className="text-xs text-destructive py-2">Failed to load country economic data.</p>;
  return <CompactCountryTable rows={rows ?? []} />;
}

// ── AssetPanel ─────────────────────────────────────────────────────────────────

interface Props {
  entry: RegistryEntry;
}

export function AssetPanel({ entry }: Props) {
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", regenerateUrl(entry), {});
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/knowledge-registry"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/knowledge-registry/country-economic-data"] });
      toast({ title: `${entry.displayName} refreshed` });
    },
    onError: (err: Error) => {
      toast({ title: "Refresh failed", description: err.message, variant: "destructive" });
    },
    onSettled: () => {
      setRefreshing(false);
    },
  });

  function handleAnalystClick() {
    setRefreshing(true);
    regenerateMutation.mutate();
  }

  return (
    <>
      {refreshing && (
        <AnalystRefreshTheater
          tableLabel={entry.displayName}
          onCancel={() => {
            setRefreshing(false);
            regenerateMutation.reset();
          }}
        />
      )}

      <Card className="overflow-hidden">
        <Collapsible open={open} onOpenChange={setOpen}>
          {/* Summary row */}
          <CollapsibleTrigger asChild>
            <button
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
              data-testid={`panel-trigger-${entry.id}`}
            >
              {open
                ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              }
              <span className="font-medium text-sm flex-1 min-w-0">{entry.displayName}</span>
              <div className="flex items-center gap-2 ml-auto flex-shrink-0">
                <FreshnessBadge
                  lastRefreshedAt={entry.lastRefreshedAt}
                  liveCount={entry.liveCount}
                />
                {entry.liveCount != null && (
                  <span className="text-xs text-muted-foreground tabular-nums hidden sm:block">
                    {fmtCount(entry.liveCount, entry.assetType)}
                  </span>
                )}
                {entry.lastRefreshedAt && (
                  <span className="text-xs text-muted-foreground hidden md:block">
                    {relativeTime(entry.lastRefreshedAt)}
                  </span>
                )}
                {hasRefreshButton(entry) && (
                  <span onClick={(e) => e.stopPropagation()}>
                    <AnalystActionButton
                      onClick={handleAnalystClick}
                      running={regenerateMutation.isPending}
                      testIdSuffix={entry.id}
                    />
                  </span>
                )}
              </div>
            </button>
          </CollapsibleTrigger>

          {/* Expanded content */}
          <CollapsibleContent>
            <div className="px-4 pb-4 pt-2 border-t space-y-4">
              {/* Type-specific viewer */}
              <TypeSpecificViewer entry={entry} />

              {/* Metadata footer */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 pt-2 border-t text-xs text-muted-foreground">
                <div>
                  <span className="font-medium text-foreground/70">About: </span>
                  {entry.description}
                </div>
                <div>
                  <span className="font-medium text-foreground/70">How built: </span>
                  {entry.howBuilt}
                </div>
                <div>
                  <span className="font-medium text-foreground/70">Sources: </span>
                  {entry.sourceDescription}
                </div>
                <div>
                  <span className="font-medium text-foreground/70">Renewal: </span>
                  {entry.renewalMechanism}
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    </>
  );
}
