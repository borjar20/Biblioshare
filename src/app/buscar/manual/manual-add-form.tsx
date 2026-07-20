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
      <Field label={t("titleField")} htmlFor="title" required mono>
        <Input id="title" name="title" type="text" required />
      </Field>

      <Field label={t(`creator.${itemType}`)} htmlFor="creator" mono>
        <Input id="creator" name="creator" type="text" />
      </Field>

      {/* Año y Páginas comparten fila (`.two`) — pero Páginas solo existe en
          libros, así que en película/serie el Año se queda a ancho completo en
          vez de dejar media fila muerta. */}
      {itemType === "book" ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("year")} htmlFor="year" mono>
              <Input id="year" name="year" type="number" />
            </Field>

            <Field label={t("pageCount")} htmlFor="pageCount" mono>
              <Input id="pageCount" name="pageCount" type="number" min={0} />
            </Field>
          </div>

          <Field label={t("publisher")} htmlFor="publisher" mono>
            <Input id="publisher" name="publisher" type="text" />
          </Field>

          <Field label={t("isbn")} htmlFor="isbn" mono>
            <Input id="isbn" name="isbn" type="text" />
          </Field>
        </>
      ) : (
        <Field label={t("year")} htmlFor="year" mono>
          <Input id="year" name="year" type="number" />
        </Field>
      )}

      <Field
        label={t("coverUrl")}
        htmlFor="coverUrl"
        hint={t("coverUrlHint")}
        mono
      >
        <Input id="coverUrl" name="coverUrl" type="url" />
      </Field>

      {state.error && (
        <p className="text-sm text-status-dropped">{t(`errors.${state.error}`)}</p>
      )}

      <Button type="submit" disabled={pending} className="mt-2 w-full justify-center">
        {pending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
