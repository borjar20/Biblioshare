"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { saveRoute } from "@/lib/sagas/route-actions";
import type { RawRouteEntry } from "@/lib/sagas/route-types";
import { hydrateRouteDraft, type RouteEditorItem } from "@/lib/sagas/hydrate-route-draft";
import { Input } from "@/components/ui/input";

export type { RouteEditorItem };

// CHECK de BD (20260723_saga_routes.sql): char_length(note) <= 200. Se
// respeta aquí con maxLength para que el curador vea el límite en el input
// en vez de descubrirlo con un error de guardado.
const NOTE_MAX_LENGTH = 200;

// Editor de los PASOS de un itinerario (Task 9). Botones ↑/↓ en vez de drag &
// drop: la lista es corta, el teclado y el lector de pantalla salen gratis, y
// evita arrastrar @dnd-kit a un bundle nuevo. Si más adelante se quiere DnD,
// el estado ya está en la forma correcta.
export function RouteEditor({
  routeId,
  sagaId,
  descendantIds,
  initialEntries,
  palette,
}: {
  routeId: string;
  sagaId: string;
  descendantIds: string[];
  initialEntries: RawRouteEntry[];
  /** Obras del subárbol + subsagas, para añadir pasos. */
  palette: RouteEditorItem[];
}) {
  const t = useTranslations("sagaEditor");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // La key de cada fila sale del CONTENIDO del paso, nunca del índice: con
  // key={i}, reordenar movería el estado de React (aquí no lo hay, pero
  // RouteBlock sí pliega/despliega con useState) al bloque equivocado —
  // exactamente el hallazgo de la Task 6.
  //
  // La hidratación vive en hydrate-route-draft.ts (función pura, testeada
  // aparte) porque tiene una trampa que ya causó pérdida de datos: la nota
  // guardada en BD hay que conservarla explícitamente, no basta con coger el
  // ítem de la paleta tal cual.
  const [draft, setDraft] = useState<RouteEditorItem[]>(() => hydrateRouteDraft(initialEntries, palette));

  const inDraft = new Set(draft.map((d) => d.key));

  const move = (i: number, delta: number) =>
    setDraft((d) => {
      const j = i + delta;
      if (j < 0 || j >= d.length) return d;
      const next = [...d];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  // String vacía se guarda como null, no como "": así una nota borrada por
  // completo vuelve a ser "sin nota" en vez de una cadena vacía persistida.
  const setNote = (key: string, note: string) =>
    setDraft((d) =>
      d.map((x) => (x.key === key ? { ...x, entry: { ...x.entry, note: note === "" ? null : note } } : x)),
    );

  const save = () =>
    startTransition(async () => {
      // Renumerar 1..n SIEMPRE antes de enviar: así el reordenado no puede
      // dejar huecos y la validación de posiciones consecutivas nunca falla
      // por un motivo que el curador no puede ver ni corregir.
      const entries: RawRouteEntry[] = draft.map((d, i) => ({ ...d.entry, position: i + 1 }));
      const res = await saveRoute(routeId, sagaId, entries, descendantIds);
      setError(res.error ?? null);
    });

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-1.5">
        {draft.map((d, i) => (
          <li key={d.key} className="flex flex-col gap-1.5 rounded-lg border border-border px-2 py-1.5">
            <div className="flex items-center gap-2">
              <span className="w-6 text-right font-mono text-[11px] text-muted-foreground">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px]">{d.label}</span>
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label={t("routeStepUp")}
                className="px-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === draft.length - 1}
                aria-label={t("routeStepDown")}
                className="px-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => setDraft((v) => v.filter((x) => x.key !== d.key))}
                aria-label={t("routeStepRemove")}
                className="px-1.5 text-xs text-status-dropped"
              >
                ✕
              </button>
            </div>
            <Input
              value={d.entry.note ?? ""}
              onChange={(e) => setNote(d.key, e.target.value)}
              maxLength={NOTE_MAX_LENGTH}
              placeholder={t("routeStepNotePlaceholder")}
              aria-label={t("routeStepNoteLabel")}
              className="ml-8 px-2 py-1 text-[11px]"
            />
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-1.5">
        {palette
          .filter((p) => !inDraft.has(p.key))
          .map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setDraft((d) => [...d, p])}
              className="rounded-full border border-border px-2.5 py-1 text-[11px]"
            >
              + {p.label}
            </button>
          ))}
      </div>

      {error && <p className="text-xs text-status-dropped">{t(`routeErrors.${error}`)}</p>}

      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="self-end rounded-lg bg-foreground px-3 py-1.5 text-[11px] font-semibold text-background disabled:opacity-50"
      >
        {pending ? t("routeStepsSaving") : t("routeStepsSave")}
      </button>
    </div>
  );
}
