"use client";
import Link from "next/link";
import { useCallback, useEffect, useId, useOptimistic, useRef, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { sagaHref } from "@/lib/catalog/item-href";
import { AdoptRouteButton } from "./adopt-route-button";
import styles from "./atlas.module.css";

export type AtlasRoute = { slug: string; name: string; summary: string | null; curated: boolean };

/** Chip de itinerario de la barra superior y su hoja (spec 2026-10-28 §6, maqueta A).
 *  Una sola pieza de DOM: la CSS la pinta como desplegable bajo el chip a ≥ 640 px y como
 *  hoja inferior con fondo por debajo. Se cierra con Escape y al tocar fuera; el foco
 *  vuelve al chip. Elegir una ruta va por `router.replace`: cambia los datos (los pasos de
 *  la ruta salen del servidor), a diferencia de `lente` y `rol`. */
export function ItinerarySheet({ sagaId, routes, activeRoute, adoptedRoute, counter, authenticated, canEdit }: {
  sagaId: string;
  routes: AtlasRoute[];
  activeRoute: string;
  adoptedRoute: string | null;
  counter: { completed: number; total: number } | null;
  authenticated: boolean;
  canEdit: boolean;
}) {
  const t = useTranslations("saga");
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  // La radio marcada cambia ya; la prop llega cuando el servidor vuelve a renderizar.
  const [selected, setSelected] = useOptimistic(activeRoute);
  const wrapRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const dialogId = useId();

  const active = routes.find((r) => r.slug === selected) ?? routes[0];
  const name = active?.name ?? "";
  const expandable = routes.some((r) => r.curated);

  const close = useCallback(() => {
    setOpen(false);
    chipRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.querySelector<HTMLInputElement>("input:checked")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, close]);

  function choose(slug: string) {
    const q = new URLSearchParams(window.location.search); // conserva `lente` y `rol`
    q.set("ruta", slug);
    startTransition(() => {
      setSelected(slug);
      router.replace(`${pathname}?${q}`, { scroll: false });
    });
  }

  if (!expandable) {
    // Sin itinerarios curados no hay nada que elegir: el chip es solo una etiqueta.
    return (
      <span className={styles.chip} data-static>
        <span aria-hidden="true">⟿</span> <span>{name}</span>
      </span>
    );
  }

  return (
    <div ref={wrapRef} className={styles.itinWrap}>
      <button
        ref={chipRef}
        type="button"
        className={styles.chip}
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        aria-label={t("atlas.itinerary", { name })}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span aria-hidden="true">⟿</span> <span className={styles.chipName}>{name}</span> <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <>
          <div className={styles.sheetBackdrop} aria-hidden="true" onClick={close} />
          <div ref={dialogRef} id={dialogId} role="dialog" aria-label={t("atlas.itineraryTitle")} className={styles.sheet}>
            <p className={styles.sheetTitle} aria-hidden="true">{t("atlas.itineraryTitle")}</p>
            <ul className={styles.routeList}>
              {routes.map((r) => {
                const isActive = r.slug === selected;
                return (
                  <li key={r.slug} className={styles.route} data-active={isActive || undefined}>
                    <label className={styles.routeLabel}>
                      <input type="radio" name={`${dialogId}-ruta`} value={r.slug} checked={isActive} onChange={() => choose(r.slug)} />
                      <span>{r.name}</span>
                    </label>
                    {isActive && (
                      <RouteDetail summary={r.summary}
                        // El contador es de la ruta que pintó el servidor, no de la recién elegida.
                        counter={r.slug === activeRoute ? counter : null}
                        adopt={authenticated && r.curated ? (
                          <AdoptRouteButton sagaId={sagaId} slug={r.slug} adopted={adoptedRoute === r.slug}
                            labels={{ adopt: t("routeAdopt"), adopted: t("routeAdopted") }} className={styles.adopt} />
                        ) : null} />
                    )}
                  </li>
                );
              })}
            </ul>
            {canEdit && (
              <Link href={`${sagaHref(sagaId)}/rutas`} className={styles.manage}>
                <span aria-hidden="true">✎</span> {t("atlas.itineraryManage")}
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function RouteDetail({ summary, counter, adopt }: {
  summary: string | null; counter: { completed: number; total: number } | null; adopt: ReactNode;
}) {
  const t = useTranslations("saga");
  if (!summary && !counter && !adopt) return null;
  return (
    <div className={styles.routeDetail}>
      {summary && <p className={styles.routeSummary}>{summary}</p>}
      {(counter || adopt) && (
        <div className={styles.routeMeta}>
          {adopt}
          {counter && <span>{t("routeProgress", counter)}</span>}
        </div>
      )}
    </div>
  );
}
