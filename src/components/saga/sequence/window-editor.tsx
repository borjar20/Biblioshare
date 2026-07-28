"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { DraftAnchor, DraftWindow } from "@/lib/sagas/sequence-draft";
import type { WindowReason } from "@/lib/sagas/types";
import { AnchorPicker } from "./anchor-picker";

type Side = "after" | "before";

/** «Sin declarar» primero, y como opción de verdad: es lo que distingue «no lo
 *  sabemos» de «da igual», el mismo criterio que el modo del tándem (fase 2). */
const REASONS = [null, "spoiler", "contexto"] as const;

/** Curación de la ventana de una entrada `libre` (fase 2b): «Nacidos Era 2 es
 *  opcional, A PARTIR DE Era 1, y recomendable ANTES DE Viento y Verdad».
 *  Vive bajo cada fila de la zona «Cuando quieras» y, desde la fase 4, también
 *  bajo cada sujeto del cajón de un bloque; fuera de ahí `subject.window`
 *  siempre es null y este componente no se monta (lo decide el llamante, no
 *  este componente — `sequence-draft.ts` ya hace de `setAnchor` un no-op fuera
 *  de `free`/`nested`, pero la interfaz ni siquiera debe ofrecer el control ahí).
 *
 *  Como máximo DOS anclas (una «a partir de», una «antes de»): con las dos
 *  puestas el botón de añadir desaparece — el tope se ve alcanzado, no solo se
 *  aplica en silencio. */
export function WindowEditor({
  subject, anchors, onSetAnchor, onClearAnchor, onSetReason,
}: {
  /** Lo mínimo que este componente necesita. Prop genérica (fase 4) y no una
   *  `DraftEntry`: el mismo editor sirve para una entrada `libre` de esta saga
   *  y para un SUJETO ANIDADO —una obra de una hija, que no es fila de esta
   *  pantalla y no tiene ni zona ni número. */
  subject: { key: string; title: string; window: DraftWindow | null };
  /** Subárbol entero (`getAnchorOptions`), para ofrecer en `AnchorPicker`. */
  anchors: DraftAnchor[];
  onSetAnchor: (side: Side, anchor: DraftAnchor) => void;
  onClearAnchor: (side: Side) => void;
  /** Fase 3: por qué existe el tramo. Solo se ofrece con ventana viva. */
  onSetReason: (reason: WindowReason | null) => void;
}) {
  const t = useTranslations("sagaEditor");
  const [picking, setPicking] = useState<Side | null>(null);
  // No se llama `window`: sombrearía el global del navegador.
  const draftWindow = subject.window;
  const after = draftWindow?.after ?? null;
  const before = draftWindow?.before ?? null;
  const bothSet = after !== null && before !== null;

  // Un ancla rota (la obra o el bloque al que apuntaba ya no está en el
  // subárbol) no llega hasta aquí: `hydrateWindows` (get-saga-sequence.ts) la
  // descarta en silencio al hidratar y queda a `null`. No hay marcador que
  // pintar ni botón de "olvidada" que ofrecer — se pierde sin más, a cambio de
  // no montar la maquinaria que distinguiría "rota pero ya guardada" de "ajena
  // y nueva" (`windowForeignAnchor` ya rechaza justo eso en el guardado).
  const chip = (side: Side, anchor: DraftAnchor) => {
    const label = t(side === "after" ? "windowAfter" : "windowBefore");
    return (
      <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-surface-muted px-2 py-1 text-[11px] text-foreground">
        <span className="font-semibold">{label}</span>
        <span className="min-w-0 truncate">{anchor.title}</span>
        <button
          type="button"
          onClick={() => onClearAnchor(side)}
          aria-label={t("windowRemoveAnchor", { anchor: anchor.title, title: subject.title })}
          className="grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] leading-none"
        >
          ✕
        </button>
      </span>
    );
  };

  return (
    <div className="mt-1.5 grid gap-1.5">
      {/* La fila de anclas va en su propio contenedor, y el `data-testid` NO es
          decorativo: `e2e/sagas-ventanas.spec.ts` cuenta los botones de AQUÍ
          para demostrar que no hay ninguna vía de añadir una tercera ancla.
          Contando los del componente entero, las pastillas del motivo harían
          caer ese test por el motivo equivocado. */}
      <div data-testid="window-anchors" className="flex flex-wrap items-center gap-1.5">
        {after && chip("after", after)}
        {before && chip("before", before)}
        {!bothSet && (
          <button
            type="button"
            onClick={() => setPicking(after ? "before" : "after")}
            aria-label={t(
              draftWindow === null ? "windowAddFor" : after ? "windowAddBeforeFor" : "windowAddAfterFor",
              { title: subject.title },
            )}
            className="rounded-lg border border-dashed border-border px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground"
          >
            {draftWindow === null ? t("windowAdd") : after ? t("windowAddBefore") : t("windowAddAfter")}
          </button>
        )}
      </div>

      {/* Solo con ventana viva: sin ningún ancla no hay tramo del que decir por
          qué existe, y `setWindowReason` ignoraría el cambio igualmente — pero
          la interfaz tampoco debe ofrecer el control ahí. Quitar la última
          ancla hace desaparecer estas pastillas y el motivo con ellas. */}
      {draftWindow !== null && (
        <div data-testid="window-reason" className="grid gap-1">
          <span className="font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground">
            {t("windowReasonTitle")}
          </span>
          <div
            role="group"
            aria-label={t("windowReasonAria", { title: subject.title })}
            className="flex flex-wrap gap-1.5"
          >
            {REASONS.map((r) => (
              <button
                key={r ?? "none"}
                type="button"
                onClick={() => onSetReason(r)}
                aria-pressed={draftWindow.reason === r}
                className={`rounded-full border px-2.5 py-1 text-[11px] ${
                  draftWindow.reason === r
                    ? "border-accent bg-accent/10 font-semibold"
                    : "border-border text-muted-foreground"
                }`}
              >
                {r === null
                  ? t("windowReasonNone")
                  : r === "spoiler"
                    ? t("windowReasonSpoiler")
                    : t("windowReasonContexto")}
              </button>
            ))}
          </div>
        </div>
      )}

      {picking && (
        <AnchorPicker
          entryKey={subject.key}
          side={picking}
          anchors={anchors}
          onPick={(a) => { onSetAnchor(picking, a); setPicking(null); }}
          onCancel={() => setPicking(null)}
        />
      )}
    </div>
  );
}
