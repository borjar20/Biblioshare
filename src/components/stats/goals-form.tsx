"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { updateGoals, type UpdateGoalsState } from "@/lib/profile/actions";

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
  // Plegado por defecto (limpieza): la card muestra las filas de GoalRows y el
  // objetivo diario en estático; "Editar" despliega los inputs. Tras guardar,
  // el refresh del server actualiza las filas — el form queda abierto hasta
  // que el usuario lo cierre.
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
            {t("dailyGoal")}
          </span>
          <span className="text-sm text-foreground">
            {dailyGoalMinutes
              ? t("minutesCount", { count: dailyGoalMinutes })
              : t("noGoal")}
          </span>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="px-4 py-1.5 text-xs"
          onClick={() => setEditing(true)}
        >
          {t("editGoals")}
        </Button>
      </div>
    );
  }

  // Formulario pelado: vive dentro de la card "Objetivos {año}" del panel
  // (GoalRows pone el título; el panel, la card y el divisor).
  return (
    <form action={formAction} className="flex flex-col gap-4">
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

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending} variant="primary">
            {pending ? t("savingGoals") : t("saveGoals")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => setEditing(false)}
          >
            {t("cancelGoals")}
          </Button>
        </div>
      </form>
  );
}
