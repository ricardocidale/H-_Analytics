/**
 * editable-value.tsx — Inline-editable display value with format-aware input.
 *
 * Shows a formatted value (dollar, percent, months, or number) as static
 * text. On click, transforms into an input field for editing. On blur or
 * Enter, parses the input back into the appropriate numeric type and calls
 * onChange. Used in assumption tables where values are displayed inline
 * but need to be editable without opening a separate form.
 */
import { useState, useRef } from "react";
import { cn } from "@/lib/utils";

type EditableValueFormat = "percent" | "dollar" | "months" | "number";

interface EditableValueProps {
  value: number;
  onChange: (val: number) => void;
  format?: EditableValueFormat;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}

function formatDisplay(value: number, format: EditableValueFormat): string {
  switch (format) {
    case "percent":
      return `${value.toFixed(1)}%`;
    case "dollar":
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
    case "months":
      return `${value} mo`;
    default:
      return value.toLocaleString();
  }
}

export function EditableValue({
  value,
  onChange,
  format = "percent",
  min = 0,
  max = 100,
  step = 1,
  className,
}: EditableValueProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    setInputValue(value.toString());
    setIsEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const handleBlur = () => {
    setIsEditing(false);
    let parsed = parseFloat(inputValue);
    if (!isNaN(parsed)) {
      parsed = Math.max(min, Math.min(max, parsed));
      onChange(parsed);
    }
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
        ref={inputRef}
        type="number"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={cn(
          "w-16 text-sm font-mono font-semibold text-primary bg-transparent border-b border-primary outline-none text-right",
          className
        )}
        step={step}
        min={min}
        max={max}
        autoFocus
      />
    );
  }

  return (
    <span
      onClick={handleClick}
      className={cn(
        "text-sm font-mono font-semibold text-primary cursor-pointer hover:underline",
        className
      )}
      title="Click to edit"
    >
      {formatDisplay(value, format)}
    </span>
  );
}
