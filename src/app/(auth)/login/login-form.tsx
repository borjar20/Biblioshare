"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { login, type AuthActionState } from "../actions";

const initialState: AuthActionState = {};

export function LoginForm() {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t("login.title")}</h1>

      <Field label={t("login.email")} htmlFor="email">
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </Field>

      <Field label={t("login.password")} htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
      </Field>

      {state.error && (
        <p className="text-sm text-status-dropped">{t(`errors.${state.error}`)}</p>
      )}

      <Button type="submit" disabled={pending} className="mt-2 w-full">
        {pending ? t("login.submitting") : t("login.submit")}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {t("login.noAccount")}{" "}
        <Link href="/signup" className="font-medium text-accent underline">
          {t("login.signupLink")}
        </Link>
      </p>
    </form>
  );
}
