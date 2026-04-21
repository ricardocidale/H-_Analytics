import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { RESOURCE_KIND_LABELS, type ResourceKind, type ResourcePublicView } from "@shared/schema";
import { HealthDot, LastCheckedText, TestButton } from "./health-bits";
import {
  CreateResourceDialog, EditResourceDialog, VersionHistoryDialog, DeleteResourceDialog,
} from "./resource-dialogs";

const KIND_BLURBS: Record<ResourceKind, string> = {
  api: "Live external HTTP services (FRED, vendor proxies, etc.). Each row is wired to Specialists in code via the catalog.",
  source: "Bulk data sources and scrapers — periodic ingestion that lands in `data_sources` and downstream tables.",
  table: "Internal warehouse tables Specialists query. Health probe verifies the table exists in the schema.",
  benchmark: "Hospitality benchmark slugs (ADR, RevPAR, occupancy, etc.). Health probe verifies a snapshot is ingested.",
  model: "LLM model rows. Health probe verifies provider + secret wiring without firing a billable inference.",
};

interface ResourcesTabProps {
  kind: ResourceKind;
}

export default function ResourcesTab({ kind }: ResourcesTabProps) {
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ResourcePublicView | null>(null);
  const [historyTarget, setHistoryTarget] = useState<ResourcePublicView | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ResourcePublicView | null>(null);

  const { data: resources = [], isLoading, isError } = useQuery<ResourcePublicView[]>({
    queryKey: ["/api/admin/resources", kind],
    queryFn: async () => {
      const res = await fetch(`/api/admin/resources?kind=${kind}`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return resources;
    const q = search.toLowerCase();
    return resources.filter(
      (r) => r.slug.toLowerCase().includes(q)
        || r.displayName.toLowerCase().includes(q)
        || (r.description ?? "").toLowerCase().includes(q),
    );
  }, [resources, search]);

  return (
    <Card data-testid={`resources-tab-${kind}`}>
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle>{RESOURCE_KIND_LABELS[kind]}</CardTitle>
            <CardDescription>{KIND_BLURBS[kind]}</CardDescription>
          </div>
          <Button onClick={() => setCreateOpen(true)} data-testid={`button-create-${kind}`}>
            + New {kind}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-3">
          <Input
            placeholder={`Search ${RESOURCE_KIND_LABELS[kind].toLowerCase()}…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid={`input-search-${kind}`}
          />
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : isError ? (
          <p className="text-sm text-rose-600">Failed to load resources.</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {resources.length === 0 ? `No ${kind} resources yet — click "New ${kind}" to add one.` : "No matches for your search."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[36px]">Health</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Display name</TableHead>
                <TableHead>Secret</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Last checked</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id} data-testid={`row-resource-${r.id}`}>
                  <TableCell><HealthDot resourceId={r.id} /></TableCell>
                  <TableCell className="font-mono text-xs" data-testid={`text-slug-${r.id}`}>{r.slug}</TableCell>
                  <TableCell data-testid={`text-display-${r.id}`}>
                    <div className="font-medium">{r.displayName}</div>
                    {r.description && <div className="text-xs text-muted-foreground">{r.description}</div>}
                  </TableCell>
                  <TableCell>
                    {r.hasSecret
                      ? <Badge variant="secondary" data-testid={`badge-secret-${r.id}`}>set</Badge>
                      : <Badge variant="outline" data-testid={`badge-secret-${r.id}`}>—</Badge>}
                  </TableCell>
                  <TableCell className="font-mono text-xs">v{r.version}</TableCell>
                  <TableCell><LastCheckedText resourceId={r.id} /></TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      <TestButton resourceId={r.id} kindLabel={RESOURCE_KIND_LABELS[kind]} />
                      <Button size="sm" variant="ghost" data-testid={`button-edit-${r.id}`} onClick={() => setEditTarget(r)}>Edit</Button>
                      <Button size="sm" variant="ghost" data-testid={`button-history-${r.id}`} onClick={() => setHistoryTarget(r)}>History</Button>
                      <Button size="sm" variant="ghost" className="text-rose-600 hover:text-rose-700" data-testid={`button-delete-${r.id}`} onClick={() => setDeleteTarget(r)}>Delete</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <CreateResourceDialog kind={kind} open={createOpen} onOpenChange={setCreateOpen} />
      <EditResourceDialog resource={editTarget} open={editTarget !== null} onOpenChange={(o) => !o && setEditTarget(null)} />
      <VersionHistoryDialog resource={historyTarget} open={historyTarget !== null} onOpenChange={(o) => !o && setHistoryTarget(null)} />
      <DeleteResourceDialog resource={deleteTarget} open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)} />
    </Card>
  );
}
