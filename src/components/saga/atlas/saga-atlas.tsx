"use client";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { SagaItemRole } from "@/lib/sagas/roles";
import { layoutAtlas, type Lens, type Orientation } from "@/lib/sagas/atlas/layout";
import type { AtlasModel } from "@/lib/sagas/atlas/model";
import { parseLens } from "@/lib/sagas/atlas/lens";
import { summarize } from "@/lib/sagas/atlas/summary";
import { AtlasPlane } from "./atlas-plane";
import { AtlasDock, AtlasTopBar, AtlasZoom, LENS_LABEL, LENSES } from "./atlas-chrome";
import { useAtlasCamera, useViewport } from "./use-atlas-camera";
import styles from "./atlas.module.css";

export type SagaAtlasProps = {
  sagaId: string; sagaName: string; workCount: number;
  model: AtlasModel; authenticated: boolean;
  initialLens: Lens; initialRole: SagaItemRole | null;
  routes: Array<{ slug: string; name: string; summary: string | null; curated: boolean }>;
  activeRoute: string; adoptedRoute: string | null;
  counter: { completed: number; total: number } | null; // ruta activa curada
  canEdit: boolean;
};

const bold = (chunks: ReactNode) => <b>{chunks}</b>;

/** Isla cliente del atlas de la saga (spec 2026-10-28 §6). Deriva todo de props; su estado
 *  es la lente y la cámara. `initialRole`, rutas, contador y `canEdit` son de las capas y
 *  hojas de las Tasks 7–9. */
export function SagaAtlas({ sagaId, sagaName, workCount, model, authenticated, initialLens }: SagaAtlasProps) {
  const t = useTranslations("saga");
  const pathname = usePathname();
  const stageRef = useRef<HTMLDivElement>(null);
  const viewport = useViewport(stageRef);
  // La lente se siembra de la URL del CLIENTE: al volver atrás, Next restaura el payload RSC
  // cacheado con el `initialLens` viejo, pero la URL (sincronizada con replaceState) manda.
  const searchParams = useSearchParams();
  const [lens, setLens] = useState<Lens>(() => {
    const raw = searchParams.get("lente");
    return raw !== null ? parseLens(raw) : initialLens;
  });
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
    ref: stageRef, viewport, extent: layout.extent, focus, sagaId,
  });

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

  function changeLens(next: Lens) {
    if (next === lens) return;
    setLens(next);
    // Desde la URL viva y no desde props: conserva `ruta` y lo que haya.
    const q = new URLSearchParams(window.location.search);
    if (next === "orden") q.delete("lente");
    else q.set("lente", next);
    if (next !== "rol") q.delete("rol");
    const qs = q.toString();
    // `lente` y `rol` son estado de vista: sin viaje al servidor. Next 16 sincroniza
    // `useSearchParams` con `history.replaceState` (docs: linking-and-navigating). Los
    // cambios de `ruta` (Task 8) sí irán por `router.replace`: cambian los datos.
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
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

  return (
    <div className={`${styles.root} h-dvh w-full overflow-hidden`} data-progress={authenticated ? "on" : "off"} data-ready={ready ? "true" : undefined}>
      <div
        ref={stageRef}
        className={styles.stage}
        role="group"
        tabIndex={0}
        aria-label={t("atlas.planeAria", { saga: sagaName, lens: t(LENS_LABEL[lens]), summary: summaryPlain })}
        onKeyDown={onKeyDown}
        {...bind}
      >
        <AtlasPlane
          lens={lens} layout={layout} model={model} camera={camera} viewport={viewport} animated={animated}
          sagaName={sagaName} authenticated={authenticated}
          onIsland={(p) => focusOn(p, 1)}
          // Interino hasta la mini-ficha (Task 9): tocar una obra la acerca al detalle.
          onSelect={(w) => {
            const p = layout.items.find((i) => i.key === w.key);
            if (p) focusOn(p, Math.max(camera.k, 1.8));
          }}
        />
      </div>
      <AtlasTopBar sagaId={sagaId} sagaName={sagaName} workCount={workCount} summary={summaryRich} />
      <AtlasZoom onZoomIn={() => zoomBy(1.25)} onZoomOut={() => zoomBy(0.8)} onFit={fitAll} />
      <AtlasDock lens={lens} onLens={changeLens} />
    </div>
  );
}
