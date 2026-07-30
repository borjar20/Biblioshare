import { getTranslations } from "next-intl/server";
import { PeriodPills } from "@/app/estadisticas/period-pills";
import type { StatsPeriod } from "@/lib/stats/period";

export async function StatsDesktopRail({
  period,
  years,
}: {
  period: StatsPeriod;
  years: number[];
}) {
  const t = await getTranslations("stats.desktopRail");

  return (
    <div className="sticky top-[calc(var(--topbar-h)+16px)]">
      <p className="font-mono text-[11px] tracking-[0.12em] uppercase">
        {t("period")}
      </p>
      <div className="mt-3">
        <PeriodPills current={period} years={years} />
      </div>
    </div>
  );
}
