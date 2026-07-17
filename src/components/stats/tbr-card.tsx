import { getTranslations } from "next-intl/server";
import type { TbrTrend } from "@/lib/stats/get-tbr-trend";

const MONTH_SHORT = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

// La pila (frames B/G): pendientes + crecimiento del año, y barras pareadas
// añadidos/terminados por mes. El wrapper card lo pone la pestaña.
export async function TbrCard({ trend }: { trend: TbrTrend }) {
  const t = await getTranslations("stats");

  const sign = trend.netThisYear >= 0 ? "+" : "−";
  const net = t("tbrNet", { sign, count: Math.abs(trend.netThisYear) });
  const max = Math.max(
    1,
    ...trend.months.flatMap((m) => [m.added, m.finished]),
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-serif text-sm font-semibold text-foreground">
          {t("tbrTitle")}
        </h3>
        <span className="font-mono text-[11px] text-muted-foreground">
          {t("tbrPending", { count: trend.pending, net })}
        </span>
      </div>

      <div className="flex h-16 items-end justify-around gap-3">
        {trend.months.map((m) => (
          <div key={m.month} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full flex-1 items-end justify-center gap-1">
              <div
                className="w-2.5 rounded-sm bg-status-planned"
                style={{ height: `${(m.added / max) * 100}%` }}
              />
              <div
                className="w-2.5 rounded-sm bg-status-completed"
                style={{ height: `${(m.finished / max) * 100}%` }}
              />
            </div>
            <span className="font-mono text-[8.5px] text-foreground-faint">
              {MONTH_SHORT[Number(m.month.slice(5, 7)) - 1]}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 text-[10.5px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-status-planned" /> {t("tbrAdded")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-status-completed" /> {t("tbrFinished")}
        </span>
      </div>
    </div>
  );
}
