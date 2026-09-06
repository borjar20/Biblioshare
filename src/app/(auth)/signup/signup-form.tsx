"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { signup, type AuthActionState } from "../actions";
import { checkUsername, type UsernameStatus } from "./check-username";

const initialState: AuthActionState = {};

export function SignupForm() {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState(signup, initialState);
  const [username, setUsername] = useState("");
  // Guardamos junto al veredicto el nombre que se consultó: así "¿este
  // resultado es del texto que hay ahora en el campo?" se responde al pintar,
  // sin tener que poner el estado a null/"checking" desde dentro del efecto
  // (setState síncrono en un efecto encadena renders — regla set-state-in-effect).
  const [checked, setChecked] = useState<{
    username: string;
    status: UsernameStatus;
  } | null>(null);

  // Comprobación en vivo, con 400 ms de espera para no consultar en cada tecla.
  useEffect(() => {
    if (username.length < 3) return;
    const timer = setTimeout(() => {
      checkUsername(username).then((status) => setChecked({ username, status }));
    }, 400);
    return () => clearTimeout(timer);
  }, [username]);

  // Derivado, no estado: menos de 3 letras no dice nada, y mientras el veredicto
  // que tenemos sea de otro texto seguimos "comprobando".
  const status: UsernameStatus | "checking" | null =
    username.length < 3
      ? null
      : checked?.username === username
        ? checked.status
        : "checking";

  if (state.checkEmail) {
    return (
      <div className="flex flex-col gap-2 text-center">
        <h1 className="font-serif text-xl font-semibold">
          {t("signup.title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("signup.checkEmail")}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-xl font-semibold">
          {t("signup.title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("signup.description")}
        </p>
      </div>

      <Field label={t("signup.email")} htmlFor="email">
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </Field>

      <Field
        label={t("signup.username")}
        htmlFor="username"
        hint={t("signup.usernameHint")}
      >
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">
            @
          </span>
          <Input
            id="username"
            name="username"
            type="text"
            required
            minLength={3}
            maxLength={30}
            pattern="[a-z0-9_]{3,30}"
            autoComplete="off"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            className="w-full pl-7 font-mono"
          />
        </div>
        {status && (
          <span
            className={`font-mono text-xs ${
              status === "available"
                ? "text-status-completed-ink"
                : status === "taken" || status === "invalid"
                  ? "text-status-dropped"
                  : "text-muted-foreground"
            }`}
          >
            {status === "available" && t("signup.usernameAvailable")}
            {status === "taken" && t("signup.usernameTaken")}
            {status === "invalid" && t("errors.usernameInvalid")}
            {status === "checking" && t("signup.usernameChecking")}
          </span>
        )}
      </Field>

      <Field
        label={t("signup.password")}
        htmlFor="password"
        hint={t("signup.passwordHint")}
      >
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

      <Button
        type="submit"
        disabled={pending || status === "taken" || status === "invalid"}
        className="mt-2 w-full"
      >
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
