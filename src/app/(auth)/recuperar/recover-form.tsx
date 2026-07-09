"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { requestPasswordReset, type AuthActionState } from "../actions";

const initialState: AuthActionState = {};

export function RecoverForm() {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState(
    requestPasswordReset,
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t("reset.title")}</h1>
      <p className="text-sm text-muted-foreground">{t("reset.description")}</p>

      <Field label={t("reset.email")} htmlFor="email">
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </Field>

      {state.error && (
        <p className="text-sm text-status-dropped">{t(`errors.${state.error}`)}</p>
      )}

      {state.checkEmail ? (
        <p className="text-sm text-muted-foreground">{t("reset.checkEmail")}</p>
      ) : (
        <Button type="submit" disabled={pending} className="mt-2 w-full">
          {pending ? t("reset.submitting") : t("reset.submit")}
        </Button>
      )}

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-accent underline">
          {t("reset.backToLogin")}
        </Link>
      </p>
    </form>
  );
}
