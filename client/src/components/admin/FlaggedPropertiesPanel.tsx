import { useProperties } from "@/lib/api";
import { ValidationStatusBadge } from "@/components/analyst";
import { Link } from "wouter";
import { IconAlertTriangle, IconProperties } from "@/components/icons";

export default function FlaggedPropertiesPanel() {
  const { data: properties = [] } = useProperties();

  const flaggedOrPending = properties.filter(
    p => p.validationStatus === "flagged" || p.validationStatus === "pending_validation"
  );

  const flagged = flaggedOrPending.filter(p => p.validationStatus === "flagged");
  const pending = flaggedOrPending.filter(p => p.validationStatus === "pending_validation");
  const totalFlags = flagged.reduce((sum, p) => sum + (p.flaggedFieldCount ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <IconAlertTriangle className="w-5 h-5 text-red-500" />
        <h3 className="text-lg font-display text-foreground">The Analyst — Flagged Properties</h3>
      </div>

      {flaggedOrPending.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-6 text-center">
          <IconProperties className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
          <p className="text-sm text-muted-foreground">All properties are validated. No flags or pending reviews.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border bg-card p-3 text-center">
              <p className="text-2xl font-bold text-red-500" data-testid="text-flagged-count">{flagged.length}</p>
              <p className="text-xs text-muted-foreground">Flagged</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3 text-center">
              <p className="text-2xl font-bold text-amber-500" data-testid="text-pending-count">{pending.length}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3 text-center">
              <p className="text-2xl font-bold text-foreground" data-testid="text-total-flags">{totalFlags}</p>
              <p className="text-xs text-muted-foreground">Total Flags</p>
            </div>
          </div>

          <div className="space-y-2">
            {flaggedOrPending.map(p => (
              <Link key={p.id} href={`/property/${p.id}/edit`}>
                <div
                  className="rounded-lg border border-border bg-card p-3 flex items-center justify-between hover:bg-accent/50 transition-colors cursor-pointer"
                  data-testid={`admin-flagged-property-${p.id}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{p.location}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <ValidationStatusBadge property={p} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
