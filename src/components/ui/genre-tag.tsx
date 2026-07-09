// Small monospace genre chip (reel+shelf-style), neutral by default.
export function GenreTag({
  label,
  className = "",
}: {
  label: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded border border-border bg-surface-muted px-2 py-0.5 font-mono text-[10px] tracking-wide whitespace-nowrap text-muted-foreground uppercase ${className}`}
    >
      {label}
    </span>
  );
}
