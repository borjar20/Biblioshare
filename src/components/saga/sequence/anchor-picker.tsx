"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { anchorKey, type DraftAnchor } from "@/lib/sagas/sequence-draft";
import { normalizeTitle } from "@/lib/catalog/title-match";

/** Selector de ancla de una ventana (fase 2b): a qué obra o bloque del
 *  subárbol se ancla una entrada `libre`. Clon deliberado de
 *  `tandem-picker.tsx` — ese componente ya resolvió, con dos rondas de
 *  revisión, los mismos tres problemas que este selector necesitaba: radios
 *  nativos (`<fieldset>` + `<input type="radio">` en `<label>`, no un
 *  `radiogroup` a mano — promete una semántica que no cumple), filtro que
 *  normaliza acentos, estado vacío explicado, y `<dialog>` nativo con
 *  `showModal()` centrado en escritorio / hoja abajo en móvil, cortando en
 *  `lg` (mismo criterio que `row-sheet.tsx`). Repetirlo desde cero sería
 *  repetir sus tres bugs.
 *
 *  Nunca se ofrece el propio sujeto (`entryKey`): anclar algo a sí mismo no
 *  significa nada y `windowSelfAnchor` lo rechazaría igual en el guardado. */
export function AnchorPicker({
  entryKey, side, anchors, onPick, onCancel,
}: {
  entryKey: string;
  side: "after" | "before";
  anchors: DraftAnchor[];
  onPick: (anchor: DraftAnchor) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("sagaEditor");
  const [filter, setFilter] = useState("");
  const [chosen, setChosen] = useState<number | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);

  const label = t(side === "after" ? "windowAddAfter" : "windowAddBefore");
  const normalizedFilter = normalizeTitle(filter);
  const options = anchors
    .map((anchor, i) => ({ anchor, i }))
    .filter(({ anchor }) => anchorKey(anchor) !== entryKey)
    .filter(({ anchor }) => normalizeTitle(anchor.title).includes(normalizedFilter));

  return (
    <dialog
      ref={ref}
      onClose={onCancel}
      aria-label={label}
      onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
      // Mismo criterio que `row-sheet.tsx` y `tandem-picker.tsx`: hoja abajo
      // con la cáscara móvil, modal centrado con la de escritorio, y el corte
      // en `lg` — el mismo breakpoint en que se cambian las cáscaras.
      className="m-auto mb-0 mt-auto max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-[18px] border border-border bg-surface p-0 text-foreground backdrop:bg-scrim lg:mb-auto lg:rounded-2xl"
    >
      <div className="p-4">
        <div className="mb-2.5 flex items-center gap-2.5">
          <input
            value={filter} onChange={(e) => setFilter(e.target.value)}
            placeholder={t("anchorPickerFilter")} aria-label={t("anchorPickerFilter")}
            className="w-full min-w-0 flex-1 rounded-lg border border-border bg-surface-muted px-2.5 py-2 text-[12.5px]"
          />
          <button type="button" onClick={() => ref.current?.close()} aria-label={t("close")} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border">✕</button>
        </div>
        <fieldset>
          <legend className="sr-only">{label}</legend>
          {options.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">{t("anchorPickerEmpty")}</p>
          ) : (
            <ul className="grid gap-1.5">
              {options.map(({ anchor, i }) => (
                // Índice = posición ORIGINAL en `anchors`, no en la lista
                // filtrada, y seguro como key por la misma razón que en
                // `tandem-picker.tsx`: el <dialog> modal deja el fondo
                // `inert`, así que `anchors` no puede reordenarse mientras
                // esto está abierto, y el filtro conserva el orden.
                <li key={i}>
                  <label
                    className={`flex w-full items-center gap-2.5 rounded-xl border px-2 py-2 text-left ${chosen === i ? "border-accent/50" : "border-border"}`}
                  >
                    <input
                      type="radio" name="anchor-option" value={i} checked={chosen === i}
                      onChange={() => setChosen(i)} className="sr-only"
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px]">{anchor.title}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
        <div aria-live="polite">
          <button
            type="button" disabled={chosen === null}
            // Mismo criterio que `tandem-picker.tsx`: `chosen` YA es el índice
            // original en `anchors` (viene de `options.map`, no de la lista
            // filtrada), así que se usa directo — buscarlo de nuevo en
            // `options` fallaba en silencio si un filtro posterior a la
            // elección lo dejaba fuera de la lista filtrada.
            onClick={() => { if (chosen !== null) onPick(anchors[chosen]); }}
            className="mt-3 w-full rounded-lg bg-accent py-2.5 text-[12.5px] font-semibold text-accent-foreground disabled:opacity-50"
          >
            {label}
          </button>
        </div>
      </div>
    </dialog>
  );
}
