"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import type { ItemType } from "@/lib/catalog/types";
import type { ImportRow } from "@/lib/import/types";
import {
  resolveUnmatchedImportRow,
  saveUnmatchedForReview,
  type ResolveUnmatchedState,
  type SaveForReviewState,
} from "./actions";

const initialState: ResolveUnmatchedState = {};
const initialSaveState: SaveForReviewState = {};

export function UnmatchedRowForm({
  itemType,
  row,
  canResolveManually,
}: {
  itemType: ItemType;
  row: ImportRow;
  canResolveManually: boolean;
}) {
  const t = useTranslations("import");
  const [skipped, setSkipped] = useState(false);
  const boundResolve = resolveUnmatchedImportRow.bind(null, itemType, row);
  const [state, formAction, pending] = useActionState(boundResolve, initialState);
  const boundSave = saveUnmatchedForReview.bind(null, itemType, row);
  const [saveState, saveAction, savePending] = useActionState(
    boundSave,
    initialSaveState
  );

  if (skipped || state.result || saveState.saved) {
    const label = state.result
      ? t("unmatchedResolved")
      : saveState.saved
        ? t("unmatchedSavedForReview")
        : t("unmatchedSkipped");
    return (
      <p className="text-sm text-muted-foreground">
        {row.title} — {label}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">{row.title}</p>

      {canResolveManually ? (
        <form action={formAction} className="flex flex-col gap-3">
          <Field label={t("unmatchedForm.title")} htmlFor={`title-${row.rowNumber}`}>
            <Input
              id={`title-${row.rowNumber}`}
              name="title"
              defaultValue={row.title}
              required
            />
          </Field>
          <Field label={t("unmatchedForm.author")} htmlFor={`author-${row.rowNumber}`}>
            <Input
              id={`author-${row.rowNumber}`}
              name="author"
              defaultValue={row.author ?? ""}
            />
          </Field>
          <Field label={t("unmatchedForm.year")} htmlFor={`year-${row.rowNumber}`}>
            <Input
              id={`year-${row.rowNumber}`}
              name="year"
              type="number"
              defaultValue={row.year ?? ""}
            />
          </Field>

          {state.error && (
            <p className="text-sm text-status-dropped">
              {t(`unmatchedForm.errors.${state.error}`)}
            </p>
          )}

          <div className="flex gap-2">
            <Button type="submit" variant="secondary" disabled={pending}>
              {pending ? t("unmatchedForm.submitting") : t("unmatchedForm.submit")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setSkipped(true)}>
              {t("unmatchedForm.skip")}
            </Button>
          </div>
        </form>
      ) : (
        // Usuario normal: no puede crear catálogo, pero sí dejar la fila en la
        // cola de revisión para que un colaborador la resuelva a su nombre.
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">{t("unmatchedReviewHint")}</p>
          <form action={saveAction} className="flex gap-2">
            <Button type="submit" variant="secondary" disabled={savePending}>
              {savePending ? t("saveForReviewSubmitting") : t("saveForReview")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setSkipped(true)}>
              {t("unmatchedForm.skip")}
            </Button>
          </form>
          {saveState.error && (
            <p className="text-sm text-status-dropped">
              {t("unmatchedForm.errors.generic")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
