"use client";

import { useTranslations } from "next-intl";
import { SequenceRow } from "./sequence-row";
import type { DraftEntry, SequenceDraft, ZoneId } from "@/lib/sagas/sequence-draft";

type Ops = {
  moveSlot: (i: number, delta: number) => void;
  sendTo: (key: string, zone: ZoneId) => void;
  unpair: (i: number) => void;
  setOptional: (key: string, v: boolean) => void;
  setRole: (key: string, r: DraftEntry["role"]) => void;
};

// Propuesta A (frame A3): las tres zonas a la vez. Verlas juntas es lo que
// enseña que «Cuando quieras» y «opcional» son ejes distintos, y en 1280 hay
// sitio de sobra. Sin estado del borrador: todo llega por props (restricción
// global del plan).
export function ShellDesktop({
  draft, ops, onMenu, rail, itineraries,
}: {
  draft: SequenceDraft;
  ops: Ops;
  onMenu: (key: string) => void;
  /** Rail ya construido por `SequenceEditor` (necesita callbacks del borrador). */
  rail: React.ReactNode;
  itineraries: React.ReactNode;
}) {
  const t = useTranslations("sagaEditor");

  const nudges = (i: number, title: string) => (
    <div className="flex shrink-0 gap-0.5">
      <button
        type="button" onClick={() => ops.moveSlot(i, -1)} disabled={i === 0} aria-label={t("moveUpFor", { title })}
        className="grid h-6 w-6 place-items-center rounded-lg border border-border text-[10px] text-muted-foreground disabled:opacity-40"
      >↑</button>
      <button
        type="button" onClick={() => ops.moveSlot(i, 1)} disabled={i === draft.slots.length - 1} aria-label={t("moveDownFor", { title })}
        className="grid h-6 w-6 place-items-center rounded-lg border border-border text-[10px] text-muted-foreground disabled:opacity-40"
      >↓</button>
    </div>
  );

  const row = (e: DraftEntry, slotNumber: number | null, controls?: React.ReactNode) => (
    <SequenceRow
      key={e.key} entry={e} slotNumber={slotNumber} density="compact" controls={controls}
      onOptional={(v) => ops.setOptional(e.key, v)}
      onRole={(r) => ops.setRole(e.key, r)}
      onMenu={() => onMenu(e.key)}
    />
  );

  return (
    <div className="grid grid-cols-[1fr_372px] gap-6 px-6 pb-24 pt-5">
      <div>
        <div className="mb-1.5 flex items-center gap-2">
          <h2 className="font-serif text-[19px] font-semibold">{t("zoneSequence")}</h2>
          <span className="ml-auto font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            {t("slotCount", { count: draft.slots.length })}
          </span>
        </div>
        <p className="mb-3 text-[12px] text-muted-foreground">{t("zoneSequenceHint")}</p>

        <div className="grid gap-2">
          {draft.slots.map((slot, i) =>
            slot.length === 1 ? (
              row(slot[0], i + 1, nudges(i, slot[0].title))
            ) : (
              // La key sale del contenido del hueco (las keys de sus entradas), nunca
              // del índice: con key={`slot-${i}`}, reordenar hace que React desmonte y
              // remonte el nodo, perdiendo el foco justo del botón ↑/↓ que el usuario
              // acaba de pulsar. Mismo precedente que route-editor.tsx.
              <div key={slot.map((e) => e.key).join("+")} className="flex items-stretch gap-2">
                <div className="flex w-14 shrink-0 flex-col items-center gap-1 pt-2">
                  <span className="font-mono text-[15px] text-accent">{i + 1}</span>
                  {nudges(i, slot.map((e) => e.title).join(" + "))}
                  <span className="w-0.5 flex-1 rounded bg-accent/40" aria-hidden />
                </div>
                <div className="grid min-w-0 flex-1 gap-1.5">
                  <p className="pl-1 font-mono text-[8.5px] uppercase tracking-[0.1em] text-accent">{t("tandemCaption")}</p>
                  {slot.map((e) => row(e, null))}
                  <button
                    type="button" onClick={() => ops.unpair(i)}
                    className="w-full rounded-lg border border-dashed border-border py-1.5 text-[11.5px] font-semibold text-muted-foreground"
                  >{t("unpair")}</button>
                </div>
              </div>
            ),
          )}
        </div>

        <Zone title={t("zoneFree")} hint={t("zoneFreeHint")} empty={draft.free.length === 0} emptyTitle={t("zoneFreeEmpty")}>
          {draft.free.map((e) => row(e, null))}
        </Zone>

        {draft.unclassified.length > 0 && (
          <section className="mt-5 rounded-xl border border-gold/45 bg-gold/[0.07] p-3.5">
            <div className="mb-1 flex items-center gap-2">
              <h2 className="font-serif text-[15px]">{t("zoneUnclassified")}</h2>
              <span className="ml-auto font-mono text-[10px] uppercase tracking-wide text-gold-ink">
                {t("debtCount", { count: draft.unclassified.length })}
              </span>
            </div>
            <p className="mb-2.5 text-[12px] text-gold-ink">{t("zoneUnclassifiedHint")}</p>
            <div className="grid gap-2">
              {draft.unclassified.map((e) => (
                <div key={e.key} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">{row(e, null)}</div>
                  <button type="button" onClick={() => ops.sendTo(e.key, "sequence")} aria-label={t("sendToSequenceFor", { title: e.title })} className="shrink-0 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] font-semibold">
                    {t("sendToSequence")}
                  </button>
                  <button type="button" onClick={() => ops.sendTo(e.key, "free")} aria-label={t("sendToFreeFor", { title: e.title })} className="shrink-0 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] font-semibold">
                    {t("sendToFree")}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <aside className="grid content-start gap-3.5">
        {rail}
        {itineraries}
      </aside>
    </div>
  );
}

function Zone({ title, hint, empty, emptyTitle, children }: {
  title: string; hint: string; empty: boolean; emptyTitle: string; children: React.ReactNode;
}) {
  return (
    <section className={`mt-5 rounded-xl border border-dashed border-foreground/25 p-3.5 ${empty ? "bg-surface/55" : ""}`}>
      <div className="mb-1.5 flex items-center gap-2">
        <h2 className="font-serif text-[15px]">{title}</h2>
      </div>
      <p className="text-[12px] leading-relaxed text-muted-foreground">{hint}</p>
      {empty ? (
        <p className="mt-1 text-[12px] text-muted-foreground">{emptyTitle}</p>
      ) : (
        <div className="mt-2.5 grid gap-2">{children}</div>
      )}
    </section>
  );
}
