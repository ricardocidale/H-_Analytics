/**
 * CurrencyInput.tsx — Formatted dollar-amount input field.
 *
 * Wraps a standard text input with automatic currency formatting:
 *   • While focused: shows the raw numeric value for easy editing
 *   • While blurred: formats with dollar sign and thousands separators
 *     (e.g. "$1,250,000")
 *
 * Accepts an initial numeric value and calls onChange with the parsed
 * number when the user finishes editing. Used primarily in the
 * AddPropertyDialog for purchase price, renovation budget, etc.
 */
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";

function formatCurrencyDisplay(value: number): string {
  if (!value) return "";
  return new Intl.NumberFormat("en-US").format(value);
}

function parseCurrencyInput(raw: string): number {
  const v = parseFloat(raw.replace(/[^0-9.]/g, "")); return Number.isFinite(v) ? v : 0;
}

export function CurrencyInput({
  value,
  onChange,
  id,
  testId,
  placeholder = "$0",
}: {
  value: number;
  onChange: (val: number) => void;
  id: string;
  testId: string;
  placeholder?: string;
}) {
  const [displayValue, setDisplayValue] = useState(value ? formatCurrencyDisplay(value) : "");
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setDisplayValue(value ? formatCurrencyDisplay(value) : "");
    }
  }, [value, isFocused]);

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
      <Input
        id={id}
        data-testid={testId}
        placeholder={placeholder}
        className="pl-7"
        value={isFocused ? displayValue : (value ? formatCurrencyDisplay(value) : "")}
        onFocus={() => {
          setIsFocused(true);
          setDisplayValue(value ? String(value) : "");
        }}
        onBlur={() => {
          setIsFocused(false);
          const parsed = parseCurrencyInput(displayValue);
          onChange(parsed);
        }}
        onChange={(e) => {
          setDisplayValue(e.target.value);
          const parsed = parseCurrencyInput(e.target.value);
          onChange(parsed);
        }}
      />
    </div>
  );
}
