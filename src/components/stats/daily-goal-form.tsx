"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { updateGoals, type UpdateGoalsState } from "@/lib/profile/actions";

const initialState: UpdateGoalsState = {};

// Editor del objetivo DIARIO de lectura (§7.14). La meta anual dejó de vivir
// aquí: tras la fusión (plan 05, P6) es un reto y se edita en el Rincón. Plegado
// por defecto; "Editar" despliega el input.
export function DailyGoalForm({
  dailyGoalMinutes,
}: {
  dailyGoalMinutes: number | null;
}) {
  const t = useTranslations("stats");
  const [state, formAction, pending] = useActionState(
    updateGoals,
    initialState,
  );
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="label-section">
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

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label={t("dailyGoal")} htmlFor="daily-goal" hint={t("dailyGoalHint")}>
        <Input
          id="daily-goal"
          name="dailyGoalMinutes"
          type="number"
          min={0}
          defaultValue={dailyGoalMinutes ?? ""}
        />
      </Field>

      {state.error && (
        <p className="text-sm text-status-dropped">{t(`errors.${state.error}`)}</p>
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
