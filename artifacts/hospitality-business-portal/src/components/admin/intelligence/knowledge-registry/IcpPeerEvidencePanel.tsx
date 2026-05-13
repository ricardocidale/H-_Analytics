/**
 * IcpPeerEvidencePanel.tsx — Phase B U6
 *
 * Surfaced under Admin → AI → Intelligence → Knowledge & Resources → Tables →
 * ICP Peer Companies. Shows every peer's brand_archetype_split + roster size +
 * sample properties + citations as the Evidence the admin reviews before
 * regenerating the global bracket mix.
 *
 * Two interactions:
 *   - Per-peer Analyst button → POST /api/admin/icp/peers/:id/refresh
 *   - Header Analyst button   → POST /api/admin/icp/bracket-mix/global/regenerate
 *
 * Both actions go through the React Query + apiRequest convention
 * (`docs/solutions/conventions/react-query-apiRequest-querykey-convention-2026-05-05.md`).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "@/components/icons/themed-icons";

interface PeerEvidenceCitation {
  url: string;
  title?: string;
  snippet?: string;
}

interface PeerEvidenceSample {
  name: string;
  bracketSlug?: string;
  url?: string;
}

interface PeerRow {
  id: number;
  name: string;
  nicheTags: string[] | null;
  isActive: boolean;
  rosterSizeEstimate: number | null;
  lastResearchedAt: string | null;
  lastResearchRunId: number | null;
  splitEvidence: {
    citations: PeerEvidenceCitation[];
    sampleProperties: PeerEvidenceSample[];
  } | null;
}

interface PeersListResponse {
  peers: PeerRow[];
}

const PEERS_QUERY_KEY = ["/api/admin/icp/peers"] as const;

function PeerEvidenceCard({ peer }: { peer: PeerRow }) {
  const queryClient = useQueryClient();
  const refresh = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/icp/peers/${peer.id}/refresh`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PEERS_QUERY_KEY });
    },
  });

  const evidence = peer.splitEvidence;

  return (
    <Card className="p-4 space-y-3">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium">{peer.name}</h3>
          <p className="text-xs text-muted-foreground">
            {peer.nicheTags?.join(" · ") ?? "no tags"}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => refresh.mutate()}
          disabled={refresh.isPending}
          data-testid={`button-refresh-peer-${peer.id}`}
        >
          {refresh.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
          Analyst
        </Button>
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Roster estimate</dt>
        <dd>{peer.rosterSizeEstimate ?? "—"}</dd>
        <dt className="text-muted-foreground">Last researched</dt>
        <dd>{peer.lastResearchedAt ? new Date(peer.lastResearchedAt).toLocaleDateString() : "never"}</dd>
        <dt className="text-muted-foreground">Last run id</dt>
        <dd>{peer.lastResearchRunId ?? "—"}</dd>
      </dl>

      {evidence && (
        <details className="text-xs">
          <summary className="cursor-pointer">
            Evidence ({evidence.sampleProperties.length} sample properties,{" "}
            {evidence.citations.length} citations)
          </summary>
          <div className="mt-2 space-y-2">
            <div>
              <p className="font-medium">Sample properties</p>
              <ul className="list-disc list-inside text-muted-foreground">
                {evidence.sampleProperties.map((p, i) => (
                  <li key={i}>
                    {p.name}
                    {p.bracketSlug ? ` — ${p.bracketSlug}` : ""}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-medium">Citations</p>
              <ul className="list-disc list-inside text-muted-foreground">
                {evidence.citations.map((c, i) => (
                  <li key={i}>
                    <a className="underline" href={c.url} target="_blank" rel="noreferrer">
                      {c.title ?? c.url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </details>
      )}
    </Card>
  );
}

export function IcpPeerEvidencePanel() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery<PeersListResponse>({
    queryKey: PEERS_QUERY_KEY,
  });

  const regenerateGlobal = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/icp/bracket-mix/global/regenerate");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PEERS_QUERY_KEY });
    },
  });

  if (isLoading) {
    return (
      <Card className="p-6 flex items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin" />
      </Card>
    );
  }
  if (error || !data) {
    return (
      <Card className="p-6 text-sm text-destructive">
        Failed to load peer registry.
      </Card>
    );
  }

  return (
    <section className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">ICP Peer Companies</h2>
          <p className="text-xs text-muted-foreground">
            Hugo aggregates these peers&apos; brand archetype splits into the global
            default bracket mix. Run the Analyst on a single peer to refresh that
            row, or regenerate the global aggregate.
          </p>
        </div>
        <Button
          variant="default"
          onClick={() => regenerateGlobal.mutate()}
          disabled={regenerateGlobal.isPending}
          data-testid="button-regenerate-global-bracket-mix"
        >
          {regenerateGlobal.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
          Analyst — Regenerate global mix
        </Button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {data.peers.map((peer) => (
          <PeerEvidenceCard key={peer.id} peer={peer} />
        ))}
      </div>
    </section>
  );
}
