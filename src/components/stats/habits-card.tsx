import { getTranslations } from "next-intl/server";
import type { Habits } from "@/lib/stats/get-habits";

// Cuándo lees (frames B/G): franja favorita, día más lector y sesión media.
// El wrapper card lo pone la pestaña.
export async function HabitsCard({ habits }: { habits: Habits }) {
  const t = await getTranslations("stats");
  const dash = t("recordEmpty");

  const band = habits.favoriteBand
    ? t("habitBandValue", {
        from: habits.favoriteBand.startHour,
        to: (habits.favoriteBand.startHour + 2) % 24 || 24,
      })
    : dash;
  const weekday =
    habits.favoriteWeekday === null
      ? dash
      : t(`weekday_${habits.favoriteWeekday}`);
  const avg =
    habits.averageMinutes === null
      ? dash
      : t("minutesCount", { count: habits.averageMinutes });

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-serif text-sm font-semibold text-foreground">
        {t("habitsTitle")}
      </h3>
      <div className="flex flex-col">
        <Row k={t("habitBand")} v={band} />
        <Row k={t("habitWeekday")} v={weekday} />
        <Row k={t("habitAvg")} v={avg} />
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1.5 last:border-0">
      <span className="text-xs text-muted-foreground">{k}</span>
      <span className="text-right text-sm font-medium text-foreground">{v}</span>
    </div>
  );
}
