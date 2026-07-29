"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { saveRoute } from "@/lib/sagas/route-actions";
import type { RawRouteEntry } from "@/lib/sagas/route-types";
import { hydrateRouteDraft, type RouteEditorItem } from "@/lib/sagas/hydrate-route-draft";
import { computeRouteDiff } from "@/lib/sagas/compute-route-diff";
import { EditorShellMobile } from "./shell-mobile";
import { EditorShellDesktop } from "./shell-desktop";

export type { RouteEditorItem };

/** Editor de los PASOS de un itinerario (issue #261, rediseño Paper de
 *  M5-M7 + D2 sobre #263). Único dueño del estado: `draft`, el snapshot
 *  `initial` (para el diff de la savebar) y si la hoja de añadir está
 *  abierta. Monta las dos cáscaras a la vez y las oculta por breakpoint —
 *  regla de los dos árboles, mismo patrón que `routes/routes-manager.tsx`.
 *  La hoja de añadir es exclusiva de la cáscara móvil (el escritorio usa el
 *  raíl en su lugar), así que se monta dentro de `EditorShellMobile` sin
 *  romper esa regla: nunca hace falta que se vea mientras la cáscara activa
 *  es la de escritorio. */
export function RouteEditor({
  routeId,
  routeName,
  sagaId,
  sagaName,
  descendantIds,
  initialEntries,
  palette,
}: {
  routeId: string;
  routeName: string;
  sagaId: string;
  sagaName: string;
  descendantIds: string[];
  initialEntries: RawRouteEntry[];
  /** Obras del subárbol + subsagas, para añadir pasos. */
  palette: RouteEditorItem[];
}) {
  const t = useTranslations("sagaEditor");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // Snapshot inicial fijo: el diff de la savebar compara SIEMPRE contra lo
  // que había al abrir el editor, no contra el último guardado dentro de la
  // misma sesión. Guardar dispara `revalidateSagaPage`, que remonta este
  // componente con datos frescos — un snapshot nuevo llega solo.
  const [initial] = useState<RouteEditorItem[]>(() => hydrateRouteDraft(initialEntries, palette));
  const [draft, setDraft] = useState<RouteEditorItem[]>(initial);

  const diff = computeRouteDiff(
    initial.map((d) => ({ key: d.key, note: d.entry.note })),
    draft.map((d) => ({ key: d.key, note: d.entry.note })),
  );

  const move = (i: number, delta: number) =>
    setDraft((d) => {
      const j = i + delta;
      if (j < 0 || j >= d.length) return d;
      const next = [...d];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const remove = (key: string) => setDraft((d) => d.filter((x) => x.key !== key));

  // String vacía se guarda como null, no como "": así una nota borrada por
  // completo vuelve a ser "sin nota" en vez de una cadena vacía persistida.
  const setNote = (key: string, note: string | null) =>
    setDraft((d) => d.map((x) => (x.key === key ? { ...x, entry: { ...x.entry, note } } : x)));

  const add = (item: RouteEditorItem) =>
    setDraft((d) => (d.some((x) => x.key === item.key) ? d : [...d, item]));

  const save = () =>
    startTransition(async () => {
      // Renumerar 1..n SIEMPRE antes de enviar: así el reordenado no puede
      // dejar huecos y la validación de posiciones consecutivas nunca falla
      // por un motivo que el curador no puede ver ni corregir.
      const entries: RawRouteEntry[] = draft.map((d, i) => ({ ...d.entry, position: i + 1 }));
      const res = await saveRoute(routeId, sagaId, entries, descendantIds);
      setError(res.error ?? null);
    });

  const stepsLabel = t("routeStepsCount", { count: draft.length });

  const shared = {
    sagaName,
    routeName,
    stepsLabel,
    draft,
    palette,
    diff,
    error,
    pending,
    onMove: move,
    onRemove: remove,
    onNoteChange: setNote,
    onAdd: add,
    onSave: save,
  };

  return (
    <>
      <div className="hidden lg:block">
        <EditorShellDesktop sagaId={sagaId} {...shared} />
      </div>
      <div className="lg:hidden">
        <EditorShellMobile
          addOpen={addOpen}
          onOpenAdd={() => setAddOpen(true)}
          onCloseAdd={() => setAddOpen(false)}
          {...shared}
        />
      </div>
    </>
  );
}
