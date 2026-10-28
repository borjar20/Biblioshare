"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toScreen } from "@/lib/atlas/camera";
import type { SagaItemRole } from "@/lib/sagas/roles";
import { COVER_H, COVER_W, layoutAtlas, type Lens, type Orientation } from "@/lib/sagas/atlas/layout";
import type { AtlasModel, AtlasWork } from "@/lib/sagas/atlas/model";
import { parseLens, parseRole } from "@/lib/sagas/atlas/lens";
import { summarize } from "@/lib/sagas/atlas/summary";
import { inVisibleArea } from "@/lib/sagas/atlas/visible-camera";
import { AtlasList } from "./atlas-list";
import { AtlasPlane } from "./atlas-plane";
import { AtlasDock, AtlasTopBar, AtlasZoom, LENS_LABEL, LENSES, ProgressToggle } from "./atlas-chrome";
import { ItinerarySheet, type AtlasRoute } from "./itinerary-sheet";
import { useAtlasCamera, useChromeInsets, useViewport } from "./use-atlas-camera";
import { WorkSheet } from "./work-sheet";
import styles from "./atlas.module.css";

export type SagaAtlasProps = {
  sagaId: string; sagaName: string; workCount: number;
  model: AtlasModel; authenticated: boolean;
  routes: AtlasRoute[];
  activeRoute: string; adoptedRoute: string | null;
  counter: { completed: number; total: number } | null; // ruta activa curada
  canEdit: boolean;
};

const bold = (chunks: ReactNode) => <b>{chunks}</b>;

/** Isla cliente del atlas de la saga (spec 2026-10-28 §6). Deriva todo de props; su estado
 *  es la lente, el rol resaltado, la capa Progreso, la cámara, la obra con la mini-ficha
 *  abierta y si se ve como lista. La lente y el rol salen de la
 *  URL del cliente; la ruta activa, de la prop (cambiarla vuelve a pedir datos al servidor). */
export function SagaAtlas({
  sagaId, sagaName, workCount, model, authenticated, routes, activeRoute, adoptedRoute, counter, canEdit,
}: SagaAtlasProps) {
  const t = useTranslations("saga");
  const pathname = usePathname();
  const stageRef = useRef<HTMLDivElement>(null);
  const viewport = useViewport(stageRef);
  const topRef = useRef<HTMLElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const insets = useChromeInsets(stageRef, topRef, dockRef);
  // Lente y rol salen de la URL del CLIENTE: al volver atrás, Next restaura el payload RSC
  // cacheado con los `initial*` viejos, pero la URL (sincronizada con replaceState) manda.
  const searchParams = useSearchParams();
  const [lens, setLens] = useState<Lens>(() => parseLens(searchParams.get("lente") ?? undefined));
  const [role, setRole] = useState<SagaItemRole | null>(() => parseRole(searchParams.get("rol") ?? undefined));
  // Capa Progreso: encendida por defecto con sesión; sin sesión no hay estado que enseñar.
  const [progressOn, setProgressOn] = useState(authenticated);
  const progress = authenticated && progressOn;
  // Sin transición de las obras hasta medir el viewport y pintar el primer layout con la
  // orientación real: si no, en móvil «vuelan» de horizontal a vertical al cargar.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (ready || viewport.width === 0) return;
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, [ready, viewport.width]);
  const orientation: Orientation = viewport.width >= viewport.height ? "h" : "v";
  const layout = useMemo(() => layoutAtlas(model, lens, orientation), [model, lens, orientation]);

  // Foco inicial: la obra «ahora»; sin ella (sin sesión, o terminada), la primera.
  const focus = useMemo(() => {
    const key = model.nowKey ?? [...model.works].sort((a, b) => a.readingIndex - b.readingIndex)[0]?.key;
    const p = layout.items.find((i) => i.key === key);
    return p ? { x: p.x, y: p.y } : null;
  }, [model, layout]);
  const { camera, animated, zoomBy, fitAll, focusOn, bind } = useAtlasCamera({
    ref: stageRef, viewport, insets, extent: layout.extent, focus, sagaId, lens, orientation,
  });

  // Mini-ficha (§7): clic, Enter o Espacio en una obra la abre; no mueve la cámara.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [listOn, setListOn] = useState(false);
  const selected = listOn ? null : model.works.find((w) => w.key === selectedKey) ?? null;
  const closeSheet = useCallback((refocus: boolean) => {
    if (refocus && selectedKey) {
      stageRef.current?.querySelector<HTMLElement>(`[data-work-key="${selectedKey}"]`)?.focus({ preventScroll: true });
    }
    setSelectedKey(null);
  }, [selectedKey]);
  const anchor = useMemo(() => {
    const p = selected && layout.items.find((i) => i.key === selected.key);
    if (!p) return null;
    const s = toScreen(camera, viewport, p);
    return { x: s.x, y: s.y, halfW: (COVER_W / 2) * camera.k * p.scale, halfH: (COVER_H / 2) * camera.k * p.scale };
  }, [selected, layout, camera, viewport]);

  // La cámara sigue al foco de TECLADO (§7): un foco que llega por puntero no la mueve.
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
  function followFocus(w: AtlasWork) {
    if (!keyboard.current) return;
    const p = layout.items.find((i) => i.key === w.key);
    if (p && !inVisibleArea(camera, viewport, insets, p)) focusOn(p); // sin `k`: conserva el zoom
  }

  // Cambiar de lente (o girar el móvil) recoloca todo: se encaja de nuevo. La primera
  // medida no cuenta: ahí manda la cámara inicial (guardada o «ahora»).
  const fitted = useRef<string | null>(null);
  useEffect(() => {
    if (viewport.width === 0) return;
    const key = `${lens}:${orientation}`;
    if (fitted.current !== null && fitted.current !== key) fitAll();
    fitted.current = key;
  }, [lens, orientation, viewport.width, fitAll]);

  const summary = summarize(model, lens);
  let summaryRich: ReactNode;
  let summaryPlain: string;
  if (summary.key === "rol") {
    summaryPlain = summary.counts
      .map(({ role, count }) => t("atlas.rolCount", { count, role: t(`atlas.rolePlural.${role}`, { count }) }))
      .join(", ");
    summaryRich = summaryPlain;
  } else {
    summaryRich = t.rich(`atlas.${summary.key}`, { ...summary.values, b: bold });
    summaryPlain = t.markup(`atlas.${summary.key}`, { ...summary.values, b: (chunks) => chunks });
  }

  /** Escribe la vista en la URL viva (no en props): conserva `ruta` y lo que haya. */
  function writeQuery(edit: (q: URLSearchParams) => void) {
    const q = new URLSearchParams(window.location.search);
    edit(q);
    const qs = q.toString();
    // `lente` y `rol` son estado de vista: sin viaje al servidor. Next 16 sincroniza
    // `useSearchParams` con `history.replaceState` (docs: linking-and-navigating). Los
    // cambios de `ruta` van por `router.replace` (itinerary-sheet.tsx): cambian los datos.
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  }

  function changeLens(next: Lens) {
    if (next === lens) return;
    setLens(next);
    if (next !== "rol") setRole(null);
    writeQuery((q) => {
      if (next === "orden") q.delete("lente");
      else q.set("lente", next);
      if (next !== "rol") q.delete("rol");
    });
  }

  /** Tocar la etiqueta de un carril fija el resaltado; tocarla de nuevo lo quita. */
  function toggleRole(r: SagaItemRole) {
    const next = role === r ? null : r;
    setRole(next);
    writeQuery((q) => {
      if (next) q.set("rol", next);
      else q.delete("rol");
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const lensIndex = ["1", "2", "3"].indexOf(e.key);
    if (lensIndex >= 0) changeLens(LENSES[lensIndex]);
    else if (e.key === "+" || e.key === "=") zoomBy(1.25);
    else if (e.key === "-") zoomBy(0.8);
    else if (e.key === "0") fitAll();
    else return;
    e.preventDefault();
  }

  // Derecha de la barra superior: chip de itinerario y, con sesión, el interruptor de Progreso.
  const actions = (
    <>
      <ItinerarySheet sagaId={sagaId} routes={routes} activeRoute={activeRoute} adoptedRoute={adoptedRoute}
        counter={counter} authenticated={authenticated} canEdit={canEdit} />
      {authenticated && <ProgressToggle on={progressOn} onToggle={() => setProgressOn((on) => !on)} />}
    </>
  );

  return (
    <div className={`${styles.root} h-dvh w-full overflow-hidden`} data-progress={progress ? "on" : "off"} data-ready={ready ? "true" : undefined}>
      <div
        ref={stageRef}
        className={styles.stage}
        data-atlas-stage
        role="group"
        tabIndex={listOn ? -1 : 0}
        aria-label={t("atlas.planeAria", { saga: sagaName, lens: t(LENS_LABEL[lens]), summary: summaryPlain })}
        // Con la lista, el plano sigue montado (la cámara mide su tamaño) pero sin foco ni árbol accesible.
        aria-hidden={listOn || undefined}
        inert={listOn}
        data-hidden={listOn || undefined}
        onKeyDown={onKeyDown}
        // El navegador desplaza un `overflow: hidden` para enseñar lo enfocado; la cámara ya lo hace.
        onScroll={(e) => {
          e.currentTarget.scrollTop = 0;
          e.currentTarget.scrollLeft = 0;
        }}
        {...bind}
      >
        <AtlasPlane
          lens={lens} orientation={orientation} role={role} layout={layout} model={model} camera={camera}
          viewport={viewport} animated={animated} sagaName={sagaName} progress={progress}
          onIsland={(p) => focusOn(p, 1)}
          onRole={toggleRole}
          selectedKey={selected?.key ?? null}
          onSelect={(w) => setSelectedKey(w.key)}
          onFocusWork={followFocus}
        />
      </div>
      {listOn && (
        <AtlasList sagaId={sagaId} sagaName={sagaName} model={model} lens={lens} authenticated={authenticated}
          progress={progress} insets={insets} />
      )}
      {selected && (
        <WorkSheet sagaId={sagaId} work={selected} works={model.works}
          accent={model.regions.find((r) => r.key === selected.regionKey)?.accent ?? "beige"}
          authenticated={authenticated} progress={progress} anchor={anchor} viewport={viewport} insets={insets}
          onClose={closeSheet} />
      )}
      <AtlasTopBar sagaId={sagaId} sagaName={sagaName} workCount={workCount} summary={summaryRich} actions={actions} ref={topRef} />
      {!listOn && <AtlasZoom onZoomIn={() => zoomBy(1.25)} onZoomOut={() => zoomBy(0.8)} onFit={fitAll} />}
      <AtlasDock lens={lens} onLens={changeLens} listOn={listOn} onList={() => {
        setListOn((on) => !on);
        setSelectedKey(null);
      }} ref={dockRef} />
    </div>
  );
}
