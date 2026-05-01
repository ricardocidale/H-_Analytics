import { useState } from "react";
import { IconShieldCheck } from "@/components/icons";
import { ChevronDown, ChevronRight } from "@/components/icons/themed-icons";

export interface GovernedFieldWrapperProps {
  authority: string;
  label: string;
  helperText: React.ReactNode;
  referenceUrl?: string;
  defaultExpanded?: boolean;
  "data-testid"?: string;
  children?: React.ReactNode;
}

export function GovernedFieldWrapper({
  authority,
  label,
  helperText,
  referenceUrl,
  defaultExpanded = false,
  "data-testid": testId,
  children,
}: GovernedFieldWrapperProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div
      className="rounded-lg border border-accent-pop/20 bg-accent-pop/10 dark:bg-accent-pop/20 dark:border-accent-pop/30 p-4"
      data-testid={testId}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <IconShieldCheck className="w-4 h-4 text-accent-pop dark:text-accent-pop shrink-0" />
          <span className="text-sm font-medium text-accent-pop dark:text-accent-pop">
            {label}
          </span>
          <span className="text-xs text-accent-pop/80 dark:text-accent-pop/70 shrink-0">
            {authority}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-accent-pop dark:text-accent-pop hover:text-accent-pop dark:hover:text-accent-pop shrink-0 p-0.5"
          aria-label={expanded ? "Collapse details" : "Expand details"}
        >
          {expanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>
      </div>
      {expanded && (
        <div className="mt-2 text-xs text-accent-pop dark:text-accent-pop/80 leading-relaxed">
          {helperText}
          {referenceUrl && (
            <>
              {" "}
              <a
                href={referenceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-accent-pop dark:hover:text-accent-pop"
              >
                Reference
              </a>
            </>
          )}
        </div>
      )}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
