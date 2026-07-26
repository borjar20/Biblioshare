"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { DraftAnchor, DraftEntry } from "@/lib/sagas/sequence-draft";
import { AnchorPicker } from "./anchor-picker";

type Side = "after" | "before";

/** Curación de la ventana de una entrada `libre` (fase 2b): «Nacidos Era 2 es
 *  opcional, A PARTIR DE Era 1, y recomendable ANTES DE Viento y Verdad».
 *  Vive bajo cada fila de la zona «Cuando quieras»; fuera de ahí `entry.window`
 *  siempre es null y este componente no se monta (lo decide el llamante, no
 *  este componente — `sequence-draft.ts` ya hace de `setAnchor` un no-op fuera
 *  de `free`, pero la interfaz ni siquiera debe ofrecer el control ahí).
 *
 *  Como máximo DOS anclas (una «a partir de», una «antes de»): con las dos
 *  puestas el botón de añadir desaparece — el tope se ve alcanzado, no solo se
 *  aplica en silencio. */
export function WindowEditor({
  entry, anchors, onSetAnchor, onClearAnchor,
}: {
  entry: DraftEntry;
  /** Subárbol entero (`getAnchorOptions`), para ofrecer en `AnchorPicker`. */
  anchors: DraftAnchor[];
  onSetAnchor: (side: Side, anchor: DraftAnchor) => void;
  onClearAnchor: (side: Side) => void;
}) {
  const t = useTranslations("sagaEditor");
  const [picking, setPicking] = useState<Side | null>(null);
  // No se llama `window`: sombrearía el global del navegador.
  const draftWindow = entry.window;
  const after = draftWindow?.after ?? null;
  const before = draftWindow?.before ?? null;
  const bothSet = after !== null && before !== null;

  // Ancla rota = llegó con el título sin resolver (la obra o el bloque que
  // señalaba ya no está en el árbol). Hoy `hydrateWindows` (get-saga-sequence.ts)
  // descarta en silencio el lado que no resuelve en vez de dejar un marcador, así
  // que esta rama es defensiva — no se alcanza con los datos de hoy, pero es lo
  // que exige el contrato: si algún día un ancla rota SÍ llega con el título
  // vacío en vez de desaparecer, se pinta marcada y quitable, nunca se borra
  // sola (la obra puede volver a la saga).
  const isBroken = (a: DraftAnchor) => a.title === "";

  const chip = (side: Side, anchor: DraftAnchor) => {
    const broken = isBroken(anchor);
    const label = t(side === "after" ? "windowAfter" : "windowBefore");
    const anchorTitle = broken ? t("windowBroken") : anchor.title;
    return (
      <span
        className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] ${
          broken ? "border-status-dropped/50 bg-status-dropped/10 text-status-dropped" : "border-border bg-surface-muted text-foreground"
        }`}
      >
        <span className="font-semibold">{label}</span>
        <span className="min-w-0 truncate">{anchorTitle}</span>
        <button
          type="button"
          onClick={() => onClearAnchor(side)}
          aria-label={t("windowRemoveAnchor", { anchor: anchorTitle, title: entry.title })}
          className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] leading-none"
        >
          ✕
        </button>
      </span>
    );
  };

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {after && chip("after", after)}
      {before && chip("before", before)}
      {!bothSet && (
        <button
          type="button"
          onClick={() => setPicking(after ? "before" : "after")}
          className="rounded-lg border border-dashed border-border px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground"
        >
          {draftWindow === null ? t("windowAdd") : after ? t("windowAddBefore") : t("windowAddAfter")}
        </button>
      )}

      {picking && (
        <AnchorPicker
          entryKey={entry.key}
          side={picking}
          anchors={anchors}
          onPick={(a) => { onSetAnchor(picking, a); setPicking(null); }}
          onCancel={() => setPicking(null)}
        />
      )}
    </div>
  );
}
