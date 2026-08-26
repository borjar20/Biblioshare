"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { sagaHref } from "@/lib/catalog/item-href";
import { GeneratedMapRow, RouteRow } from "./route-row";
import { RouteForm } from "./route-form";
import type { ShellProps } from "./shell-mobile";

/** Dos columnas: lista a la izquierda, raíl con el formulario de crear a la
 *  derecha. En escritorio crear no necesita hoja — hay sitio de sobra y el
 *  formulario abierto es la invitación. `onCreate` no se usa aquí: es el gesto
 *  de móvil. */
export function ShellDesktop({
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
}: ShellProps) {
  const t = useTranslations("sagaEditor");

  return (
    <div className="pb-12">
      <header className="flex items-center gap-4 border-b border-border bg-surface px-6 py-4">
        <Link
          href={sagaHref(sagaId)}
          aria-label={t("routesBack")}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-[15px]"
        >
          ‹
        </Link>
        <div className="min-w-0 flex-1">
          <p className="mb-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">
            {sagaName} · {t("routesCrumb")}
          </p>
          <h1 className="font-serif text-[23px] font-semibold leading-tight">{t("routesTitle")}</h1>
        </div>
        <Link
          href={sagaHref(sagaId)}
          className="shrink-0 rounded-lg border border-border px-3 py-2 text-[12.5px] font-semibold"
        >
          {t("routesBack")}
        </Link>
      </header>

      <div className="grid grid-cols-[1fr_350px] gap-6 px-6 py-5">
        <div>
          <p className="mb-3 text-[12px] leading-snug text-muted-foreground">{t("routesSubtitle")}</p>
          {error && (
            <p role="alert" className="mb-2.5 text-[11.5px] text-status-dropped">
              {t(`routeErrors.${error}`)}
            </p>
          )}
          {rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-foreground/25 bg-surface/45 px-4 py-6 text-center">
              <b className="mb-1.5 block font-serif text-[15px] font-semibold">{t("routesEmptyTitle")}</b>
              <p className="mx-auto max-w-[320px] text-[12px] leading-snug text-muted-foreground">
                {t("routesEmptyBody")}
              </p>
            </div>
          ) : (
            <ul className="grid content-start gap-2">
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
          )}
        </div>

        <aside className="grid content-start gap-3.5">
          <section className="rounded-xl border border-border bg-surface p-3.5">
            <h2 className="mb-2.5 font-mono text-[10px] uppercase tracking-[0.13em] text-muted-foreground">
              {t("routeNewTitle")}
            </h2>
            <RouteForm sagaId={sagaId} route={null} idPrefix="rail" onDone={() => {}} />
          </section>
        </aside>
      </div>
    </div>
  );
}
