/** Date-time display: "Jan 2, 2026, 12:30 PM" */
export function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** Session/event duration: "2h 15m", "30m", or "Active" */
export function formatDuration(startISO: string, endISO: string | null): string {
  if (!endISO) return "Active";
  const diffMs = new Date(endISO).getTime() - new Date(startISO).getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/** Format number with commas for input display (no $ sign). */
export function formatMoneyInput(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

/** Parse comma-formatted string back to number. */
export function parseMoneyInput(value: string): number {
  const v = parseFloat(value.replace(/,/g, '')); return Number.isFinite(v) ? v : 0;
}
