"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { CuratedRouteRow } from "@/lib/sagas/get-saga-routes";
import { sagaHref } from "@/lib/catalog/item-href";

export type RouteRowData = CuratedRouteRow & { steps: number; notes: number };

/** Punto del control de designación: encendido cuando esta fila ocupa el
 *  puesto. Es decorativo (`aria-hidden`); quien lee la pantalla con un lector
 *  recibe el estado por `aria-pressed` del botón. */
function Dot({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border-[1.5px] ${
        on ? "border-accent bg-accent" : "border-foreground/30"
      }`}
    >
      {on && <span className="h-1.5 w-1.5 rounded-full bg-accent-foreground" />}
    </span>
  );
}

export function RouteRow({
  row,
  sagaId,
  isFirst,
  isLast,
  busy,
  onMove,
  onDesignate,
  onMenu,
}: {
  row: RouteRowData;
  sagaId: string;
  isFirst: boolean;
  isLast: boolean;
  busy: boolean;
  onMove: (direction: "up" | "down") => void;
  onDesignate: () => void;
  onMenu: () => void;
}) {
  const t = useTranslations("sagaEditor");
  // Un itinerario sin pasos no puede ocupar el puesto: lo rechaza
  // `setReadingOrder` con `emptyRoute`. Se deshabilita aquí para que el
  // curador no descubra la regla con un error rojo.
  const canDesignate = !row.isReadingOrder && row.steps > 0;

  return (
    <li
      className={`grid gap-2.5 rounded-xl border bg-surface px-2.5 py-2.5 ${
        row.isReadingOrder ? "border-l-[3px] border-border border-l-accent" : "border-border"
      }`}
    >
      <div className="flex items-start gap-2.5">
        {/* El designado NO lleva flechas: está fijado arriba por su
            designación, no por su `position`, así que moverlo cambiaría un
            número sin ningún efecto visible. Misma regla que aplicaba
            `route-list.tsx`. */}
        {!row.isReadingOrder && (
          <div className="grid shrink-0 gap-0.5 pt-0.5">
            <button
              type="button"
              disabled={busy || isFirst}
              onClick={() => onMove("up")}
              aria-label={t("routeMoveUp")}
              className="grid h-5 w-6 place-items-center rounded-md border border-border text-[9px] text-muted-foreground disabled:opacity-30"
            >
              ↑
            </button>
            <button
              type="button"
              disabled={busy || isLast}
              onClick={() => onMove("down")}
              aria-label={t("routeMoveDown")}
              className="grid h-5 w-6 place-items-center rounded-md border border-border text-[9px] text-muted-foreground disabled:opacity-30"
            >
              ↓
            </button>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <b className="font-serif text-[15px] font-semibold leading-tight">{row.name}</b>
            {row.isReadingOrder && (
              <span className="rounded-md bg-accent/12 px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.09em] text-accent">
                {t("readingOrderBadge")}
              </span>
            )}
          </div>
          {row.summary && <p className="mt-1 text-[12px] leading-snug text-muted-foreground">{row.summary}</p>}
          <p className="mt-1.5 flex flex-wrap gap-2.5 font-mono text-[9px] uppercase tracking-[0.08em] text-foreground-faint">
            <span>{t("routeStepsCount", { count: row.steps })}</span>
            <span>{t("routeNotesCount", { count: row.notes })}</span>
          </p>
        </div>

        <button
          type="button"
          onClick={onMenu}
          disabled={busy}
          aria-label={t("routeMenuLabel", { name: row.name })}
          className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg text-[16px] text-foreground-faint hover:bg-surface-muted disabled:opacity-40"
        >
          ⋯
        </button>
      </div>

      <div className="flex items-center gap-2 border-t border-border pt-2">
        <button
          type="button"
          onClick={onDesignate}
          disabled={busy || !canDesignate}
          aria-pressed={row.isReadingOrder}
          className={`inline-flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 text-[11.5px] font-semibold disabled:opacity-40 ${
            row.isReadingOrder ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          <Dot on={row.isReadingOrder} />
          {row.isReadingOrder ? t("routeIsReadingOrder") : t("routeUseAsReadingOrder")}
        </button>
        <span className="flex-1" />
        <Link
          href={`${sagaHref(sagaId)}/rutas/${row.slug}/editar`}
          className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold ${
            row.isReadingOrder
              ? "bg-accent text-accent-foreground"
              : "border border-border bg-surface text-foreground"
          }`}
        >
          {t("routeEditSteps")}
        </Link>
      </div>

      {row.steps === 0 && (
        <p className="text-[11px] leading-snug text-muted-foreground">{t("routeNeedsStepsHint")}</p>
      )}
    </li>
  );
}

/** El antiguo radio «Ninguno» con cara de fila: primera, atenuada, no editable.
 *
 *  Se pinta SIEMPRE, también con `show_map = false`. Si se ocultara, una saga
 *  sin mapa que ya tuviera un itinerario designado se quedaría sin ninguna
 *  forma de dejar de designarlo. Lo que cambia con el mapa es el texto: sin él,
 *  el lector cae en el orden de publicación (`buildRouteList` no ofrece la
 *  sintética «lectura» cuando `hasGraph` es falso). */
export function GeneratedMapRow({
  hasMap,
  isActive,
  busy,
  onDesignate,
}: {
  hasMap: boolean;
  isActive: boolean;
  busy: boolean;
  onDesignate: () => void;
}) {
  const t = useTranslations("sagaEditor");

  return (
    <li
      className={`grid gap-2.5 rounded-xl border bg-surface/55 px-2.5 py-2.5 ${
        isActive ? "border-l-[3px] border-border border-l-accent" : "border-border"
      }`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <b className="font-serif text-[15px] font-semibold leading-tight">{t("routeGeneratedName")}</b>
          <span className="rounded-md bg-surface-muted px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-[0.09em] text-muted-foreground">
            {t("routeGeneratedBadge")}
          </span>
        </div>
        <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
          {hasMap ? t("routeGeneratedDesc") : t("routeGeneratedNoMapDesc")}
        </p>
      </div>
      <div className="flex items-center border-t border-border pt-2">
        <button
          type="button"
          onClick={onDesignate}
          disabled={busy || isActive}
          aria-pressed={isActive}
          className={`inline-flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 text-[11.5px] font-semibold disabled:opacity-40 ${
            isActive ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          <Dot on={isActive} />
          {isActive ? t("routeIsReadingOrder") : t("routeUseAsReadingOrder")}
        </button>
      </div>
    </li>
  );
}
