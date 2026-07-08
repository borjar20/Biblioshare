import { getTranslations } from "next-intl/server";
import type { AnnualCompleted } from "@/lib/stats/types";
import { CircularProgress } from "./circular-progress";

const MONTH_INITIALS = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

export async function AnnualStats({
  annual,
  annualGoalItems,
}: {
  annual: AnnualCompleted;
  annualGoalItems: number | null;
}) {
  const t = await getTranslations("stats");
  const max = Math.max(1, ...annual.months.map((m) => m.count));

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">
        {t("annualTitle", { year: annual.year })}
      </h2>

      <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex h-28 items-end gap-1.5">
          {annual.months.map((m, i) => (
            <div key={m.month} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="flex w-full flex-1 items-end justify-center">
                <div
                  className="w-3 rounded-sm bg-accent sm:w-4"
                  style={{ height: `${(m.count / max) * 100}%` }}
                  title={t("completedCount", { count: m.count })}
                />
              </div>
              <span className="text-[10px] text-muted-foreground">
                {MONTH_INITIALS[i]}
              </span>
            </div>
          ))}
        </div>

        {annualGoalItems ? (
          <CircularProgress
            value={annual.total}
            total={annualGoalItems}
            label={`${annual.total}`}
            caption={t("annualGoal", { goal: annualGoalItems })}
          />
        ) : (
          <div className="flex flex-col">
            <span className="text-2xl font-semibold text-foreground">
              {annual.total}
            </span>
            <span className="text-sm text-muted-foreground">
              {t("annualTotal")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
