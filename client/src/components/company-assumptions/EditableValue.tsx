/**
 * EditableValue.tsx — Inline-editable numeric display for company assumptions.
 *
 * Renders a formatted value (percentage or dollar amount) that switches to
 * a text input when clicked. On blur or Enter, the raw value is parsed,
 * validated, and committed via onChange.
 *
 * Display modes controlled by the `format` prop:
 *   • "percent" — shows "3.50%" and expects decimal input (0.035 stored)
 *   • "money"   — shows "$50,000" with thousands separators
 *   • "number"  — plain numeric display
 *
 * Used extensively across all company-assumptions sections so users can
 * tweak financial inputs without navigating to a separate form.
 */
import { useState } from "react";
import { formatPercent, formatMoney } from "@/lib/financialEngine";

export default function EditableValue({
  value,
  onChange,
  format,
  min,
  max,
  
}: {
  value: number;
  onChange: (v: number) => void;
  format: "percent" | "dollar" | "number";
  min: number;
  max: number;
  /** @deprecated EditableValue is a free-form text input; step has no effect. Accepted for call-site compatibility (Slider siblings still use it). */
  step?: number;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const displayValue = () => {
    if (format === "percent") return formatPercent(value);
    if (format === "dollar") return formatMoney(value);
    return value.toLocaleString();
  };

  const handleEdit = () => {
    if (format === "percent") {
      setInputValue((value * 100).toFixed(1));
    } else {
      setInputValue(value.toString());
    }
    setIsEditing(true);
  };

  const handleBlur = () => {
    setIsEditing(false);
    let numValue = parseFloat(inputValue);
    if (isNaN(numValue)) return;
    if (format === "percent") numValue = numValue / 100;
    numValue = Math.max(min, Math.min(max, numValue));
    onChange(numValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleBlur();
    } else if (e.key === "Escape") {
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        autoFocus
        className="w-24 px-1 py-0.5 text-right font-mono font-semibold border rounded bg-card border-primary/40 text-foreground"
      />
    );
  }

  return (
    <span
      onClick={handleEdit}
      className="cursor-pointer hover:text-secondary text-secondary font-mono font-semibold"
      title="Click to edit"
    >
      {displayValue()}
    </span>
  );
}
