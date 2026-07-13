"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { updateGoals, type UpdateGoalsState } from "@/lib/profile/actions";
import { TargetIcon } from "@/components/ui/icons";

const initialState: UpdateGoalsState = {};

// Nombre del campo del FormData que espera `updateGoals`, por tipo.
const ANNUAL_FIELD: Record<ItemType, string> = {
  book: "annualGoalBooks",
  movie: "annualGoalMovies",
  series: "annualGoalSeries",
};

const ITEM_TYPES: ItemType[] = ["book", "movie", "series"];

export function GoalsForm({
  dailyGoalMinutes,
  annualGoals,
}: {
  dailyGoalMinutes: number | null;
  annualGoals: Record<ItemType, number | null>;
}) {
  const t = useTranslations("stats");
  const tTypes = useTranslations("search.types");
  const [state, formAction, pending] = useActionState(
    updateGoals,
    initialState,
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="inline-flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
        <TargetIcon className="h-5 w-5 text-accent" />
        {t("goalsTitle")}
      </div>
      <form
        action={formAction}
        className="flex flex-col gap-4 rounded-card border border-border bg-surface shadow-card p-4"
      >
        {/* El objetivo diario es de lectura: solo los libros registran minutos
            (§7.14). El anual es de ítems completados, uno por tipo. */}
        <Field
          label={t("dailyGoal")}
          htmlFor="daily-goal"
          hint={t("dailyGoalHint")}
        >
          <Input
            id="daily-goal"
            name="dailyGoalMinutes"
            type="number"
            min={0}
            defaultValue={dailyGoalMinutes ?? ""}
          />
        </Field>

        <fieldset className="flex flex-col gap-3">
          <legend className="text-sm font-medium text-foreground">
            {t("annualGoalsTitle")}
          </legend>
          <p className="text-xs text-muted-foreground">{t("annualGoalHint")}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            {ITEM_TYPES.map((type) => (
              <Field
                key={type}
                label={tTypes(type)}
                htmlFor={`annual-goal-${type}`}
              >
                <Input
                  id={`annual-goal-${type}`}
                  name={ANNUAL_FIELD[type]}
                  type="number"
                  min={0}
                  defaultValue={annualGoals[type] ?? ""}
                />
              </Field>
            ))}
          </div>
        </fieldset>

        {state.error && (
          <p className="text-sm text-status-dropped">
            {t(`errors.${state.error}`)}
          </p>
        )}

        <Button type="submit" disabled={pending} variant="secondary">
          {pending ? t("savingGoals") : t("saveGoals")}
        </Button>
      </form>
    </div>
  );
}
