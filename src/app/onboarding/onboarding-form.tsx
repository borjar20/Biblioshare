"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { completeOnboarding, type OnboardingActionState } from "./actions";

const initialState: OnboardingActionState = {};

export function OnboardingForm({
  nameWasTaken = false,
}: {
  /** El @usuario que elegiste al registrarte lo cogió otra persona mientras
      confirmabas el email. Hay que elegir otro. */
  nameWasTaken?: boolean;
}) {
  const t = useTranslations("onboarding");
  const [state, formAction, pending] = useActionState(
    completeOnboarding,
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <h1 className="font-serif text-xl font-semibold">{t("title")}</h1>
      <p className="text-sm text-muted-foreground">
        {nameWasTaken ? t("nameWasTaken") : t("description")}
      </p>

      <Field label={t("username")} htmlFor="username" hint={t("usernameHint")}>
        <Input
          id="username"
          name="username"
          type="text"
          required
          minLength={3}
          maxLength={30}
          pattern="[a-z0-9_]{3,30}"
          autoComplete="off"
        />
      </Field>

      {state.error && (
        <p className="text-sm text-status-dropped">{t(`errors.${state.error}`)}</p>
      )}

      <Button type="submit" disabled={pending} className="mt-2 w-full">
        {pending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
