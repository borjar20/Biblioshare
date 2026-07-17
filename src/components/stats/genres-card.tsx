import { getTranslations } from "next-intl/server";
import type { CatalogBreakdown } from "@/lib/stats/get-catalog-breakdown";

// Los colores rotan como en el frame J (tipos + oro) para dar variedad.
const BAR_COLORS = [
  "var(--type-book)",
  "var(--type-movie)",
  "var(--type-series)",
  "var(--gold)",
];

// Géneros más frecuentes (frame J): label + recuento y una barra proporcional.
// El wrapper card lo pone la página.
export async function GenresCard({ genres }: { genres: CatalogBreakdown["genres"] }) {
  const t = await getTranslations("stats");

  if (genres.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <h3 className="font-serif text-sm font-semibold text-foreground">
          {t("genresTitle")}
        </h3>
        <p className="text-sm text-muted-foreground">{t("genresEmpty")}</p>
      </div>
    );
  }

  const top = genres.slice(0, 6);
  const max = top[0].count;

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-serif text-sm font-semibold text-foreground">
        {t("genresTitle")}
      </h3>
      <div className="flex flex-col gap-2.5">
        {top.map((g, i) => (
          <div key={g.name} className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-xs text-foreground">
              {g.name} <b className="font-semibold">{g.count}</b>
            </span>
            <div className="h-1.5 w-[150px] max-w-[45%] shrink-0 overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(g.count / max) * 100}%`,
                  background: BAR_COLORS[i % BAR_COLORS.length],
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
