"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { signup, type AuthActionState } from "../actions";

const initialState: AuthActionState = {};

export function SignupForm() {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState(signup, initialState);

  if (state.checkEmail) {
    return (
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-xl font-semibold">{t("signup.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("signup.checkEmail")}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t("signup.title")}</h1>

      <Field label={t("signup.email")} htmlFor="email">
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </Field>

      <Field label={t("signup.password")} htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
        />
      </Field>

      {state.error && (
        <p className="text-sm text-status-dropped">{t(`errors.${state.error}`)}</p>
      )}

      <Button type="submit" disabled={pending} className="mt-2 w-full">
        {pending ? t("signup.submitting") : t("signup.submit")}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {t("signup.hasAccount")}{" "}
        <Link href="/login" className="font-medium text-accent underline">
          {t("signup.loginLink")}
        </Link>
      </p>
    </form>
  );
}
