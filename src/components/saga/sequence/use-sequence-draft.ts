"use client";

import { useMemo, useState, useTransition } from "react";
import { saveSequence } from "@/lib/sagas/sequence-actions";
import { validateSequenceDraft } from "@/lib/sagas/validate-sequence-draft";
import {
  addEntry, moveSlot, pairWith, removeEntry, sendTo, setOptional, setRole, toPayload, unpair,
  type DraftEntry, type SequenceDraft, type ZoneId,
} from "@/lib/sagas/sequence-draft";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

/** ÚNICA fuente de estado del editor (restricción global del plan). Las dos
 *  cáscaras —A escritorio, B móvil— consumen esto; ninguna guarda estado del
 *  borrador por su cuenta. Duplicarlo por breakpoint serían dos borradores
 *  vivos sobre los mismos datos (regla de los dos árboles, docs/redesign). */
export function useSequenceDraft(initial: SequenceDraft, sagaId: string, childIds: string[]) {
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
      add: (e: DraftEntry) => touch((d) => addEntry(d, e)),
      remove: (key: string) => touch((d) => removeEntry(d, key)),
    }),
    [],
  );

  // El aviso se recalcula con el borrador, no al guardar: la barra tiene que
  // decir cuántas sin clasificar quedan MIENTRAS se cura, no después.
  const check = useMemo(
    // Las claves del subárbol para `anchorKeys` llegan con el cargador de la tarea que pinte y guarde ventanas; de momento no hay ventanas que enviar.
    () => validateSequenceDraft(toPayload(draft), { childIds: new Set(childIds), anchorKeys: new Set() }),
    [draft, childIds],
  );

  const save = () =>
    startTransition(async () => {
      setStatus("saving");
      const res = await saveSequence(sagaId, toPayload(draft), childIds);
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
        slots: d.slots.map((s) => s.map((e) => ({ ...e, isNew: false }))),
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
