import { getTranslations } from "next-intl/server";
import type { HoursByMonth } from "@/lib/stats/get-hours-by-month";

// Iniciales de los meses en español, enero→diciembre (como el frame J).
const MONTH_INITIALS = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

// Horas por mes (frame J): 12 barras con los minutos de cada mes del año. El mes
// sin sesiones se pinta apagado. El wrapper card lo pone la página.
export async function HoursByMonthCard({ data }: { data: HoursByMonth }) {
  const t = await getTranslations("stats");
  const max = Math.max(1, ...data.months.map((m) => m.minutes));
  const hasData = data.months.some((m) => m.minutes > 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-serif text-sm font-semibold text-foreground">
          {t("hoursTitle")}
        </h3>
        <span className="font-mono text-[11px] text-muted-foreground">{data.year}</span>
      </div>

      {hasData ? (
        <div className="flex h-20 items-end justify-between gap-1">
          {data.months.map((m, i) => (
            <div key={m.month} className="flex h-full flex-1 flex-col items-center gap-1">
              <div className="flex w-full flex-1 items-end justify-center">
                <div
                  className={`w-full max-w-2.5 rounded-t-sm ${
                    m.minutes > 0 ? "bg-accent" : "bg-surface-3"
                  }`}
                  style={{ height: `${Math.max((m.minutes / max) * 100, 6)}%` }}
                />
              </div>
              <span className="font-mono text-[8.5px] text-foreground-faint">
                {MONTH_INITIALS[i]}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("hoursEmpty")}</p>
      )}
    </div>
  );
}
