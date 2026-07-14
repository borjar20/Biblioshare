import { getTranslations } from "next-intl/server";
import type { ItemType } from "@/lib/catalog/types";
import type { AnnualCompleted } from "@/lib/stats/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";

const ITEM_TYPES: ItemType[] = ["book", "movie", "series"];

// Filas de "Objetivos {año}" del mockup: punto de color del tipo + recuento
// (36/50 con meta, 36 a secas sin ella) + mini barra teñida por tipo. El
// wrapper card y el GoalsForm de debajo los pone el panel.
export async function GoalRows({
  annual,
  annualGoals,
}: {
  annual: AnnualCompleted;
  annualGoals: Record<ItemType, number | null>;
}) {
  const t = await getTranslations("stats");
  const tTypes = await getTranslations("search.types");

  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-serif text-sm font-semibold text-foreground">
        {t("goalsYearTitle", { year: annual.year })}
      </h3>
      {ITEM_TYPES.map((type) => {
        const completed = annual.byType[type];
        const goal = annualGoals[type];
        const accent = MEDIA_ACCENT[type];
        const percent = goal
          ? Math.min(100, Math.round((completed / goal) * 100))
          : 0;

        return (
          <div key={type} className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-sm text-foreground">
              <span
                aria-hidden
                className={`h-1.5 w-1.5 rounded-full ${accent.bg}`}
              />
              {tTypes(type)}
              <span className="font-mono text-[11px] text-muted-foreground">
                {goal ? `${completed}/${goal}` : completed}
              </span>
            </span>
            <div className="h-1 w-[110px] shrink-0 overflow-hidden rounded-full bg-surface-muted">
              {goal ? (
                <div
                  className={`h-full rounded-full ${accent.bg}`}
                  style={{ width: `${percent}%` }}
                />
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
