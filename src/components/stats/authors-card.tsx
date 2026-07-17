import { getTranslations } from "next-intl/server";
import type { CatalogBreakdown } from "@/lib/stats/get-catalog-breakdown";

// Autores más leídos (frame J): inicial, nombre y nº de obras; al pie, cuántos
// autores son nuevos. Solo autores de libro. El wrapper card lo pone la página.
export async function AuthorsCard({
  authors,
  newAuthors,
  totalAuthors,
}: {
  authors: CatalogBreakdown["authors"];
  newAuthors: number;
  totalAuthors: number;
}) {
  const t = await getTranslations("stats");

  if (authors.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <h3 className="font-serif text-sm font-semibold text-foreground">
          {t("authorsTitle")}
        </h3>
        <p className="text-sm text-muted-foreground">{t("authorsEmpty")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-serif text-sm font-semibold text-foreground">
        {t("authorsTitle")}
      </h3>
      <div className="flex flex-col gap-3">
        {authors.slice(0, 5).map((a) => (
          <div key={a.name} className="flex items-center gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-type-book/15 font-serif text-sm font-semibold text-type-book">
              {a.name.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">
              {a.name}
            </span>
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
              {t("recordWorks", { count: a.works })}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3">
        <span className="text-xs text-muted-foreground">{t("authorsNew")}</span>
        <span className="text-sm font-medium text-foreground">
          {t("authorsNewValue", { count: newAuthors, total: totalAuthors })}
        </span>
      </div>
    </div>
  );
}
