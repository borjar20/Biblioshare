import { getTranslations } from "next-intl/server";
import type { TopRatedItem } from "@/lib/stats/get-top-rated";

const TYPE_LABEL_KEY: Record<TopRatedItem["type"], string> = {
  book: "typeBooks",
  movie: "typeMovies",
  series: "typeSeries",
};

// Mejor valoradas (spec 2026-08-03): lista compacta título · tipo · estrellas.
// El wrapper card lo pone la página.
export async function TopRatedCard({ items }: { items: TopRatedItem[] }) {
  const t = await getTranslations("stats");

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-serif text-sm font-semibold text-foreground">
        {t("topRatedTitle")}
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("ratingEmpty")}</p>
      ) : (
        <ul className="flex flex-col">
          {items.map((it, i) => (
            <li
              key={`${it.type}:${it.title}:${i}`}
              className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1.5 last:border-0"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {it.title}
                <span className="ml-1.5 text-[11px] text-muted-foreground">
                  {t(TYPE_LABEL_KEY[it.type])}
                </span>
              </span>
              <span aria-label={`${it.rating}/5`} className="shrink-0 text-sm text-accent">
                {"★".repeat(it.rating)}
                <span className="text-foreground-faint">{"★".repeat(5 - it.rating)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
