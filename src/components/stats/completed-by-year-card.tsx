import { getTranslations } from "next-intl/server";
import type { YearCompleted } from "@/lib/stats/get-completed-by-year";

// Completadas por año (spec 2026-08-03): histograma multi-año apilado por tipo,
// más el contador "este año vs el anterior". El wrapper card lo pone la página.
export async function CompletedByYearCard({ years }: { years: YearCompleted[] }) {
  const t = await getTranslations("stats");

  if (years.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <h3 className="font-serif text-sm font-semibold text-foreground">
          {t("completedByYearTitle")}
        </h3>
        <p className="text-sm text-muted-foreground">{t("typeEmpty")}</p>
      </div>
    );
  }

  const max = Math.max(1, ...years.map((y) => y.total));
  const current = years[years.length - 1];
  const prev = years.length > 1 ? years[years.length - 2] : null;
  const delta = prev ? current.total - prev.total : null;

  const legend = [
    { label: t("typeBooks"), color: "var(--type-book)" },
    { label: t("typeMovies"), color: "var(--type-movie)" },
    { label: t("typeSeries"), color: "var(--type-series)" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-serif text-sm font-semibold text-foreground">
          {t("completedByYearTitle")}
        </h3>
        <span className="font-mono text-[11px] text-muted-foreground">
          {t("completedThisYear", { count: current.total })}
          {delta !== null && (
            <> · {t("completedDelta", { sign: delta >= 0 ? "+" : "−", count: Math.abs(delta), year: prev!.year })}</>
          )}
        </span>
      </div>

      <div className="flex h-24 items-end justify-between gap-1">
        {years.map((y) => (
          <div key={y.year} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex w-full max-w-4 flex-1 flex-col-reverse justify-start">
              {(["book", "movie", "series"] as const).map((type) =>
                y[type] > 0 ? (
                  <div
                    key={type}
                    style={{
                      height: `${(y[type] / max) * 100}%`,
                      background: `var(--type-${type})`,
                    }}
                    className="w-full first:rounded-t-sm"
                  />
                ) : null,
              )}
            </div>
            <span className="font-mono text-[8.5px] text-foreground-faint">
              {String(y.year).slice(2)}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 text-[10.5px] text-muted-foreground">
        {legend.map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: l.color }} />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}
