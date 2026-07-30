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
import { RatingDots } from "@/components/ui/rating-dots";
import { Button } from "@/components/ui/button";
import { useMentionAutocomplete } from "@/components/social/use-mention-autocomplete";

const initialState: ClosePassState = {};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Diferencia entre dos notas 1-10 en la escala que se ENSEÑA (la de 5 dots,
// donde un dot = 2 puntos), con signo siempre visible ("+1", "-0,5"…) —
// locale es-ES, coma decimal. Se llamaba starsDelta y su etiqueta acababa en
// "★"; la app ya no tiene estrellas (ver rating-dots.tsx), así que el delta va
// sin unidad: el número está en la misma escala que el "4,5" de al lado.
function ratingDelta(current: number, previous: number): string {
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
    <div className="flex flex-col">
      {/* `.h5` del frame: mono, versalitas, apagado (igual que Sesiones). */}
      <h3 className="mb-[11px] font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase lg:mb-[15px]">
        {t("diaryTitle")}
      </h3>

      {passes.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
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
                  editionLabel={
                    edition ? formatEdition(edition, itemType) : null
                  }
                  deltaLabel={
                    showDelta
                      ? t(diff > 0 ? "delta" : "deltaDown", {
                          delta: ratingDelta(pass.rating!, previous!.rating!),
                        })
                      : null
                  }
                  deltaUp={showDelta ? diff > 0 : null}
                  // Los pases viejos se atenúan (`opacity:.8` del frame): el
                  // de arriba es el que cuenta ahora.
                  isOld={i > 0}
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
  isOld,
}: {
  pass: Pass;
  n: number;
  itemType: ItemType;
  itemId: string;
  editionLabel: string | null;
  deltaLabel: string | null;
  /** true = subió, false = bajó, null = sin delta que mostrar. */
  deltaUp: boolean | null;
  /** No es el pase más reciente: se atenúa (`opacity:.8` del frame). */
  isOld: boolean;
}) {
  const t = useTranslations("passes");
  const format = useFormatter();
  const accent = MEDIA_ACCENT[itemType];
  const [editing, setEditing] = useState(false);
  const [isDeleting, startDeleteTransition] = useTransition();
  const [rating, setRating] = useState<number | null>(pass.rating);
  const [review, setReview] = useState(pass.review ?? "");
  const mention = useMentionAutocomplete({
    value: review,
    onChange: setReview,
    scope: { scope: "profile" },
  });
  const [state, formAction, pending] = useActionState(
    updatePass.bind(null, pass.id, itemType, itemId),
    initialState,
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

  // `.diary-entry` del frame: sobre --surface-muted (el --surface-2 del
  // handoff), radio 10 y 13 de padding.
  return (
    <div
      // El ordinal ("2.ª lectura") lo dice TAMBIÉN la cabecera del pase
      // activo (§2.13): sin un asidero propio, un getByText por ese texto
      // casaría con los dos y el e2e reventaría por modo estricto.
      data-testid="diary-entry"
      className={`flex flex-col rounded-[10px] border border-border bg-surface-muted p-[13px] text-xs ${
        isOld ? "opacity-80" : ""
      }`}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <RatingDots value={pass.rating} size="sm" />
        {deltaLabel && (
          <span
            className={`ml-auto font-mono text-[10px] ${
              deltaUp ? "text-status-completed" : "text-status-dropped"
            }`}
          >
            {deltaLabel}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
        {/* "2.ª lectura · 12 mar 2026": el mismo ordinal por tipo de medio que
            usa la cabecera del pase (§2.13), no un genérico "2º pase" — es la
            misma cosa contada en el mismo idioma. */}
        <span>
          {t(`nth.${itemType}`, { n })} · {dateLabel}
        </span>
        {editionLabel && (
          <span
            className={`rounded-chip px-1.5 py-0.5 tracking-wide uppercase ${accent.bgSoft} ${accent.text}`}
          >
            {editionLabel}
          </span>
        )}
      </div>

      {/* `.tx` del frame: prosa, no metadato — va en --foreground-soft (el
          #584f43 del handoff), no en el gris de las etiquetas. */}
      {pass.review && (
        <p className="mt-1 text-[12.5px] leading-[1.55] text-foreground-soft">
          {pass.review}
        </p>
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
            <RatingDots value={rating} onChange={setRating} size="sm" />
            <input type="hidden" name="rating" value={rating ?? ""} />
          </div>

          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              {t("review")}
            </span>
            <div className="relative">
              <textarea
                name="review"
                value={review}
                onChange={(e) => setReview(e.target.value)}
                onInput={mention.onInput}
                onKeyDown={mention.onKeyDown}
                rows={2}
                className="w-full resize-none rounded-md border border-border bg-surface-muted px-2 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              {mention.dropdown}
            </div>
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
