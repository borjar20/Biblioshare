"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SequenceRow } from "./sequence-row";
import { TandemMetaEditor } from "./tandem-meta-editor";
import { WindowEditor } from "./window-editor";
import { BlockWindowsDrawer } from "./block-windows-drawer";
import type { DraftAnchor, DraftEntry, SequenceDraft, ZoneId } from "@/lib/sagas/sequence-draft";
import type { TandemMode } from "@/lib/sagas/types";

const TABS: ZoneId[] = ["sequence", "free", "unclassified"];

// Propuesta B (frames B1/B2): una zona a la vez. A 400px apilar tres zonas de
// las que dos estarán vacías el día 1 empujaría la lista de 5 obras —el caso
// real— fuera de la pantalla.
//
// La pestaña activa SÍ es estado local: es preferencia de vista, no borrador.
// El borrador sigue llegando por props (restricción global del plan).
export function ShellMobile({
  draft, ops, anchors, onMenu, rail, itineraries,
}: {
  draft: SequenceDraft;
  ops: {
    moveSlot: (i: number, delta: number) => void;
    sendTo: (key: string, zone: ZoneId) => void;
    unpair: (i: number) => void;
    setOptional: (key: string, v: boolean) => void;
    setRole: (key: string, r: DraftEntry["role"]) => void;
    setAnchor: (key: string, side: "after" | "before", anchor: DraftAnchor) => void;
    clearAnchor: (key: string, side: "after" | "before") => void;
    /** Fase 2: por ÍNDICE de hueco, no por `key` — los metadatos son del hueco. */
    setTandemMeta: (i: number, meta: { mode?: TandemMode | null; note?: string | null }) => void;
  };
  /** Subárbol entero (`getAnchorOptions`), para el selector de ancla de cada
   *  fila de «Cuando quieras». */
  anchors: DraftAnchor[];
  onMenu: (key: string) => void;
  /** El mismo nodo que en escritorio, aquí plegado: en 400px el buscador de
   *  catálogo y los itinerarios no pueden ocupar sitio permanente. */
  rail: React.ReactNode;
  itineraries: React.ReactNode;
}) {
  const t = useTranslations("sagaEditor");
  const [tab, setTab] = useState<ZoneId>("sequence");
  const counts: Record<ZoneId, number> = {
    sequence: draft.slots.reduce((n, s) => n + s.entries.length, 0),
    free: draft.free.length,
    unclassified: draft.unclassified.length,
  };

  const row = (e: DraftEntry, slotNumber: number | null) => {
    const sequenceRow = (
      <SequenceRow
        key={e.key} entry={e} slotNumber={slotNumber} density="roomy"
        onOptional={(v) => ops.setOptional(e.key, v)}
        onRole={(r) => ops.setRole(e.key, r)}
        onMenu={() => onMenu(e.key)}
      />
    );
    // Igual que en la cáscara de escritorio: sin cajón, la fila va DESNUDA para
    // no meter un `<div>` entre ella y el `WindowEditor` de la zona `free`.
    if (e.kind !== "block" || !e.childSagaId) return sequenceRow;
    return (
      <div key={e.key}>
        {sequenceRow}
        <BlockWindowsDrawer
          childSagaId={e.childSagaId}
          nested={draft.nested}
          anchors={anchors}
          onSetAnchor={ops.setAnchor}
          onClearAnchor={ops.clearAnchor}
        />
      </div>
    );
  };

  return (
    <div className="px-3.5">
      {/* No es un tablist: eso exige aria-controls, role="tabpanel", navegación
          con flechas y roving tabindex, y aquí solo hay Tab + Enter/Espacio.
          Anotar "pestaña" sin ese comportamiento es peor que no anotar nada —
          un grupo de botones normales es honesto con lo que hay. */}
      <div role="group" aria-label={t("zonePickerLabel")} className="flex gap-1 rounded-xl bg-surface-muted p-1">
        {TABS.map((z) => (
          <button
            key={z} type="button" aria-pressed={tab === z} onClick={() => setTab(z)}
            className={`flex-1 rounded-lg px-1 py-2 text-center text-[11.5px] font-semibold leading-tight ${
              tab === z ? "bg-surface text-foreground shadow-sm" : z === "unclassified" && counts.unclassified > 0 ? "text-gold-ink" : "text-muted-foreground"
            }`}
          >
            {t(`zone.${z}`)}
            <span className="mt-0.5 block font-mono text-[9px] text-foreground-faint">{counts[z]}</span>
          </button>
        ))}
      </div>

      {tab === "sequence" && (
        <div className="mt-3">
          <p className="mb-2.5 text-[12px] text-muted-foreground">{t("zoneSequenceHintMobile")}</p>
          <div className="grid gap-2">
            {draft.slots.map((slot, i) =>
              slot.entries.length === 1 ? row(slot.entries[0], i + 1) : (
                // La key sale del contenido del hueco (las keys de sus entradas), nunca
                // del índice: con key={`slot-${i}`}, reordenar hace que React desmonte y
                // remonte el nodo, perdiendo el foco justo del control que el usuario
                // acaba de pulsar. Mismo precedente que route-editor.tsx y shell-desktop.tsx.
                <div key={slot.entries.map((e) => e.key).join("+")} className="flex items-stretch gap-2">
                  <div className="flex w-6 shrink-0 flex-col items-center gap-1 pt-2">
                    <span className="font-mono text-[15px] text-accent">{i + 1}</span>
                    <span className="w-0.5 flex-1 rounded bg-accent/40" aria-hidden />
                  </div>
                  <div className="grid min-w-0 flex-1 gap-1.5">
                    <p className="pl-1 font-mono text-[8.5px] uppercase tracking-[0.1em] text-accent">{t("tandemCaption")}</p>
                    {slot.entries.map((e) => row(e, null))}
                    <TandemMetaEditor
                      slotNumber={i + 1}
                      mode={slot.mode}
                      note={slot.note}
                      onChange={(meta) => ops.setTandemMeta(i, meta)}
                    />
                    <button type="button" onClick={() => ops.unpair(i)} aria-label={t("unpairFor", { n: i + 1 })} className="rounded-lg border border-dashed border-border py-1.5 text-[11px] font-semibold text-muted-foreground">
                      {t("unpair")}
                    </button>
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      )}

      {tab === "free" && (
        <div className="mt-3">
          {draft.free.length === 0 ? (
            <div className="rounded-xl border border-dashed border-foreground/25 bg-surface/55 px-4 py-4.5">
              <h2 className="font-serif text-[15px] font-semibold">{t("zoneFreeEmpty")}</h2>
              <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{t("zoneFreeHint")}</p>
            </div>
          ) : (
            <div className="grid gap-2">
              {draft.free.map((e) => (
                <div key={`free-${e.key}`}>
                  {row(e, null)}
                  <WindowEditor
                    subject={e}
                    anchors={anchors}
                    onSetAnchor={(side, anchor) => ops.setAnchor(e.key, side, anchor)}
                    onClearAnchor={(side) => ops.clearAnchor(e.key, side)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "unclassified" && (
        <div className="mt-3">
          <p className="mb-2.5 text-[12px] text-gold-ink">{t("zoneUnclassifiedHint")}</p>
          <div className="grid gap-2">
            {draft.unclassified.map((e) => (
              <div key={e.key} className="grid gap-1.5">
                {row(e, null)}
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => ops.sendTo(e.key, "sequence")} aria-label={t("sendToSequenceFor", { title: e.title })} className="flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-[11px] font-semibold">{t("sendToSequence")}</button>
                  <button type="button" onClick={() => ops.sendTo(e.key, "free")} aria-label={t("sendToFreeFor", { title: e.title })} className="flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-[11px] font-semibold">{t("sendToFree")}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <details className="mt-4 rounded-xl border border-border bg-surface px-3 py-2.5">
        <summary className="text-[13px] font-semibold">{t("addEntry")}</summary>
        <div className="mt-2">{rail}</div>
      </details>
      <div className="mb-28 mt-2.5">{itineraries}</div>
    </div>
  );
}
