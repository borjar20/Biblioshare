"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { followSaga, unfollowSaga } from "@/lib/sagas/follow-actions";
import type { SagaIndexCard } from "@/lib/sagas/build-saga-index";
import { deriveIndexAtlas, orderedSagas, type IndexAtlasSaga } from "@/lib/sagas/index-atlas/model";
import { SAGA_H, SAGA_W, layoutIndexAtlas, zoneCentre } from "@/lib/sagas/index-atlas/layout";
import { summarizeIndex } from "@/lib/sagas/index-atlas/summary";
import { NO_FILTERS, indexQueryString, matchesFilters, matchesQuery, parseIndexParams, type IndexFilters as Filters } from "@/lib/sagas/index-atlas/params";
import type { Orientation } from "@/lib/atlas/types";
import { EmptyState } from "@/components/ui/empty-state";
import { LibraryIcon } from "@/components/ui/icons";
import { toScreen } from "@/lib/atlas/camera";
import { inVisibleArea } from "@/lib/atlas/visible-camera";
import { useAtlasCamera, useChromeInsets, useViewport } from "@/components/atlas/use-atlas-camera";
import { IndexPlane } from "./index-plane";
import { IndexListToggle, IndexTopBar, IndexZoom } from "./index-chrome";
import { IndexList } from "./index-list";
import { IndexSheet } from "./index-sheet";
import { IndexSearch, type IndexPick } from "./index-search";
import { IndexFilters } from "./index-filters";
import styles from "./sagas-atlas.module.css";

export type SagasAtlasProps = { cards: SagaIndexCard[]; authenticated: boolean; canCurate: boolean };
const bold = (chunks: ReactNode) => <b>{chunks}</b>;

/** Isla cliente del atlas de sagas y universos (spec 2026-10-28 índice §5). Deriva modelo y
 *  layout de las tarjetas; su estado es la cámara, la saga abierta en la mini-ficha y los
 *  seguimientos optimistas, el buscador y los filtros (que atenúan, no ocultan). `canCurate`
 *  muestra «Nueva saga». «Ver como lista» sustituye el plano por una lista (§5.4). */
export function SagasAtlas(props: SagasAtlasProps) {
  const { cards, authenticated, canCurate } = props;
  const t = useTranslations("sagaIndex");
  const searchParams = useSearchParams();
  const params = useMemo(() => parseIndexParams((n) => searchParams.get(n)), [searchParams]);
  // Seguir es optimista (§5.2): el mapa se deriva de las tarjetas con los cambios pendientes
  // aplicados, así la saga cambia de zona al instante. Tras un éxito ya es el estado bueno.
  const [follows, setFollows] = useState<Map<string, boolean>>(new Map());
  const effective = useMemo(
    () => (follows.size === 0 ? cards : cards.map((c) => (follows.has(c.id) ? { ...c, isFollowed: follows.get(c.id)! } : c))),
    [cards, follows],
  );
  const model = useMemo(() => deriveIndexAtlas(effective, authenticated), [effective, authenticated]);

  const stageRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const viewport = useViewport(stageRef);
  const insets = useChromeInsets(stageRef, topRef, dockRef);
  const orientation: Orientation = viewport.width >= viewport.height ? "h" : "v";
  const layout = useMemo(() => layoutIndexAtlas(model, orientation), [model, orientation]);
  // Sin transición hasta medir el viewport y pintar el primer layout con la orientación real.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (ready || viewport.width === 0) return;
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, [ready, viewport.width]);

  // Foco inicial: el de los enlaces viejos (`vista`), si no «En curso». Sin él, encaja todo.
  const focus = useMemo(() => {
    if (params.focus === "sigues") return zoneCentre(layout, "sigues");
    if (params.focus === "universos") {
      const i = layout.islands[0];
      return i ? { x: i.x + i.w / 2, y: i.y + i.h / 2 } : null;
    }
    return zoneCentre(layout, "en-curso");
  }, [params.focus, layout]);
  const { camera, animated, zoomBy, fitAll, focusOn, bind } = useAtlasCamera({
    ref: stageRef, viewport, insets, extent: layout.extent, focus, storageKey: "sagas-atlas", lens: "indice", orientation,
  });

  // Girar el móvil recoloca las zonas (en fila ↔ en columna): se encaja de nuevo. La primera
  // medida no cuenta: ahí manda la cámara inicial (guardada o «En curso»).
  const fitted = useRef<Orientation | null>(null);
  useEffect(() => {
    if (viewport.width === 0) return;
    if (fitted.current !== null && fitted.current !== orientation) fitAll();
    fitted.current = orientation;
  }, [orientation, viewport.width, fitAll]);

  // Mini-ficha (§5.2): tocar una saga la abre; con subsagas, además acerca la cámara a su isla.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Lista accesible (§5.4): abrirla cierra la ficha y deja el plano `inert`.
  const [asList, setAsList] = useState(false);
  function toggleList() {
    setSelectedId(null);
    setAsList((v) => !v);
  }
  const selected = useMemo(
    () => (selectedId ? model.zones.flatMap((z) => z.sagas).find((s) => s.id === selectedId) ?? null : null),
    [model, selectedId],
  );
  const closeSheet = useCallback((refocus: boolean) => {
    if (refocus && selectedId) {
      stageRef.current?.querySelector<HTMLElement>(`[data-saga-id="${selectedId}"]`)?.focus({ preventScroll: true });
    }
    setSelectedId(null);
  }, [selectedId]);
  const boxOf = (id: string) => layout.sagas.find((b) => b.id === id);
  // La ficha se ancla a la caja de la saga con el layout vigente: si cambia de zona, la sigue.
  const anchor = useMemo(() => {
    const b = selected && layout.sagas.find((x) => x.id === selected.id);
    if (!b) return null;
    const s = toScreen(camera, viewport, b);
    return { x: s.x, y: s.y, halfW: (SAGA_W / 2) * camera.k * b.scale, halfH: (SAGA_H / 2) * camera.k * b.scale };
  }, [selected, layout, camera, viewport]);
  function selectSaga(s: IndexAtlasSaga) {
    if (s.id === selectedId) return closeSheet(false);
    setSelectedId(s.id);
    const island = layout.islands.find((i) => i.id === s.id);
    if (island) focusOn({ x: island.x + island.w / 2, y: island.y + island.h / 2 }, Math.max(camera.k, 1.2));
  }
  function showChild(childId: string) {
    const b = boxOf(childId);
    if (b) focusOn(b, 3);
  }

  // La cámara sigue al foco de TECLADO: un foco que llega por puntero no la mueve.
  const keyboard = useRef(false);
  useEffect(() => {
    const onKey = () => (keyboard.current = true);
    const onPointer = () => (keyboard.current = false);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, []);
  function followFocus(s: IndexAtlasSaga) {
    if (!keyboard.current) return;
    const b = boxOf(s.id);
    if (b && !inVisibleArea(camera, viewport, insets, b, { x: (SAGA_W / 2) * b.scale, y: (SAGA_H / 2) * b.scale })) focusOn(b); // sin `k`: conserva el zoom
  }

  // Seguir / dejar de seguir: optimista; si la acción falla, se revierte y se avisa en la ficha.
  const [pending, startTransition] = useTransition();
  const [errorId, setErrorId] = useState<string | null>(null);
  function follow(id: string, on: boolean) {
    setErrorId(null);
    setFollows((m) => new Map(m).set(id, on));
    startTransition(async () => {
      try {
        await (on ? followSaga : unfollowSaga)(id);
      } catch {
        setFollows((m) => new Map(m).set(id, !on));
        setErrorId(id);
      }
    });
  }

  // Buscador y filtros (§3): estado local sembrado desde la URL, que se reescribe sin router.
  const [query, setQuery] = useState(params.q);
  const [filters, setFilters] = useState<Filters>(params.filters);
  function writeUrl(q: string, f: Filters) {
    const qs = indexQueryString({ q, filters: f });
    window.history.replaceState(null, "", qs ? `/sagas?${qs}` : "/sagas");
  }
  function changeQuery(q: string) {
    setQuery(q);
    writeUrl(q, filters);
  }
  function changeFilters(f: Filters) {
    setFilters(f);
    writeUrl(query, f);
  }
  const sagas = useMemo(() => orderedSagas(model), [model]);
  const dimmed = useCallback((s: IndexAtlasSaga) => !matchesFilters(s, filters) || !matchesQuery(s, query), [filters, query]);
  const matching = sagas.filter((s) => !dimmed(s)).length;
  // Elegir una coincidencia: acerca la cámara a su caja (raíz a 1,4; subsaga a 3) y abre la ficha de la raíz.
  function pick({ sagaId, childId }: IndexPick) {
    setAsList(false); // un resultado siempre aterriza en el mapa, con la ficha encima
    const b = boxOf(childId ?? sagaId);
    if (b) focusOn(b, childId ? 3 : 1.4);
    setSelectedId(sagaId);
  }
  const summary = summarizeIndex(model, matching);
  const noMatches = summary.key === "sinCoincidencias";
  const empty = cards.length === 0;
  const clearAll = () => {
    setQuery("");
    setFilters(NO_FILTERS);
    writeUrl("", NO_FILTERS);
  };
  return (
    <div className={styles.root} data-sagas-atlas data-ready={ready || undefined}>
      {/* La barra va antes que el plano en el DOM: Tab pasa de ella a las sagas. Su z-index la mantiene encima. */}
      <IndexTopBar ref={topRef} count={model.sagaCount}
        summary={t.rich(`atlas.summary.${summary.key}`, { ...summary.values, b: bold })}
        actions={!empty && (
          <>
            {noMatches && <button type="button" className={styles.newLink} onClick={clearAll}>{t("atlas.filters.clear")}</button>}
            <IndexSearch sagas={sagas} query={query} onQuery={changeQuery} onPick={pick} />
            {canCurate && <Link href="/sagas/nueva" className={styles.newLink}>{t("new")}</Link>}
            <IndexListToggle pressed={asList} onToggle={toggleList} />
          </>
        )} />
      <div
        ref={stageRef}
        className={styles.stage}
        data-atlas-stage
        inert={asList}
        role="region"
        aria-label={t("atlas.planeLabel")}
        // El navegador desplaza un `overflow: hidden` para enseñar lo enfocado; la cámara ya lo hace.
        onScroll={(e) => {
          e.currentTarget.scrollTop = 0;
          e.currentTarget.scrollLeft = 0;
        }}
        {...bind}
      >
        {!empty && (
          <IndexPlane model={model} layout={layout} camera={camera} viewport={viewport} animated={animated && ready}
            dimmed={dimmed} selectedId={selected?.id ?? null} onSelect={selectSaga} onFocusSaga={followFocus} />
        )}
      </div>
      {empty && (
        // `dark`: EmptyState usa los tokens de la app y este atlas es siempre oscuro.
        <div className={`dark ${styles.empty}`}>
          <EmptyState glyph={<LibraryIcon className="h-7 w-7" />} title={t("emptyTitle")}
            action={canCurate ? <Link href="/sagas/nueva" className={styles.newLink}>{t("new")}</Link> : undefined} />
        </div>
      )}
      {asList && <IndexList model={model} dimmed={dimmed} insets={insets} />}
      {selected && (
        <IndexSheet saga={selected} authenticated={authenticated} anchor={anchor} viewport={viewport} insets={insets}
          pending={pending} error={errorId === selected.id}
          onFollow={(on) => follow(selected.id, on)} onChild={showChild} onClose={closeSheet} />
      )}
      <div ref={dockRef} className={styles.dock} data-atlas-chrome="dock">
        {!empty && <IndexFilters filters={filters} onChange={changeFilters} />}
      </div>
      {!asList && <IndexZoom onZoomIn={() => zoomBy(1.4)} onZoomOut={() => zoomBy(1 / 1.4)} onFit={fitAll} />}
    </div>
  );
}
