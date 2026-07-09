"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sagaHref } from "@/lib/catalog/item-href";
import type { ItemType } from "@/lib/catalog/types";
import {
  assignItemToSaga,
  removeItemFromSaga,
  type AssignSagaState,
} from "@/lib/sagas/manage-saga-actions";

const initialState: AssignSagaState = {};

// Asignación de saga a mano, para el ítem actual (útil sobre todo en libros,
// donde no hay fuente automática de sagas). Visible solo a usuarios autenticados.
export function SagaAssignForm({
  itemType,
  itemId,
  currentSaga,
}: {
  itemType: ItemType;
  itemId: string;
  currentSaga: { id: string; name: string } | null;
}) {
  const t = useTranslations("item.sagaForm");
  const assignAction = assignItemToSaga.bind(null, itemType, itemId);
  const [state, formAction, pending] = useActionState(assignAction, initialState);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
      <h2 className="text-sm font-semibold text-foreground">{t("title")}</h2>

      {currentSaga && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            {t("current")}{" "}
            <Link
              href={sagaHref(currentSaga.id)}
              className="text-foreground underline-offset-2 hover:underline"
            >
              {currentSaga.name}
            </Link>
          </span>
          <form action={removeItemFromSaga.bind(null, itemType, itemId)}>
            <Button type="submit" variant="secondary">
              {t("remove")}
            </Button>
          </form>
        </div>
      )}

      <form action={formAction} className="flex flex-col gap-2 sm:flex-row">
        <Input
          name="name"
          placeholder={t("namePlaceholder")}
          defaultValue={currentSaga?.name ?? ""}
          className="flex-1"
        />
        <Input
          name="position"
          type="number"
          min={1}
          placeholder={t("positionPlaceholder")}
          className="sm:w-20"
        />
        <Button type="submit" disabled={pending} variant="secondary">
          {pending ? t("submitting") : t("submit")}
        </Button>
      </form>

      {state.error && (
        <p className="text-sm text-status-dropped">{t(`errors.${state.error}`)}</p>
      )}
    </div>
  );
}
