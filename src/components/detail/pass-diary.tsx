"use client";

import { useActionState, useState, useTransition } from "react";
import { useTranslations, useFormatter } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import type { Pass } from "@/lib/passes/types";
import type { Edition } from "@/lib/editions/types";
import {
  updatePass,
  deletePass,
  type ClosePassState,
} from "@/lib/passes/actions";
import { formatEdition } from "@/lib/editions/edition-label";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { StarRating } from "@/components/ui/star-rating";
import { Button } from "@/components/ui/button";

const initialState: ClosePassState = {};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Diferencia en estrellas entre dos notas 1-10 (media estrella = 1 punto),
// con signo siempre visible ("+1", "-0,5"…) — locale es-ES, coma decimal.
function starsDelta(current: number, previous: number): string {
  const diff = (current - previous) / 2;
  return diff.toLocaleString("es-ES", {
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
  });
}

// Diario de pases: cada tarjeta es un pase (una lectura/visionado), con el
// delta contra el pase ANTERIOR EN EL TIEMPO — que es el SIGUIENTE elemento
// del array, porque getPasses los da del más reciente al más antiguo (misma
// lógica que el viejo panel de diario, ahora jubilado).
export function PassDiary({
  itemType,
  itemId,
  passes,
  editions,
}: {
  itemType: ItemType;
  itemId: string;
  passes: Pass[];
  editions: Edition[];
}) {
  const t = useTranslations("passes");

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-foreground">
        {t("diaryTitle")}
      </h3>

      {passes.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {passes.map((pass, i) => {
            // Los pases vienen del más reciente al más antiguo: el n-ésimo
            // pase cronológico es al revés del índice del array.
            const n = passes.length - i;
            const previous = passes[i + 1];
            // El pase anterior puede seguir abierto (sin terminar); en ese
            // caso no hay un pase "cerrado" real contra el que comparar.
            const hasDelta =
              pass.rating != null &&
              previous?.rating != null &&
              previous.finishedOn != null;
            const diff = hasDelta ? pass.rating! - previous!.rating! : 0;
            const edition = pass.editionId
              ? (editions.find((e) => e.id === pass.editionId) ?? null)
              : null;

            const showDelta = hasDelta && diff !== 0;

            return (
              <li key={pass.id}>
                <PassCard
                  pass={pass}
                  n={n}
                  itemType={itemType}
                  itemId={itemId}
                  editionLabel={edition ? formatEdition(edition, itemType) : null}
                  deltaLabel={
                    showDelta
                      ? t(diff > 0 ? "delta" : "deltaDown", {
                          delta: `${starsDelta(pass.rating!, previous!.rating!)}★`,
                        })
                      : null
                  }
                  deltaUp={showDelta ? diff > 0 : null}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PassCard({
  pass,
  n,
  itemType,
  itemId,
  editionLabel,
  deltaLabel,
  deltaUp,
}: {
  pass: Pass;
  n: number;
  itemType: ItemType;
  itemId: string;
  editionLabel: string | null;
  deltaLabel: string | null;
  /** true = subió, false = bajó, null = sin delta que mostrar. */
  deltaUp: boolean | null;
}) {
  const t = useTranslations("passes");
  const format = useFormatter();
  const accent = MEDIA_ACCENT[itemType];
  const [editing, setEditing] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();
  const [rating, setRating] = useState<number | null>(pass.rating);
  const [state, formAction, pending] = useActionState(
    updatePass.bind(null, pass.id, itemType, itemId),
    initialState
  );

  // Cerrar el formulario tras un guardado sin error: ajuste de estado
  // durante el render (mismo patrón que EditionStrip/ClosePassSheet), no un
  // useEffect, que aquí dispararía react-hooks/set-state-in-effect.
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (!state.error) setEditing(false);
  }

  const dateLabel = pass.finishedOn
    ? format.dateTime(new Date(pass.finishedOn), {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : t("open");

  // Solo los pases YA cerrados se editan aquí: el editable de un pase
  // abierto es la nota (panel Progreso, ratePass), no esta tarjeta — este
  // formulario comparte updatePass con closePass y ese siempre escribe
  // finished_on, así que abrirlo en un pase abierto lo cerraría de tapadillo.
  const canEdit = pass.finishedOn !== null;

  return (
    <div className="flex flex-col gap-1.5 rounded-card border border-border bg-surface p-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <StarRating value={pass.rating} size="sm" />
        {deltaLabel && (
          <span
            className={`font-mono text-[10px] ${
              deltaUp ? "text-status-completed" : "text-status-dropped"
            }`}
          >
            {deltaLabel}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
        <span>
          {t("pass", { n })} · {dateLabel}
        </span>
        {editionLabel && (
          <span
            className={`rounded-chip px-1.5 py-0.5 tracking-wide uppercase ${accent.bgSoft} ${accent.text}`}
          >
            {editionLabel}
          </span>
        )}
      </div>

      {pass.review && (
        <p className="text-muted-foreground">{pass.review}</p>
      )}

      <div className="flex items-center gap-3 pt-1">
        {canEdit && (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="text-muted-foreground underline hover:text-foreground"
          >
            {editing ? t("cancelEdit") : t("edit")}
          </button>
        )}
        <button
          type="button"
          disabled={isDeleting}
          onClick={() =>
            startDeleteTransition(() => deletePass(pass.id, itemType, itemId))
          }
          className="text-muted-foreground underline hover:text-status-dropped disabled:opacity-60"
        >
          {t("delete")}
        </button>
      </div>

      {canEdit && editing && (
        <form
          action={formAction}
          className="flex flex-col gap-2 border-t border-border pt-2"
        >
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              {t("finishedOn")}
            </span>
            <input
              type="date"
              name="finishedOn"
              defaultValue={pass.finishedOn ?? today()}
              max={today()}
              className="rounded-md border border-border bg-surface-muted px-2 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              {t("rating")}
            </span>
            <StarRating value={rating} onChange={setRating} size="sm" />
            <input type="hidden" name="rating" value={rating ?? ""} />
          </div>

          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              {t("review")}
            </span>
            <textarea
              name="review"
              defaultValue={pass.review ?? ""}
              rows={2}
              className="resize-none rounded-md border border-border bg-surface-muted px-2 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </label>

          <label className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{t("isPublic")}</span>
            <input
              type="checkbox"
              name="isPublic"
              defaultChecked={pass.isPublic}
            />
          </label>

          {state.error && (
            <p className="text-status-dropped">{t(`errors.${state.error}`)}</p>
          )}

          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? t("submitting") : t("submit")}
          </Button>
        </form>
      )}
    </div>
  );
}
