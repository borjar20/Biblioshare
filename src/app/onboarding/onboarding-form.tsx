"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { completeOnboarding, type OnboardingActionState } from "./actions";

const initialState: OnboardingActionState = {};

export function OnboardingForm() {
  const t = useTranslations("onboarding");
  const [state, formAction, pending] = useActionState(
    completeOnboarding,
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {t("description")}
      </p>

      <div className="flex flex-col gap-1">
        <label htmlFor="username" className="text-sm font-medium">
          {t("username")}
        </label>
        <input
          id="username"
          name="username"
          type="text"
          required
          minLength={3}
          maxLength={30}
          pattern="[a-z0-9_]{3,30}"
          autoComplete="off"
          className="rounded-md border border-black/[.15] px-3 py-2 text-sm dark:border-white/[.2] dark:bg-black"
        />
        <p className="text-xs text-zinc-500">{t("usernameHint")}</p>
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
        {pending ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
