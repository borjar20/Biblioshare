import Link from "next/link";
import { GenreTag } from "@/components/ui/genre-tag";

export type MetaRow = {
  label: string;
  value: string;
  /**
   * Si viene, el valor se pinta como enlaces (uno por entrada, separados por
   * coma) en vez de texto plano. Lo usa la fila «Autor» de la ficha de libro
   * para llegar a `/persona/[id]`; el resto de filas siguen con `value`.
   */
  links?: { href: string; label: string }[];
};

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
    <aside className="flex h-fit flex-col gap-3.5 rounded-card border border-border bg-surface shadow-card p-5">
      {rows.map((row, i) => (
        <div
          key={row.label}
          className={`flex flex-col gap-0.5 ${i > 0 ? "border-t border-border pt-3.5" : ""}`}
        >
          <span className="label-section">
            {row.label}
          </span>
          {row.links && row.links.length > 0 ? (
            <span className="text-sm text-foreground">
              {row.links.map((link, j) => (
                <span key={link.href}>
                  {j > 0 && ", "}
                  <Link
                    href={link.href}
                    className="font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    {link.label}
                  </Link>
                </span>
              ))}
            </span>
          ) : (
            <span className="text-sm text-foreground">{row.value}</span>
          )}
        </div>
      ))}

      {genres && genres.length > 0 && (
        <div
          className={`flex flex-col gap-1.5 ${rows.length > 0 ? "border-t border-border pt-3.5" : ""}`}
        >
          <span className="label-section">
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
