"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { renamePet, type PetActionState } from "@/lib/pet/actions";
import { NAME_MAX } from "@/lib/pet/classes";
import { buttonVariants } from "@/components/ui/button";

export function RenameForm({ name }: { name: string }) {
  const t = useTranslations("pet");
  const [state, action, pending] = useActionState<PetActionState, FormData>(renamePet, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-[12px] text-muted-foreground">{t("rename.label")}</span>
        <input name="name" defaultValue={name} required maxLength={NAME_MAX} className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm" />
      </label>
      <button type="submit" disabled={pending} className={buttonVariants("secondary", "px-4")}>
        {t("rename.submit")}
      </button>
      {state.error ? <p role="alert" className="basis-full text-sm text-destructive">{t(`hatch.errors.${state.error}`)}</p> : null}
    </form>
  );
}
