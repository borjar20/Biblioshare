"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { sagaHref } from "@/lib/catalog/item-href";
import type { RouteFormState } from "@/lib/sagas/route-actions";
import { GeneratedMapRow, RouteRow, type RouteRowData } from "./route-row";
import { RouteForm } from "./route-form";

/** Forma común de las dos cáscaras: mismas filas, mismos gestos, distinta
 *  disposición. El estado vive entero en `RoutesManager`; aquí solo se pinta. */
export type ShellProps = {
  sagaId: string;
  sagaName: string;
  hasMap: boolean;
  rows: RouteRowData[];
  /** Ids de las filas movibles, en orden, para calcular extremos. */
  movableIds: string[];
  busyId: string | null;
  error: RouteFormState["error"] | null;
  onMove: (routeId: string, direction: "up" | "down") => void;
  onDesignate: (routeId: string | null) => void;
  onMenu: (routeId: string) => void;
  onCreate: () => void;
};

export function ShellMobile({
  sagaId,
  sagaName,
  hasMap,
  rows,
  movableIds,
  busyId,
  error,
  onMove,
  onDesignate,
  onMenu,
  onCreate,
}: ShellProps) {
  const t = useTranslations("sagaEditor");
  const empty = rows.length === 0;

  return (
    <div className="pb-10">
      <header className="flex items-center gap-2.5 border-b border-border px-3.5 py-2.5">
        <Link
          href={sagaHref(sagaId)}
          aria-label={t("routesBack")}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border bg-surface text-[15px]"
        >
          ‹
        </Link>
        <div className="min-w-0 flex-1">
          <b className="block truncate font-serif text-[15px] font-semibold">{sagaName}</b>
          <span className="mt-0.5 block font-mono text-[9px] uppercase tracking-[0.09em] text-muted-foreground">
            {t("routesCrumb")}
          </span>
        </div>
        <Link
          href={sagaHref(sagaId)}
          className="shrink-0 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11.5px] font-semibold"
        >
          {t("routesBack")}
        </Link>
      </header>

      <div className="px-3.5 pt-4">
        <div className="mb-2.5 flex items-center gap-2.5">
          <h1 className="font-serif text-[17px] font-semibold">{t("routesTitle")}</h1>
          {!empty && (
            <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
              {t("routesCount", { count: rows.length })}
            </span>
          )}
        </div>

        {empty ? (
          <>
            <div className="rounded-xl border border-dashed border-foreground/25 bg-surface/45 px-4 py-4.5 text-center">
              <b className="mb-1.5 block font-serif text-[15px] font-semibold">{t("routesEmptyTitle")}</b>
              <p className="mx-auto max-w-[290px] text-[12px] leading-snug text-muted-foreground">
                {t("routesEmptyBody")}
              </p>
            </div>
            {/* Con la lista vacía el formulario SÍ se pinta abierto: crear es
                lo único que se puede hacer aquí. */}
            <section className="mt-3.5 rounded-xl border border-border bg-surface p-3.5">
              <h2 className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.13em] text-muted-foreground">
                {t("routeNewTitle")}
              </h2>
              <RouteForm sagaId={sagaId} route={null} idPrefix="empty" onDone={() => {}} />
            </section>
          </>
        ) : (
          <>
            <p className="mb-3 text-[12px] leading-snug text-muted-foreground">{t("routesSubtitle")}</p>
            {error && (
              <p role="alert" className="mb-2.5 text-[11.5px] text-status-dropped">
                {t(`routeErrors.${error}`)}
              </p>
            )}
            <ul className="grid gap-2">
              <GeneratedMapRow
                hasMap={hasMap}
                isActive={!rows.some((r) => r.isReadingOrder)}
                busy={busyId !== null}
                onDesignate={() => onDesignate(null)}
              />
              {rows.map((row) => (
                <RouteRow
                  key={row.id}
                  row={row}
                  sagaId={sagaId}
                  isFirst={movableIds[0] === row.id}
                  isLast={movableIds[movableIds.length - 1] === row.id}
                  busy={busyId === row.id || busyId === "*"}
                  onMove={(direction) => onMove(row.id, direction)}
                  onDesignate={() => onDesignate(row.id)}
                  onMenu={() => onMenu(row.id)}
                />
              ))}
            </ul>
            <button
              type="button"
              onClick={onCreate}
              className="mt-2.5 w-full rounded-lg border border-dashed border-border py-2 text-center text-[11.5px] font-semibold text-muted-foreground"
            >
              + {t("routeNew")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
