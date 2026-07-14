import { getTranslations } from "next-intl/server";
import { CircularProgress } from "./circular-progress";

// Card "Meta libros" del mockup: anillo verde con completados/objetivo del
// año. Sin objetivo configurado, cae a la cifra serif grande (mismo patrón
// que tenía el fallback de annual-stats). El wrapper card lo pone el panel.
export async function BookGoalCard({
  completed,
  goal,
}: {
  completed: number;
  goal: number | null;
}) {
  const t = await getTranslations("stats");

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-serif text-sm font-semibold text-foreground">
        {t("bookGoalTitle")}
      </h3>
      {goal ? (
        <div className="flex items-center gap-3">
          <CircularProgress
            value={completed}
            total={goal}
            size={64}
            color="var(--green)"
            label={`${completed}`}
            label2={`${goal}`}
          />
          <span className="text-sm text-muted-foreground">
            {t("annualGoal", { goal })}
          </span>
        </div>
      ) : (
        <>
          <span className="font-serif text-4xl leading-none font-semibold text-foreground">
            {completed}
          </span>
          <span className="text-sm text-muted-foreground">
            {t("annualTotal")}
          </span>
        </>
      )}
    </div>
  );
}
