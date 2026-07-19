"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createSaga, type CurationState } from "@/lib/sagas/curation-actions";
import { AccentRadio } from "./accent-radio";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const initialState: CurationState = {};

export function NewSagaForm() {
  const t = useTranslations("sagaIndex");
  const [state, formAction, pending] = useActionState(createSaga, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
          {t("nameLabel")}
        </span>
        <Input name="name" required maxLength={120} placeholder={t("namePlaceholder")} />
      </label>
      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
          {t("accentLabel")}
        </span>
        <AccentRadio name="accent" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? t("creating") : t("create")}
      </Button>
      {state.error && <p className="text-sm text-status-dropped">{t(`errors.${state.error}`)}</p>}
    </form>
  );
}
