import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X } from "@/components/icons/themed-icons";
import { IconPlus } from "@/components/icons";

export function TagInput({
  tags,
  onChange,
  placeholder,
  testIdPrefix,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  testIdPrefix: string;
}) {
  const [input, setInput] = useState("");

  function add() {
    const val = input.trim();
    if (val && !tags.includes(val)) {
      onChange([...tags, val]);
    }
    setInput("");
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          data-testid={`input-${testIdPrefix}`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="h-8 text-sm"
        />
        <Button data-testid={`button-add-${testIdPrefix}`} type="button" size="sm" variant="outline" onClick={add} className="h-8 px-2" aria-label={`Add ${placeholder?.toLowerCase() ?? "tag"}`}>
          <IconPlus className="w-3.5 h-3.5" />
        </Button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs gap-1 pr-1" data-testid={`badge-${testIdPrefix}-${tag}`}>
              {tag}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                data-testid={`button-remove-${testIdPrefix}-${tag}`}
                onClick={() => onChange(tags.filter((t) => t !== tag))}
                className="h-4 w-4 hover:text-destructive transition-colors"
              >
                <X className="w-3 h-3" />
              </Button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
