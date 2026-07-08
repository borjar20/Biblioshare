import { getTranslations } from "next-intl/server";
import type { MonthlyActivity } from "@/lib/diary/get-monthly-activity";

const MONTH_LABELS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

export async function ActivityChart({ months }: { months: MonthlyActivity[] }) {
  const t = await getTranslations("profile");
  const max = Math.max(1, ...months.map((m) => m.book + m.movie + m.series));
  const hasActivity = months.some((m) => m.book + m.movie + m.series > 0);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">{t("activityTitle")}</h2>

      {!hasActivity ? (
        <p className="text-sm text-muted-foreground">{t("activityEmpty")}</p>
      ) : (
        <div className="flex h-32 items-end gap-3">
          {months.map((m) => {
            const total = m.book + m.movie + m.series;
            const heightPercent = (total / max) * 100;
            return (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="flex w-full flex-1 items-end justify-center">
                  <div
                    className="flex w-6 flex-col-reverse overflow-hidden rounded-sm sm:w-8"
                    style={{ height: `${heightPercent}%` }}
                  >
                    {m.book > 0 && (
                      <div
                        className="w-full bg-type-book"
                        style={{ height: `${(m.book / total) * 100}%` }}
                      />
                    )}
                    {m.series > 0 && (
                      <div
                        className="w-full bg-type-series"
                        style={{ height: `${(m.series / total) * 100}%` }}
                      />
                    )}
                    {m.movie > 0 && (
                      <div
                        className="w-full bg-type-movie"
                        style={{ height: `${(m.movie / total) * 100}%` }}
                      />
                    )}
                  </div>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {MONTH_LABELS[Number(m.month.slice(5, 7)) - 1]}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-type-book" /> {t("typeBooks")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-type-series" /> {t("typeSeries")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-type-movie" /> {t("typeFilms")}
        </span>
      </div>
    </div>
  );
}
