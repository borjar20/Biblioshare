"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import type { DraftEntry, ZoneId } from "@/lib/sagas/sequence-draft";
import { SAGA_ITEM_ROLES, type SagaItemRole } from "@/lib/sagas/types";

// La lista viene de `roles.ts`: era una de las tres copias del mismo
// vocabulario que la fase 5 unificó.
const ROLES = SAGA_ITEM_ROLES;
const ZONES: ZoneId[] = ["sequence", "free", "anchored", "unclassified"];

/** Hoja de una fila (frame B2). Es el gemelo pulsable y tecleable de cada
 *  gesto de arrastre: cambiar de zona, subir, bajar, emparejar y quitar. Sin
 *  ella, la cáscara móvil dependería de arrastrar — prohibido por el plan. */
export function RowSheet({
  entry, zone, slotNumber, canMoveUp, canMoveDown,
  onZone, onRole, onOptional, onMove, onPair, onRemove, onClose,
}: {
  entry: DraftEntry;
  zone: ZoneId;
  slotNumber: number | null;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onZone: (z: ZoneId) => void;
  onRole: (r: SagaItemRole | null) => void;
  onOptional: (v: boolean) => void;
  onMove: (delta: number) => void;
  onPair: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("sagaEditor");
  const ref = useRef<HTMLDialogElement>(null);
  // `<dialog>` nativo con showModal(), como el resto de hojas del repo
  // (item-connect-sheet.tsx, profile-settings-sheet.tsx): trae gratis el cierre
  // con Esc, la trampa de foco y el `inert` del fondo. Reimplementarlo con un
  // div superpuesto sería perder las tres cosas justo en la pieza que existe
  // para cumplir la restricción de accesibilidad del plan.
  useEffect(() => { ref.current?.showModal(); }, []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={entry.title}
      onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
      // Hoja pegada abajo con la cáscara móvil y modal centrado con la de
      // escritorio, en el MISMO breakpoint (`lg`) en que se cambian las
      // cáscaras. Esta hoja se monta una sola vez y la abren las dos, así que
      // sin esto quedaba anclada al fondo también en escritorio, que es donde
      // no significa nada: ahí no hay pulgar al que acercarla.
      className="m-auto mb-0 mt-auto w-full max-w-lg rounded-t-[18px] border border-border bg-surface p-0 text-foreground backdrop:bg-scrim lg:mb-auto lg:rounded-2xl"
    >
      <div className="px-4 pb-5 pt-3.5">
        {/* Asa de arrastre: afordancia táctil, no se pinta en el modal centrado. */}
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-surface-3 lg:hidden" aria-hidden />
        <div className="mb-3.5 flex items-center gap-2.5">
          <div className="min-w-0 flex-1">
            <b className="block truncate font-serif text-[15px] font-semibold">{entry.title}</b>
            <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
              {slotNumber === null ? t(`zone.${zone}`) : t("slotN", { n: slotNumber })}
            </span>
          </div>
          <button type="button" onClick={() => ref.current?.close()} aria-label={t("close")} className="grid h-8 w-8 place-items-center rounded-lg border border-border">✕</button>
        </div>

        <fieldset className="mb-3 grid gap-1.5">
          <legend className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">{t("whereRead")}</legend>
          <div className="grid grid-cols-4 gap-1.5">
            {ZONES.map((z) => (
              <button
                key={z} type="button" onClick={() => onZone(z)} aria-pressed={zone === z}
                className={`rounded-lg border px-1.5 py-2 text-[11.5px] font-semibold ${
                  zone === z ? "border-transparent bg-accent text-accent-foreground" : "border-border bg-surface-muted text-muted-foreground"
                }`}
              >
                {z === "sequence" && slotNumber !== null ? t("slotN", { n: slotNumber }) : t(`zone.${z}`)}
              </button>
            ))}
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">{t("zoneChangeHint")}</p>
        </fieldset>

        {entry.kind === "item" && (
          <label className="mb-3 grid gap-1.5">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">{t("whatIs")}</span>
            <select
              value={entry.role ?? ""}
              onChange={(e) => onRole((e.target.value || null) as SagaItemRole | null)}
              className="rounded-lg border border-border bg-surface-muted px-2.5 py-2 text-[12.5px]"
            >
              <option value="">{t("roleNone")}</option>
              {ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
            </select>
          </label>
        )}

        <label className="mb-3 flex items-center gap-2.5 rounded-lg border border-border px-2.5 py-2.5">
          <input type="checkbox" checked={entry.optional} onChange={(e) => onOptional(e.target.checked)} className="h-4 w-4 rounded border-border" />
          <span className="flex-1 text-[12.5px]">
            {t("optionalTitle")}
            <span className="mt-0.5 block text-[10.5px] text-muted-foreground">{t("optionalHint")}</span>
          </span>
        </label>

        <div className="grid grid-cols-2 gap-1.5">
          {/* Como en shell-desktop.tsx: subir/bajar solo tiene sentido con un
              hueco que ocupar. Fuera de la secuencia quedarían deshabilitados
              para siempre y sin explicación. */}
          {slotNumber !== null && (
            <>
              <button type="button" disabled={!canMoveUp} onClick={() => onMove(-1)} className="rounded-lg border border-border p-2.5 text-[12px] font-semibold disabled:opacity-40">↑ {t("moveUp")}</button>
              <button type="button" disabled={!canMoveDown} onClick={() => onMove(1)} className="rounded-lg border border-border p-2.5 text-[12px] font-semibold disabled:opacity-40">↓ {t("moveDown")}</button>
            </>
          )}
          <button type="button" onClick={onPair} className="col-span-2 rounded-lg border border-border p-2.5 text-left text-[12px] font-semibold">⇥ {t("pairPrompt")}</button>
          {/* Un bloque NO se da de baja desde el borrador: `toPayload` solo lleva a
           *  `removed` las claves `i:`, así que una baja de `s:<uuid>` no viajaría ni
           *  como baja ni en `blocks` — la RPC no se enteraría y la fila de `sagas`
           *  quedaría intacta (huecos compartidos con la fila siguiente al recargar).
           *  Desanidar una subsaga es cambiar `parent_saga_id`, competencia del botón
           *  ⤫ del rail (`onUnnestChild` → `setParentSaga`), no de este borrador. */}
          {entry.kind === "item" && (
            <button type="button" onClick={onRemove} className="col-span-2 rounded-lg border border-border p-2.5 text-left text-[12px] font-semibold text-status-dropped">✕ {t("removeFromSaga")}</button>
          )}
        </div>
      </div>
    </dialog>
  );
}
