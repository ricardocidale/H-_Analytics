/**
 * SpecialistQuickSearch.tsx — Type-to-jump search for the AI Intelligence
 * specialist catalog (Task #492).
 *
 * Renders a compact search button in the AiIntelligence page header that
 * opens a CommandDialog. Admins can type the human name ("Helena"), the
 * role ("Tax Authority Research"), or the catalog letter ("H") to filter
 * the list and press Enter to navigate to that specialist's page.
 *
 * Source of truth for the catalog rows is `SPECIALIST_CATALOG`. Rows are
 * mapped to AI Intelligence sidebar sections via the canonical
 * `SPECIALIST_SECTION_TO_ID` map so navigation stays in lockstep with the
 * sidebar groups. Gaspar (the Analyst orchestrator) is added on top with
 * the `analyst-orchestrator` section so admins can also jump to him.
 *
 * humanName overrides: the `/api/admin/specialists` list endpoint
 * resolves Identity-tab renames against the catalog. We prefer that
 * resolved name over the static catalog value so renaming "Gaspar" to
 * something else immediately makes the search match the new spelling
 * (matching the sidebar behavior).
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Search } from "@/components/icons/themed-icons";
import { SPECIALIST_CATALOG } from "@engine/analyst/registry/specialist-catalog";
import { ORCHESTRATOR_SPECIALIST_ID } from "@engine/analyst/identity";
import {
  SPECIALIST_SECTION_TO_ID,
  type AiIntelligenceSection,
} from "@/components/ai-intelligence/AiIntelligenceSidebar";

interface SpecialistListItem {
  id: string;
  humanName?: string | null;
}

interface SearchEntry {
  section: AiIntelligenceSection;
  specialistId: string;
  primary: string;
  secondary: string;
  letter?: string;
  /** Concatenated, lowercased haystack used by cmdk's filter. */
  searchValue: string;
}

interface SpecialistQuickSearchProps {
  onSelect: (section: AiIntelligenceSection) => void;
}

export function SpecialistQuickSearch({ onSelect }: SpecialistQuickSearchProps) {
  const [open, setOpen] = useState(false);

  // Resolve Identity-tab humanName overrides against the static catalog so
  // renames are searchable immediately. Falls back to catalog when the
  // request is in flight or a row is missing.
  const { data: specialists } = useQuery<SpecialistListItem[]>({
    queryKey: ["/api/admin/specialists"],
  });

  const overrideHumanNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of specialists ?? []) {
      const trimmed = s.humanName?.trim();
      if (trimmed) map.set(s.id, trimmed);
    }
    return map;
  }, [specialists]);

  const entries = useMemo<SearchEntry[]>(() => {
    const sectionBySpecialistId = new Map<string, AiIntelligenceSection>();
    for (const [section, id] of Object.entries(SPECIALIST_SECTION_TO_ID) as Array<
      [AiIntelligenceSection, string]
    >) {
      sectionBySpecialistId.set(id, section);
    }

    const rows: SearchEntry[] = [];

    // Gaspar — orchestrator persona. Lives outside SPECIALIST_SECTION_TO_ID
    // because his admin surface routes through the dedicated
    // "analyst-orchestrator" section, not a catalog id.
    {
      const overrideName = overrideHumanNameById.get(ORCHESTRATOR_SPECIALIST_ID);
      const human = overrideName || "Gustavo";
      rows.push({
        section: "analyst-orchestrator",
        specialistId: ORCHESTRATOR_SPECIALIST_ID,
        primary: human,
        secondary: "The Analyst · Orchestrator",
        searchValue: [human, "the analyst", "orchestrator", "gaspar"]
          .join(" ")
          .toLowerCase(),
      });
    }

    for (const def of SPECIALIST_CATALOG) {
      const section = sectionBySpecialistId.get(def.id);
      if (!section) continue;
      const role = def.displayName ?? def.realName;
      const overrideName = overrideHumanNameById.get(def.id);
      const human = (overrideName || def.humanName || role).trim();
      const searchTokens = [
        human,
        role,
        def.realName,
        def.displayName ?? "",
        def.humanName ?? "",
        def.letter ? `letter ${def.letter}` : "",
        def.letter ?? "",
        def.id,
      ];
      rows.push({
        section,
        specialistId: def.id,
        primary: human,
        secondary: role,
        letter: def.letter,
        searchValue: searchTokens.filter(Boolean).join(" ").toLowerCase(),
      });
    }

    // Sort alphabetically by human name so the catalog reads like a team
    // roster — matches the persona-first sidebar convention.
    rows.sort((a, b) => a.primary.localeCompare(b.primary));
    return rows;
  }, [overrideHumanNameById]);

  // Cmd+K is owned by the global CommandPalette. Use "/" (when no input is
  // focused) as a lightweight focus shortcut for this on-page search so
  // admins can jump in without reaching for the mouse.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "/") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isEditable =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable === true;
      if (isEditable) return;
      e.preventDefault();
      setOpen(true);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  function handleSelect(section: AiIntelligenceSection) {
    onSelect(section);
    setOpen(false);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-9 w-full sm:w-72 justify-start gap-2 px-3 text-sm font-normal text-muted-foreground"
        data-testid="button-specialist-search"
        aria-label="Search specialists"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="truncate">Search specialists…</span>
        <kbd
          className="ml-auto hidden sm:inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground"
          aria-hidden="true"
        >
          /
        </kbd>
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <DialogTitle className="sr-only">Search specialists</DialogTitle>
        <CommandInput
          placeholder="Search by name (Helena), role (Tax Authority Research), or letter (H)…"
          data-testid="input-specialist-search"
        />
        <CommandList data-testid="list-specialist-search-results">
          <CommandEmpty data-testid="text-specialist-search-empty">
            No specialists match that search.
          </CommandEmpty>
          <CommandGroup heading="Specialists">
            {entries.map((entry) => (
              <CommandItem
                key={entry.section}
                value={entry.searchValue}
                onSelect={() => handleSelect(entry.section)}
                className="cursor-pointer"
                data-testid={`item-specialist-search-${entry.section}`}
              >
                {entry.letter ? (
                  <span
                    className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground"
                    aria-hidden="true"
                  >
                    {entry.letter}
                  </span>
                ) : null}
                <span className="flex flex-col min-w-0 leading-tight">
                  <span
                    className="truncate text-foreground"
                    data-testid={`text-specialist-search-primary-${entry.section}`}
                  >
                    {entry.primary}
                  </span>
                  <span
                    className="truncate text-[11px] text-muted-foreground"
                    data-testid={`text-specialist-search-secondary-${entry.section}`}
                  >
                    {entry.secondary}
                  </span>
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
