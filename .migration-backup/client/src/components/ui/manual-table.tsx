/**
 * manual-table.tsx — Simple string-based table for static data display.
 *
 * Renders a table from arrays of strings (headers + rows) without
 * needing the full Table component hierarchy. Used for quick data
 * summaries in tooltips, popovers, and research cards.
 */
import { cn } from "@/lib/utils";

interface ManualTableProps {
  headers: string[];
  rows: string[][];
  variant?: "dark" | "light";
}

export function ManualTable({ headers, rows, variant = "dark" }: ManualTableProps) {
  const isDark = variant === "dark";

  return (
    <div
      className={cn(
        "overflow-x-auto rounded-lg border",
        isDark ? "border-border" : "border-border",
      )}
    >
      <table className="w-full text-sm">
        <thead>
          <tr className={isDark ? "bg-muted" : "bg-muted"}>
            {headers.map((h, i) => (
              <th
                key={i}
                className={cn(
                  "px-4 py-3 text-left font-semibold whitespace-nowrap",
                  isDark ? "text-foreground" : "text-foreground",
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={ri}
              className={cn(
                "border-t transition-colors",
                isDark
                  ? "bg-card border-border hover:bg-muted"
                  : "border-border hover:bg-muted",
              )}
            >
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={cn(
                    "px-4 py-2.5",
                    isDark ? "text-foreground" : "text-foreground",
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
