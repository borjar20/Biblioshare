"use client";
import Link from "next/link";
import { useCallback, useEffect, useId, useOptimistic, useRef, useState, useTransition, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { sagaHref } from "@/lib/catalog/item-href";
import { AdoptRouteButton } from "./adopt-route-button";
import { useDismissable } from "./use-dismissable";
import styles from "./atlas.module.css";

export type AtlasRoute = { slug: string; name: string; summary: string | null; curated: boolean };

/** Chip de itinerario de la barra superior y su hoja (spec 2026-10-28 §6, maqueta A).
 *  Una sola pieza de DOM: la CSS la pinta como desplegable bajo el chip a ≥ 640 px y como
 *  hoja inferior con fondo por debajo. Se cierra con Escape, con el chip y al tocar fuera;
 *  el foco vuelve al chip solo con Escape o el chip (tocar fuera lo deja donde se tocó). En
 *  móvil también se cierra si el foco sale de la hoja: así no se escapa tras el fondo.
 *  Elegir una ruta va por `router.replace`: cambia los datos (los pasos de la ruta salen
 *  del servidor), a diferencia de `lente` y `rol`. Las flechas solo mueven la selección;
 *  la confirman el clic, Enter o Espacio (una navegación por elección, no por tecla). */
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
  // Radio marcada con las flechas y aún sin confirmar (solo visual).
  const [browsing, setBrowsing] = useState<string | null>(null);
  // La flecha marca la radio vecina con un click/change que NO es una elección.
  const arrowed = useRef(false);

  const checked = browsing ?? selected;
  const active = routes.find((r) => r.slug === selected) ?? routes[0];
  const name = active?.name ?? "";
  const expandable = routes.some((r) => r.curated);

  /** Cierra; con `refocus` (Escape, chip) el foco vuelve al chip. */
  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    setBrowsing(null);
    if (refocus) chipRef.current?.focus();
  }, []);

  useEffect(() => {
    if (open) dialogRef.current?.querySelector<HTMLInputElement>("input:checked")?.focus();
  }, [open]);
  // Escape, tocar fuera y, en móvil, el foco que sale de la hoja.
  const onBlur = useDismissable({ open, ref: wrapRef, close });

  function choose(slug: string) {
    setBrowsing(null);
    if (slug === selected) return;
    const q = new URLSearchParams(window.location.search); // conserva `lente` y `rol`
    q.set("ruta", slug);
    startTransition(() => {
      setSelected(slug);
      router.replace(`${pathname}?${q}`, { scroll: false });
    });
  }

  function onListKeyDown(e: ReactKeyboardEvent<HTMLUListElement>) {
    const radio = e.target as HTMLInputElement;
    if (radio.type !== "radio") return;
    if (e.key.startsWith("Arrow")) arrowed.current = true;
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault(); // Espacio marcaría la radio y dispararía otro change
      choose(radio.value);
    }
  }

  function onRadioChange(slug: string) {
    if (arrowed.current) {
      arrowed.current = false;
      setBrowsing(slug);
    } else choose(slug);
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
    <div ref={wrapRef} className={styles.itinWrap} onBlur={onBlur}>
      <button
        ref={chipRef}
        type="button"
        className={styles.chip}
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        aria-label={t("atlas.itinerary", { name })}
        onClick={() => (open ? close(true) : setOpen(true))}
      >
        <span aria-hidden="true">⟿</span> <span className={styles.chipName}>{name}</span> <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <>
          <div className={styles.sheetBackdrop} aria-hidden="true" onClick={() => close(false)} />
          <div ref={dialogRef} id={dialogId} role="dialog" aria-label={t("atlas.itineraryTitle")} className={styles.sheet}
            // Enfocable para que un toque en su relleno o en una etiqueta no saque el foco de la hoja.
            tabIndex={-1}>
            <p className={styles.sheetTitle} aria-hidden="true">{t("atlas.itineraryTitle")}</p>
            <ul className={styles.routeList} onKeyDown={onListKeyDown} onPointerDown={() => (arrowed.current = false)}>
              {routes.map((r) => {
                const isActive = r.slug === checked;
                return (
                  <li key={r.slug} className={styles.route} data-active={isActive || undefined}>
                    <label className={styles.routeLabel}>
                      <input type="radio" name={`${dialogId}-ruta`} value={r.slug} checked={isActive} onChange={() => onRadioChange(r.slug)} />
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
