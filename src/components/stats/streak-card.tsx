import { getTranslations } from "next-intl/server";
import type { Streaks } from "@/lib/stats/types";
import { TrophyIcon } from "@/components/ui/icons";

export async function StreakCard({ streaks }: { streaks: Streaks }) {
  const t = await getTranslations("stats");

  return (
    <div className="flex flex-col gap-3">
      <div className="inline-flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
        <TrophyIcon className="h-5 w-5 text-accent" />
        {t("streakTitle")}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-4">
          <span className="font-serif text-3xl font-semibold text-foreground">
            {streaks.current}
          </span>
          <span className="text-sm text-muted-foreground">
            {t("currentStreak", { count: streaks.current })}
          </span>
        </div>
        <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-4">
          <span className="font-serif text-3xl font-semibold text-foreground">
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
