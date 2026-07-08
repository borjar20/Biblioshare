import { getTranslations } from "next-intl/server";
import type { Streaks } from "@/lib/stats/types";

export async function StreakCard({ streaks }: { streaks: Streaks }) {
  const t = await getTranslations("stats");

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">{t("streakTitle")}</h2>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-4">
          <span className="text-3xl font-semibold text-foreground">
            {streaks.current}
          </span>
          <span className="text-sm text-muted-foreground">
            {t("currentStreak", { count: streaks.current })}
          </span>
        </div>
        <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-4">
          <span className="text-3xl font-semibold text-foreground">
            {streaks.best}
          </span>
          <span className="text-sm text-muted-foreground">
            {t("bestStreak", { count: streaks.best })}
          </span>
        </div>
      </div>
    </div>
  );
}
