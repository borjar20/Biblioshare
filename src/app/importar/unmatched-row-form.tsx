"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import type { ItemType } from "@/lib/catalog/types";
import type { ImportRow } from "@/lib/import/types";
import { resolveUnmatchedImportRow, type ResolveUnmatchedState } from "./actions";

const initialState: ResolveUnmatchedState = {};

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

  if (skipped || state.result) {
    return (
      <p className="text-sm text-muted-foreground">
        {row.title} — {state.result ? t("unmatchedResolved") : t("unmatchedSkipped")}
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
        <Button type="button" variant="ghost" onClick={() => setSkipped(true)}>
          {t("unmatchedForm.skip")}
        </Button>
      )}
    </div>
  );
}
