/**
 * SuspiciousActivityBanner.tsx — Small alert pinned above the Analyst
 * Tables list that appears when the server has flagged unusual refresh
 * volume in the last hour. The banner is informational; it doesn't block
 * the admin from continuing.
 */
import { AlertTriangle } from "lucide-react";

export default function SuspiciousActivityBanner({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div
      className="flex items-start gap-3 p-3 rounded border border-amber-500/40 bg-amber-500/10"
      role="alert"
      data-testid="banner-suspicious-activity"
    >
      <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
      <div className="text-xs">
        <div className="font-semibold text-amber-700">Unusual refresh activity detected</div>
        <div className="text-amber-700/80">
          More than five Analyst-Table refreshes happened in the last 10 minutes. Please verify
          that nothing automated is triggering refreshes.
        </div>
      </div>
    </div>
  );
}
