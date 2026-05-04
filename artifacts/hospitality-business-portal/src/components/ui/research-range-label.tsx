export function ResearchRangeLabel({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <span className="text-xs font-medium rounded-md px-1.5 py-0.5 text-accent-pop bg-accent-pop/10 border border-accent-pop/20 whitespace-nowrap">
      {text}
    </span>
  );
}
