import { getTranslations } from "next-intl/server";
import type { Streaks } from "@/lib/stats/types";

// Card "Racha" del mockup: bignum serif en accent + "días · mejor N". El
// wrapper card lo pone el panel.
export async function StreakCard({ streaks }: { streaks: Streaks }) {
  const t = await getTranslations("stats");

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-serif text-sm font-semibold text-foreground">
        {t("streakTitle")}
      </h3>
      <span className="font-serif text-4xl leading-none font-semibold text-accent">
        {streaks.current}
      </span>
      <span className="text-sm text-muted-foreground">
        {t("streakSummary", { count: streaks.current, best: streaks.best })}
      </span>
    </div>
  );
}
