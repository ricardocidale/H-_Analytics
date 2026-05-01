import * as React from "react";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown } from "@/components/icons/themed-icons";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

interface CityComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
  cities: { name: string }[];
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  "data-testid"?: string;
}

export function CityCombobox({
  value,
  onValueChange,
  cities,
  disabled = false,
  placeholder = "Select city",
  className,
  "data-testid": testId,
}: CityComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const handleSelect = (cityName: string) => {
    onValueChange(cityName);
    setOpen(false);
    setSearch("");
  };

  const handleUseCustom = () => {
    if (search.trim()) {
      onValueChange(search.trim());
      setOpen(false);
      setSearch("");
    }
  };

  const handleClear = () => {
    onValueChange("");
    setOpen(false);
    setSearch("");
  };

  const normalizedSearch = search.trim().toLowerCase();
  const exactMatch = cities.some(
    (c) => c.name.toLowerCase() === normalizedSearch
  );
  const showCustomOption = normalizedSearch.length > 0 && !exactMatch;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && showCustomOption) {
      e.preventDefault();
      handleUseCustom();
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !value && "text-muted-foreground",
            className
          )}
          data-testid={testId}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={true} onKeyDown={handleKeyDown}>
          <CommandInput
            placeholder="Search or type a city..."
            value={search}
            onValueChange={setSearch}
            data-testid={testId ? `${testId}-search` : undefined}
          />
          <CommandList>
            <CommandEmpty>
              {normalizedSearch.length > 0 ? (
                <button
                  type="button"
                  className="w-full px-2 py-1.5 text-sm text-left cursor-pointer hover:bg-accent rounded-sm"
                  onClick={handleUseCustom}
                  data-testid={testId ? `${testId}-custom` : undefined}
                >
                  Use "<span className="font-medium">{search.trim()}</span>"
                </button>
              ) : (
                "No cities found."
              )}
            </CommandEmpty>
            <CommandGroup>
              {value && (
                <CommandItem value="__clear__" onSelect={handleClear}>
                  <span className="text-muted-foreground">None</span>
                </CommandItem>
              )}
              {showCustomOption && (
                <CommandItem
                  value={`__custom__${search.trim()}`}
                  onSelect={handleUseCustom}
                  data-testid={testId ? `${testId}-custom` : undefined}
                >
                  Use "<span className="font-medium">{search.trim()}</span>"
                </CommandItem>
              )}
              {cities.map((c) => (
                <CommandItem
                  key={c.name}
                  value={c.name}
                  onSelect={() => handleSelect(c.name)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === c.name ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {c.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
