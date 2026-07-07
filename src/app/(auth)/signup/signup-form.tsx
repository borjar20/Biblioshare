"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { signup, type AuthActionState } from "../actions";

const initialState: AuthActionState = {};

export function SignupForm() {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState(signup, initialState);

  if (state.checkEmail) {
    return (
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-xl font-semibold">{t("signup.title")}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {t("signup.checkEmail")}
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t("signup.title")}</h1>

      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium">
          {t("signup.email")}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="rounded-md border border-black/[.15] px-3 py-2 text-sm dark:border-white/[.2] dark:bg-black"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium">
          {t("signup.password")}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          className="rounded-md border border-black/[.15] px-3 py-2 text-sm dark:border-white/[.2] dark:bg-black"
        />
      </div>

      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400">
          {t(`errors.${state.error}`)}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-60 dark:hover:bg-[#ccc]"
      >
        {pending ? t("signup.submitting") : t("signup.submit")}
      </button>

      <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
        {t("signup.hasAccount")}{" "}
        <Link href="/login" className="font-medium underline">
          {t("signup.loginLink")}
        </Link>
      </p>
    </form>
  );
}
