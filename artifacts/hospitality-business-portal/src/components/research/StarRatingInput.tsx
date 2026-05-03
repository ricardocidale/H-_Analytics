import { useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface StarRatingInputProps {
  value: number | null | undefined;
  suggested?: number | null;
  onChange: (rating: number | null) => void;
  disabled?: boolean;
}

const STAR_LABELS = ["", "Economy (1★)", "Budget (2★)", "Midscale (3★)", "Upscale (4★)", "Luxury (5★)"];

export default function StarRatingInput({ value, suggested, onChange, disabled }: StarRatingInputProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const display = hovered ?? value ?? 0;

  return (
    <div className="space-y-1.5">
      <div
        className="flex items-center gap-0.5"
        role="radiogroup"
        aria-label="Star rating"
        data-testid="star-rating-input"
        onMouseLeave={() => setHovered(null)}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={STAR_LABELS[star]}
            disabled={disabled}
            className="p-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded transition-transform hover:scale-110 disabled:opacity-50"
            data-testid={`star-rating-${star}`}
            onMouseEnter={() => setHovered(star)}
            onClick={() => onChange(value === star ? null : star)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" && star < 5) {
                onChange(star + 1);
              } else if (e.key === "ArrowLeft" && star > 1) {
                onChange(star - 1);
              }
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill={star <= display ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-colors ${star <= display ? "text-amber-500" : "text-muted-foreground/40"}`}
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
        ))}
      </div>
      {suggested && suggested !== value && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 cursor-help" data-testid="star-rating-suggestion">
              <span>Suggested: {"★".repeat(suggested)}</span>
              <span className="underline decoration-dotted">Why?</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[280px]">
            <p className="text-xs">Based on ADR, room count, amenities, and property type. Click stars above to override.</p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
