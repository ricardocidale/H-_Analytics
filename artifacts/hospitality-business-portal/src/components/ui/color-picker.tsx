/**
 * color-picker.tsx — Popover-based color selector with preset swatches.
 *
 * Opens a popover with a grid of preset colors and a hex input field.
 * Used in the admin/theme settings to customize the platform's accent
 * colors and chart palette.
 */
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown } from "@/components/icons/themed-icons";

const PRESET_COLORS = [
  ["hsl(148, 52%, 31%)", "hsl(217, 91%, 60%)", "hsl(14, 88%, 65%)", "var(--primary)", "hsl(24, 100%, 98%)"],
  ["hsl(0, 100%, 38%)", "hsl(0, 100%, 50%)", "hsl(45, 100%, 50%)", "hsl(60, 100%, 50%)", "hsl(100, 53%, 57%)"],
  ["hsl(153, 100%, 35%)", "hsl(195, 100%, 47%)", "hsl(210, 100%, 38%)", "hsl(220, 100%, 19%)", "hsl(270, 50%, 41%)"],
  ["hsl(0, 0%, 0%)", "hsl(0, 0%, 25%)", "hsl(0, 0%, 50%)", "hsl(0, 0%, 75%)", "hsl(0, 0%, 100%)"],
  ["hsl(0, 73%, 89%)", "hsl(30, 100%, 90%)", "hsl(50, 100%, 91%)", "hsl(120, 39%, 87%)", "hsl(214, 89%, 92%)"],
  ["hsl(275, 39%, 87%)", "hsl(217, 92%, 76%)", "hsl(160, 60%, 71%)", "hsl(27, 96%, 61%)", "hsl(330, 81%, 71%)"],
];

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [customColor, setCustomColor] = useState(value);

  const handleColorSelect = (color: string) => {
    onChange(color);
    setOpen(false);
  };

  const handleCustomColorChange = (color: string) => {
    setCustomColor(color);
    onChange(color);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between px-3 h-9"
          data-testid="button-color-picker"
        >
          <div className="flex items-center gap-2">
            <div
              className="w-5 h-5 rounded border border-border shadow-sm"
              style={{ backgroundColor: value }}
            />
            <span className="font-mono text-xs uppercase">{value}</span>
          </div>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-3" align="start">
        <div className="space-y-3">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Theme Colors</div>
          <div className="space-y-1">
            {PRESET_COLORS.map((row, rowIndex) => (
              <div key={rowIndex} className="flex gap-1">
                {row.map((color) => (
                  <button
                    key={color}
                    onClick={() => handleColorSelect(color)}
                    className={`w-10 h-7 rounded border-2 transition-all hover:scale-110 hover:z-10 ${
                      value.toUpperCase() === color.toUpperCase()
                        ? "border-foreground ring-2 ring-gray-400"
                        : "border-border hover:border-border"
                    }`}
                    style={{ backgroundColor: color }}
                    title={color}
                    data-testid={`color-${color.replace("#", "")}`}
                  />
                ))}
              </div>
            ))}
          </div>

          <div className="pt-2 border-t">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Custom Color</div>
            <div className="flex gap-2">
              <input
                type="color"
                value={customColor}
                onChange={(e) => handleCustomColorChange(e.target.value)}
                className="w-10 h-9 rounded border cursor-pointer"
              />
              <Input
                value={customColor}
                onChange={(e) => handleCustomColorChange(e.target.value)}
                placeholder="e.g. red, blue"
                className="flex-1 font-mono text-xs uppercase"
              />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
