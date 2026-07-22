"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { saveRoute } from "@/lib/sagas/route-actions";
import type { RawRouteEntry } from "@/lib/sagas/route-types";

export type RouteEditorItem = { key: string; label: string; entry: Omit<RawRouteEntry, "position"> };

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

  const keyOf = (e: Omit<RawRouteEntry, "position">) =>
    e.childSagaId ? `s:${e.childSagaId}` : `i:${e.itemType}:${e.itemId}`;

  // La key de cada fila sale del CONTENIDO del paso (keyOf), nunca del índice:
  // con key={i}, reordenar movería el estado de React (aquí no lo hay, pero
  // RouteBlock sí pliega/despliega con useState) al bloque equivocado —
  // exactamente el hallazgo de la Task 6.
  const [draft, setDraft] = useState<RouteEditorItem[]>(() =>
    initialEntries
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((e) => {
        const k = keyOf(e);
        return palette.find((p) => p.key === k) ?? { key: k, label: k, entry: e };
      }),
  );

  const inDraft = new Set(draft.map((d) => d.key));

  const move = (i: number, delta: number) =>
    setDraft((d) => {
      const j = i + delta;
      if (j < 0 || j >= d.length) return d;
      const next = [...d];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

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
      <ol className="flex flex-col gap-1">
        {draft.map((d, i) => (
          <li key={d.key} className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5">
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
