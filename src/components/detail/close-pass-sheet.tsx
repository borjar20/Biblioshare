"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import { closePass, type ClosePassState } from "@/lib/passes/actions";
import { RatingDots } from "@/components/ui/rating-dots";
import { Button } from "@/components/ui/button";
import { useMentionAutocomplete } from "@/components/social/use-mention-autocomplete";

const initialState: ClosePassState = {};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Hoja de cierre de pase: se abre justo después de que el padre marque el
// ítem como leído/visto (StatusSegments → updateStatus). Para ese momento el
// pase YA quedó cerrado en BD (updateStatus le puso finished_on): esta hoja
// solo añade fecha exacta, nota, reseña y visibilidad por encima. "Ahora no"
// no llama a closePass — no hay nada que guardar todavía — el pase se queda
// cerrado sin nota y se puede completar luego desde el diario (updatePass).
//
// Diálogo modal nativo (<dialog> + showModal()): atrapa el foco y cierra con
// Escape sin código propio. El evento nativo "close" (se dispara tanto al
// pulsar Escape como al llamar dialog.close() nosotros mismos) es la única
// vía por la que avisamos al padre — así "Ahora no", el clic fuera y un
// guardado con éxito acaban todos en el mismo sitio.
export function ClosePassSheet({
  passId,
  itemType,
  itemId,
  open,
  onClose,
}: {
  passId: string;
  itemType: ItemType;
  itemId: string;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("passes");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [review, setReview] = useState("");
  const mention = useMentionAutocomplete({
    value: review,
    onChange: setReview,
    scope: { scope: "profile" },
  });
  const [state, formAction, pending] = useActionState(
    closePass.bind(null, passId, itemType, itemId),
    initialState
  );

  // Al reabrir la hoja no queremos arrastrar la nota que hubiera quedado
  // marcada de una vez anterior. Ajuste de estado durante el render (mismo
  // patrón que EditionStrip, ver src/components/detail/edition-strip.tsx)
  // en vez de un useEffect, que aquí dispararía react-hooks/set-state-in-effect.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setRating(null);
  }

  // showModal()/close() son llamadas imperativas al DOM, no setState: no
  // chocan con react-hooks/set-state-in-effect. Solo sincronizan el
  // <dialog> nativo con la prop `open`.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Tras un envío sin error cerramos la hoja llamando a dialog.close(): eso
  // dispara el evento nativo "close" (onClose={onClose} más abajo), que es
  // quien de verdad avisa al padre.
  //
  // "¿Ha habido envío ya?" se resuelve comparando la referencia con
  // `initialState`: useActionState devuelve LA MISMA hasta que una acción
  // resuelve. Antes esto era un `useRef` que se marcaba en la primera pasada
  // del efecto, y StrictMode lo rompía: en desarrollo React invoca los efectos
  // dos veces y el ref sobrevive entre ambas, así que la segunda pasada creía
  // que ya se había enviado y cerraba la hoja nada más abrirse (el auto-cierre
  // al terminar un libro no llegaba a verse). El guard de abajo es idempotente,
  // que es justo lo que la doble invocación exige.
  useEffect(() => {
    if (state === initialState) return;
    if (!state.error) dialogRef.current?.close();
  }, [state]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="close-pass-title"
      className="m-auto w-[min(420px,92vw)] rounded-card border border-border bg-surface p-0 text-foreground shadow-card backdrop:bg-scrim"
      onClick={(event) => {
        // Clic en el propio <dialog> (fuera del contenido) = clic en el
        // fondo: mismo gesto de cierre que Escape.
        if (event.target === dialogRef.current) dialogRef.current?.close();
      }}
    >
      <form key={passId} action={formAction} className="flex flex-col">
        <div className="border-b border-border px-5 py-4">
          <h2
            id="close-pass-title"
            className="font-serif text-lg font-semibold"
          >
            {t("closeTitle")}
          </h2>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          <label className="flex flex-col gap-1.5">
            <span className="label-section">
              {t("finishedOn")}
            </span>
            <input
              type="date"
              name="finishedOn"
              defaultValue={today()}
              max={today()}
              className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="label-section">
              {t("rating")}
            </span>
            <RatingDots value={rating} onChange={setRating} />
            {/* RatingDots es solo presentación: la nota real viaja al
                formulario por este input oculto (1-10, o vacío = sin
                puntuar, que closePass acepta igual que un cierre sin nota). */}
            <input type="hidden" name="rating" value={rating ?? ""} />
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="label-section">
              {t("review")}
            </span>
            <div className="relative">
              <textarea
                name="review"
                value={review}
                onChange={(e) => setReview(e.target.value)}
                onInput={mention.onInput}
                onKeyDown={mention.onKeyDown}
                placeholder={t("reviewPlaceholder")}
                rows={3}
                className="w-full resize-none rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              {mention.dropdown}
            </div>
          </label>

          <label className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{t("isPublic")}</span>
            <span className="relative inline-block h-6 w-11 shrink-0">
              <input
                type="checkbox"
                name="isPublic"
                defaultChecked
                className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
              />
              <span className="pointer-events-none absolute inset-0 rounded-full bg-surface-muted transition-colors peer-checked:bg-accent" />
              <span className="pointer-events-none absolute top-1 left-1 h-4 w-4 rounded-full bg-surface shadow transition-transform peer-checked:translate-x-5" />
            </span>
          </label>

          {state.error && (
            <p className="text-sm text-status-dropped">
              {t(`errors.${state.error}`)}
            </p>
          )}
        </div>

        <div className="flex gap-2.5 border-t border-border px-5 py-4">
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            className="flex-1"
            onClick={() => dialogRef.current?.close()}
          >
            {t("skip")}
          </Button>
          <Button type="submit" disabled={pending} className="flex-1">
            {pending ? t("submitting") : t("submit")}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
