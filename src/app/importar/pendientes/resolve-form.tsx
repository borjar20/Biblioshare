"use client";

import { useActionState, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import type { ItemType } from "@/lib/catalog/types";
import type { ImportCandidate, ImportRow } from "@/lib/import/types";
import {
  resolvePendingRow,
  resolvePendingRowWithCandidate,
  type ResolvePendingState,
} from "../actions";
import { CandidateList } from "../candidate-list";

const initialState: ResolvePendingState = {};

export function ResolveForm({
  pendingId,
  itemType,
  row,
  ownerName,
  candidates,
}: {
  pendingId: string;
  itemType: ItemType;
  row: ImportRow;
  ownerName: string | null;
  // Fila ambigua importada en el onboarding: el matcher ya encontró candidatos
  // (issue #390). Ausente/vacío en filas sin match → solo alta manual.
  candidates?: ImportCandidate[];
}) {
  const t = useTranslations("import");
  const boundResolve = resolvePendingRow.bind(null, pendingId, itemType, row);
  const [state, formAction, pending] = useActionState(boundResolve, initialState);

  // Con candidatos se empieza por el desempate; "Ninguno de estos" cae al alta
  // manual de siempre. Sin candidatos, se entra directo al formulario manual.
  const hasCandidates = (candidates?.length ?? 0) > 0;
  const [manual, setManual] = useState(!hasCandidates);
  const [picking, startPick] = useTransition();
  const [pickError, setPickError] = useState(false);
  const [done, setDone] = useState(false);

  if (state.done || done) {
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

      {!manual && hasCandidates ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">{t("ambiguous.hint")}</p>
          <CandidateList
            candidates={candidates!}
            disabled={picking}
            onChoose={(candidate) =>
              startPick(async () => {
                setPickError(false);
                const result = await resolvePendingRowWithCandidate(
                  pendingId,
                  itemType,
                  candidate,
                );
                if (result.done) setDone(true);
                else setPickError(true);
              })
            }
          />
          {pickError && (
            <p className="text-sm text-status-dropped">
              {t("unmatchedForm.errors.generic")}
            </p>
          )}
          <Button
            type="button"
            variant="ghost"
            className="self-start"
            onClick={() => setManual(true)}
            disabled={picking}
          >
            {t("ambiguous.none")}
          </Button>
        </div>
      ) : (
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

          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="secondary" disabled={pending} className="self-start">
              {pending ? t("unmatchedForm.submitting") : t("resolveForOwner")}
            </Button>
            {hasCandidates && (
              <Button
                type="button"
                variant="ghost"
                className="self-start"
                onClick={() => setManual(false)}
                disabled={pending}
              >
                {t("ambiguous.back")}
              </Button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
