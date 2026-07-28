"use client";

import { useMemo, useState, useTransition } from "react";
import { saveSequence } from "@/lib/sagas/sequence-actions";
import { validateSequenceDraft } from "@/lib/sagas/validate-sequence-draft";
import type { TandemMode, WindowReason } from "@/lib/sagas/types";
import {
  addEntry, clearAnchor, draftWindowOwners, moveSlot, pairWith, removeEntry, sendTo, setAnchor,
  setOptional, setRole, setTandemMeta, setWindowReason, toPayload, unpair,
  type DraftAnchor, type DraftEntry, type SequenceDraft, type ZoneId,
} from "@/lib/sagas/sequence-draft";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

/** ÚNICA fuente de estado del editor (restricción global del plan). Las dos
 *  cáscaras —A escritorio, B móvil— consumen esto; ninguna guarda estado del
 *  borrador por su cuenta. Duplicarlo por breakpoint serían dos borradores
 *  vivos sobre los mismos datos (regla de los dos árboles, docs/redesign). */
export function useSequenceDraft(
  initial: SequenceDraft,
  sagaId: string,
  childIds: string[],
  // Claves del subárbol entero (`getAnchorOptions`, resuelto en servidor y
  // pasado como array plano — "server-only" no puede cruzar al cliente).
  // El componente las reconstruye en un Set solo para esta comprobación
  // local; el guardado de verdad vuelve a resolverlas en `saveSequence`.
  anchorKeys: string[],
) {
  const [draft, setDraft] = useState(initial);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const touch = (fn: (d: SequenceDraft) => SequenceDraft) => {
    setDraft((d) => fn(d));
    setStatus("dirty");
  };

  const ops = useMemo(
    () => ({
      moveSlot: (i: number, delta: number) => touch((d) => moveSlot(d, i, delta)),
      sendTo: (key: string, zone: ZoneId) => touch((d) => sendTo(d, key, zone)),
      pairWith: (key: string, slot: number) => touch((d) => pairWith(d, key, slot)),
      unpair: (i: number) => touch((d) => unpair(d, i)),
      setOptional: (key: string, v: boolean) => touch((d) => setOptional(d, key, v)),
      setRole: (key: string, r: DraftEntry["role"]) => touch((d) => setRole(d, key, r)),
      // Fase 2: metadatos del HUECO, no de una fila — por eso va por índice de
      // hueco y no por `key`, a diferencia de todas las de arriba.
      setTandemMeta: (i: number, meta: { mode?: TandemMode | null; note?: string | null }) =>
        touch((d) => setTandemMeta(d, i, meta)),
      add: (e: DraftEntry) => touch((d) => addEntry(d, e)),
      remove: (key: string) => touch((d) => removeEntry(d, key)),
      // Fase 2b: única forma de poner/quitar un ancla. Las funciones puras ya
      // existían (sequence-draft.ts) pero ningún componente las llamaba —
      // `WindowEditor`/`AnchorPicker` son los primeros.
      setAnchor: (key: string, side: "after" | "before", anchor: DraftAnchor) =>
        touch((d) => setAnchor(d, key, side, anchor)),
      clearAnchor: (key: string, side: "after" | "before") =>
        touch((d) => clearAnchor(d, key, side)),
      // Fase 3: por qué existe el tramo. Va por `key` como las dos de arriba
      // —es del SUJETO, no del hueco— y es un no-op si no hay ventana viva.
      setWindowReason: (key: string, reason: WindowReason | null) =>
        touch((d) => setWindowReason(d, key, reason)),
    }),
    [],
  );

  // El aviso se recalcula con el borrador, no al guardar: la barra tiene que
  // decir cuántas sin clasificar quedan MIENTRAS se cura, no después.
  const anchorKeySet = useMemo(() => new Set(anchorKeys), [anchorKeys]);
  const check = useMemo(
    () =>
      validateSequenceDraft(toPayload(draft, sagaId), {
        childIds: new Set(childIds),
        anchorKeys: anchorKeySet,
        windowOwners: draftWindowOwners(draft),
      }),
    [draft, sagaId, childIds, anchorKeySet],
  );

  const save = () =>
    startTransition(async () => {
      setStatus("saving");
      const res = await saveSequence(sagaId, toPayload(draft, sagaId), childIds);
      if (res.error) {
        setError(res.error);
        setStatus("error");
        return;
      }
      // El borrador guardado deja de tener bajas pendientes y de tener altas
      // "nuevas": si no se limpian, un segundo Guardar reenviaría un DELETE de
      // algo ya borrado y `removeEntry` trataría como nueva una fila que ya
      // existe en BD.
      setDraft((d) => ({
        ...d,
        removed: [],
        slots: d.slots.map((s) => ({ ...s, entries: s.entries.map((e) => ({ ...e, isNew: false })) })),
        free: d.free.map((e) => ({ ...e, isNew: false })),
        unclassified: d.unclassified.map((e) => ({ ...e, isNew: false })),
      }));
      setError(null);
      setStatus("saved");
    });

  // No se devuelve `check.errors`: con esta interfaz esos errores son
  // inalcanzables (el número lo deriva la posición, la zona el placement) y
  // `saveSequence` los vuelve a validar en servidor antes del RPC. Exponerlos
  // aquí sería API muerta.
  return {
    draft,
    ops,
    save,
    error,
    unclassified: check.unclassified,
    status: pending ? ("saving" as const) : status,
  };
}
