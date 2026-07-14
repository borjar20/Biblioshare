import { getTranslations } from "next-intl/server";
import type { DayActivity } from "@/lib/stats/types";
import { CircularProgress } from "./circular-progress";

const WEEKDAY_LABELS = ["D", "L", "M", "X", "J", "V", "S"];

function weekday(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return WEEKDAY_LABELS[new Date(y, m - 1, d).getDay()];
}

// Card "Lectura esta semana" del mockup: título serif con el total semanal en
// mono a la derecha. El wrapper card lo pone el panel — este componente solo
// pinta contenido.
export async function WeeklyStrip({
  days,
  dailyGoalMinutes,
}: {
  days: DayActivity[];
  dailyGoalMinutes: number | null;
}) {
  const t = await getTranslations("stats");
  const today = days[days.length - 1];
  const maxMinutes = Math.max(1, ...days.map((d) => d.minutes));
  const totalMinutes = days.reduce((sum, d) => sum + d.minutes, 0);
  const totalLabel =
    totalMinutes >= 60
      ? t("weekTotal", {
          hours: Math.floor(totalMinutes / 60),
          minutes: totalMinutes % 60,
        })
      : t("minutesCount", { count: totalMinutes });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-serif text-sm font-semibold text-foreground">
          {t("weeklyTitle")}
        </h3>
        <span className="font-mono text-[11px] text-muted-foreground">
          {totalLabel}
        </span>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-end gap-1.5 sm:gap-2">
          {days.map((day) => {
            const heightPercent =
              day.minutes > 0 ? (day.minutes / maxMinutes) * 100 : 0;
            return (
              <div
                key={day.date}
                className="flex flex-1 flex-col items-center gap-1.5"
              >
                <div className="flex h-16 w-full items-end justify-center">
                  <div
                    className={`w-full max-w-5 rounded-sm ${day.active ? "bg-accent" : "bg-surface-muted"}`}
                    style={{
                      height: day.active
                        ? `${Math.max(12, heightPercent)}%`
                        : "8px",
                    }}
                    title={
                      day.minutes > 0
                        ? t("minutesCount", { count: day.minutes })
                        : undefined
                    }
                  />
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {weekday(day.date)}
                </span>
              </div>
            );
          })}
        </div>

        {dailyGoalMinutes ? (
          <CircularProgress
            value={today.minutes}
            total={dailyGoalMinutes}
            label={`${today.minutes}`}
            label2={`${dailyGoalMinutes}`}
            caption={`${t("dailyGoal")}`}
          />
        ) : (
          <div className="flex flex-col">
            <span className="font-serif text-2xl font-semibold text-foreground">
              {t("minutesCount", { count: today.minutes })}
            </span>
            <span className="text-sm text-muted-foreground">
              {t("todayNoGoal")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
