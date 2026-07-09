import { getTranslations } from "next-intl/server";
import type { AnnualCompleted } from "@/lib/stats/types";
import { CircularProgress } from "./circular-progress";
import { TargetIcon } from "@/components/ui/icons";

const MONTH_INITIALS = [
  "E",
  "F",
  "M",
  "A",
  "M",
  "J",
  "J",
  "A",
  "S",
  "O",
  "N",
  "D",
];

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
      <div className="inline-flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
        <TargetIcon className="h-5 w-5 text-accent" />
        {t("annualTitle", { year: annual.year })}
      </div>
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-end gap-1.5 sm:gap-2">
          {annual.months.map((m, i) => {
            const heightPercent = m.count > 0 ? (m.count / max) * 100 : 0;
            const monthActive = m.count > 0;
            return (
              <div
                key={m.month}
                className="flex flex-1 flex-col items-center gap-1.5"
              >
                <div className="flex h-16 w-full items-end justify-center">
                  <div
                    className={`w-full max-w-5 rounded-sm ${monthActive ? "bg-accent" : "bg-surface-muted"}`}
                    style={{
                      height: monthActive
                        ? `${Math.max(12, heightPercent)}%`
                        : "8px",
                    }}
                    title={t("completedCount", { count: m.count })}
                  />
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {MONTH_INITIALS[i]}
                </span>
              </div>
            );
          })}
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
