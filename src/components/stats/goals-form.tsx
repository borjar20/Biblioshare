"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { updateGoals, type UpdateGoalsState } from "@/lib/profile/actions";
import { TargetIcon } from "@/components/ui/icons";

const initialState: UpdateGoalsState = {};

export function GoalsForm({
  dailyGoalMinutes,
  annualGoalItems,
}: {
  dailyGoalMinutes: number | null;
  annualGoalItems: number | null;
}) {
  const t = useTranslations("stats");
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
        className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row">
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
          <Field
            label={t("annualGoalField")}
            htmlFor="annual-goal"
            hint={t("annualGoalHint")}
          >
            <Input
              id="annual-goal"
              name="annualGoalItems"
              type="number"
              min={0}
              defaultValue={annualGoalItems ?? ""}
            />
          </Field>
        </div>

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
