"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import type { ItemType } from "@/lib/catalog/types";
import { addManualItem, type AddManualItemState } from "./actions";

const initialState: AddManualItemState = {};

export function ManualAddForm({ itemType }: { itemType: ItemType }) {
  const t = useTranslations("search.manual");
  const boundAddManualItem = addManualItem.bind(null, itemType);
  const [state, formAction, pending] = useActionState(
    boundAddManualItem,
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label={t("titleField")} htmlFor="title">
        <Input id="title" name="title" type="text" required />
      </Field>

      <Field label={t(`creator.${itemType}`)} htmlFor="creator">
        <Input id="creator" name="creator" type="text" />
      </Field>

      <Field label={t("year")} htmlFor="year">
        <Input id="year" name="year" type="number" />
      </Field>

      <Field label={t("coverUrl")} htmlFor="coverUrl" hint={t("coverUrlHint")}>
        <Input id="coverUrl" name="coverUrl" type="url" />
      </Field>

      {state.error && (
        <p className="text-sm text-status-dropped">{t(`errors.${state.error}`)}</p>
      )}

      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
