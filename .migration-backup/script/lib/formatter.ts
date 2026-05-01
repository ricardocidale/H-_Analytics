/**
 * Shared console formatting utilities for diagnostic scripts.
 */

const DEFAULT_WIDTH = 44;

/** Print a header with title and separator line. */
export function header(title: string, width: number = DEFAULT_WIDTH): void {
  console.log(`\n  ${title}`);
  console.log("  " + "\u2500".repeat(width));
}

/** Print a footer separator line. */
export function footer(width: number = DEFAULT_WIDTH): void {
  console.log("  " + "\u2500".repeat(width));
}

/** Print an aligned status line with icon, label, and value. */
export function statusLine(icon: string, label: string, value: string, labelWidth: number = 16): void {
  console.log(`  ${icon} ${label.padEnd(labelWidth)} ${value}`);
}
