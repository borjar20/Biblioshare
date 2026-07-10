import { getTranslations } from "next-intl/server";
import type { DayActivity } from "@/lib/stats/types";
import { CircularProgress } from "./circular-progress";
import { FireIcon } from "../ui/icons";

const WEEKDAY_LABELS = ["D", "L", "M", "X", "J", "V", "S"];

function weekday(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return WEEKDAY_LABELS[new Date(y, m - 1, d).getDay()];
}

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

  return (
    <div className="flex flex-col gap-3">
      <div className="inline-flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
        <FireIcon className="h-5 w-5 text-accent" />
        {t("weeklyTitle")}
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
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
                <span className="text-[11px] text-muted-foreground">
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
            caption={`${dailyGoalMinutes}`}
          />
        ) : (
          <div className="flex flex-col">
            <span className="text-2xl font-semibold text-foreground">
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
