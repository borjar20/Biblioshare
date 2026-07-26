"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { DraftEntry } from "@/lib/sagas/sequence-draft";
import { normalizeTitle } from "@/lib/catalog/title-match";

/** Paso 2 del tándem (frame C1): elegir a QUÉ hueco se empareja. Se ofrecen los
 *  huecos de la secuencia, nunca el de la propia fila — emparejar algo consigo
 *  mismo no significa nada y `pairWith` lo rechaza igual. */
export function TandemPicker({
  entryKey, slots, onPair, onCancel,
}: {
  entryKey: string;
  slots: DraftEntry[][];
  onPair: (slotIndex: number) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("sagaEditor");
  const [filter, setFilter] = useState("");
  const [chosen, setChosen] = useState<number | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);

  const normalizedFilter = normalizeTitle(filter);
  const options = slots
    .map((slot, i) => ({ slot, i }))
    .filter(({ slot }) => !slot.some((e) => e.key === entryKey))
    .filter(({ slot }) => slot.some((e) => normalizeTitle(e.title).includes(normalizedFilter)));

  return (
    <dialog
      ref={ref}
      onClose={onCancel}
      aria-label={t("pairPrompt")}
      onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
      className="m-auto mb-0 mt-auto max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-[18px] border border-border bg-surface p-0 text-foreground backdrop:bg-scrim sm:mb-auto sm:rounded-2xl"
    >
      <div className="p-4">
        <div className="mb-2.5 flex items-center gap-2.5">
          <input
            value={filter} onChange={(e) => setFilter(e.target.value)}
            placeholder={t("pairFilter")} aria-label={t("pairFilter")}
            className="w-full min-w-0 flex-1 rounded-lg border border-border bg-surface-muted px-2.5 py-2 text-[12.5px]"
          />
          <button type="button" onClick={() => ref.current?.close()} aria-label={t("close")} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border">✕</button>
        </div>
        <fieldset>
          <legend className="sr-only">{t("pairPrompt")}</legend>
          {options.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">{t("pairNoOptions")}</p>
          ) : (
            <ul className="grid gap-1.5">
              {options.map(({ slot, i }) => (
                // El índice como key es seguro aquí: la lista de huecos no se
                // reordena mientras el selector está abierto (es una foto fija del
                // draft en el momento de abrirlo), a diferencia de route-editor.tsx
                // donde reordenar en vivo con key=índice mezclaba filas.
                <li key={i}>
                  <label
                    className={`flex w-full items-center gap-2.5 rounded-xl border px-2 py-2 text-left ${chosen === i ? "border-accent/50" : "border-border"}`}
                  >
                    <input
                      type="radio" name="tandem-slot" value={i} checked={chosen === i}
                      onChange={() => setChosen(i)} className="sr-only"
                    />
                    <span className="w-6 shrink-0 text-center font-mono text-[15px] text-accent">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px]">{slot.map((e) => e.title).join(" · ")}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
        <div aria-live="polite">
          <button
            type="button" disabled={chosen === null} onClick={() => chosen !== null && onPair(chosen)}
            className="mt-3 w-full rounded-lg bg-accent py-2.5 text-[12.5px] font-semibold text-accent-foreground disabled:opacity-50"
          >
            {chosen === null ? t("pairPrompt") : t("pairConfirm", { n: chosen + 1 })}
          </button>
        </div>
      </div>
    </dialog>
  );
}
