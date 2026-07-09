import { GenreTag } from "@/components/ui/genre-tag";

export type MetaRow = { label: string; value: string };

// Metadata card for the detail "Info" tab: stacked label/value rows with hair
// dividers, plus an optional genre-tag cluster.
export function MetadataSidebar({
  rows,
  genres,
  genresLabel,
}: {
  rows: MetaRow[];
  genres?: string[];
  genresLabel: string;
}) {
  if (rows.length === 0 && (!genres || genres.length === 0)) return null;

  return (
    <aside className="flex h-fit flex-col gap-3.5 rounded-xl border border-border bg-surface p-5">
      {rows.map((row, i) => (
        <div
          key={row.label}
          className={`flex flex-col gap-0.5 ${i > 0 ? "border-t border-border pt-3.5" : ""}`}
        >
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
            {row.label}
          </span>
          <span className="text-sm text-foreground">{row.value}</span>
        </div>
      ))}

      {genres && genres.length > 0 && (
        <div
          className={`flex flex-col gap-1.5 ${rows.length > 0 ? "border-t border-border pt-3.5" : ""}`}
        >
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
            {genresLabel}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {genres.map((g) => (
              <GenreTag key={g} label={g} />
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
