import { getTranslations } from "next-intl/server";
import type { ItemType } from "@/lib/catalog/types";
import type { AnnualCompleted } from "@/lib/stats/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
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

const ITEM_TYPES: ItemType[] = ["book", "movie", "series"];

export async function AnnualStats({
  annual,
  annualGoals,
}: {
  annual: AnnualCompleted;
  annualGoals: Record<ItemType, number | null>;
}) {
  const t = await getTranslations("stats");
  const tTypes = await getTranslations("search.types");
  const max = Math.max(1, ...annual.months.map((m) => m.count));

  return (
    <div className="flex flex-col gap-3">
      <div className="inline-flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
        <TargetIcon className="h-5 w-5 text-accent" />
        {t("annualTitle", { year: annual.year })}
      </div>
      <div className="flex flex-col gap-4 rounded-card border border-border bg-surface shadow-card p-4">
        <div className="flex min-w-0 items-end gap-1.5 sm:gap-2">
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

        {/* Un objetivo anual por tipo (§7.14). Un tipo sin objetivo sigue
            mostrando su recuento: la cifra es útil aunque no haya meta. */}
        <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-3">
          {ITEM_TYPES.map((type) => {
            const completed = annual.byType[type];
            const goal = annualGoals[type];
            const accent = MEDIA_ACCENT[type];

            return goal ? (
              <CircularProgress
                key={type}
                value={completed}
                total={goal}
                size={64}
                color={`var(${accent.varName})`}
                label={`${completed}`}
                label2={`${goal}`}
                caption={`${tTypes(type)}`}
                textColor={accent.text}
              />
            ) : (
              <div key={type} className="flex flex-col">
                <span className={`font-serif text-2xl font-semibold ${accent.text}`}>
                  {completed}
                </span>
                <span className="text-sm text-muted-foreground">
                  {tTypes(type)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
