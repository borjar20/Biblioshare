"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import type { ItemType } from "@/lib/catalog/types";
import type { ImportRow } from "@/lib/import/types";
import { resolvePendingRow, type ResolvePendingState } from "../actions";

const initialState: ResolvePendingState = {};

export function ResolveForm({
  pendingId,
  itemType,
  row,
  ownerName,
}: {
  pendingId: string;
  itemType: ItemType;
  row: ImportRow;
  ownerName: string | null;
}) {
  const t = useTranslations("import");
  const boundResolve = resolvePendingRow.bind(null, pendingId, itemType, row);
  const [state, formAction, pending] = useActionState(boundResolve, initialState);

  if (state.done) {
    return (
      <p className="text-sm text-muted-foreground">
        {row.title} — {t("unmatchedResolved")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{row.title}</p>
        {ownerName && (
          <span className="font-mono text-[10px] text-muted-foreground">
            @{ownerName}
          </span>
        )}
      </div>
      <form action={formAction} className="flex flex-col gap-3">
        <Field label={t("unmatchedForm.title")} htmlFor={`ptitle-${pendingId}`}>
          <Input id={`ptitle-${pendingId}`} name="title" defaultValue={row.title} required />
        </Field>
        <Field label={t("unmatchedForm.author")} htmlFor={`pauthor-${pendingId}`}>
          <Input id={`pauthor-${pendingId}`} name="author" defaultValue={row.author ?? ""} />
        </Field>
        <Field label={t("unmatchedForm.year")} htmlFor={`pyear-${pendingId}`}>
          <Input
            id={`pyear-${pendingId}`}
            name="year"
            type="number"
            defaultValue={row.year ?? ""}
          />
        </Field>

        {state.error && (
          <p className="text-sm text-status-dropped">
            {t(`unmatchedForm.errors.${state.error === "forbidden" ? "generic" : state.error}`)}
          </p>
        )}

        <Button type="submit" variant="secondary" disabled={pending} className="self-start">
          {pending ? t("unmatchedForm.submitting") : t("resolveForOwner")}
        </Button>
      </form>
    </div>
  );
}
