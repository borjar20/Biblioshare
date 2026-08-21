"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { updatePassword, type AuthActionState } from "@/app/(auth)/actions";

const initialState: AuthActionState = {};

export function PasswordForm() {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState(updatePassword, initialState);

  return (
    // El título dejó de estar aquí: era un <h1> en sans de 20px dentro del
    // formulario, mientras el resto de la app titula con PageHeader en serif.
    // Ahora lo pone la página, que es además quien puede ofrecer la vuelta a
    // /ajustes — esta pantalla ya no es un formulario suelto al que solo se
    // llegaba desde un correo (F3-010).
    <form action={formAction} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("newPassword.description")}</p>

      <Field label={t("newPassword.password")} htmlFor="password">
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
        {pending ? t("newPassword.submitting") : t("newPassword.submit")}
      </Button>
    </form>
  );
}
