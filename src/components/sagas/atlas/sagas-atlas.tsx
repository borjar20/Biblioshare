"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { SagaIndexCard } from "@/lib/sagas/build-saga-index";
import { deriveIndexAtlas } from "@/lib/sagas/index-atlas/model";
import { layoutIndexAtlas, zoneCentre } from "@/lib/sagas/index-atlas/layout";
import { summarizeIndex } from "@/lib/sagas/index-atlas/summary";
import { parseIndexParams } from "@/lib/sagas/index-atlas/params";
import type { Orientation } from "@/lib/atlas/types";
import { useAtlasCamera, useChromeInsets, useViewport } from "@/components/atlas/use-atlas-camera";
import { IndexPlane } from "./index-plane";
import { IndexTopBar, IndexZoom } from "./index-chrome";
import styles from "./sagas-atlas.module.css";

export type SagasAtlasProps = { cards: SagaIndexCard[]; authenticated: boolean; canCurate: boolean };
const bold = (chunks: ReactNode) => <b>{chunks}</b>;

/** Isla cliente del atlas de sagas y universos (spec 2026-10-28 índice §5). Deriva modelo y
 *  layout de las tarjetas; su estado es la cámara. `canCurate`, la selección y la mini-ficha
 *  los usan las tareas siguientes (mini-ficha, buscador y filtros, lista). */
export function SagasAtlas(props: SagasAtlasProps) {
  const { cards, authenticated } = props;
  const t = useTranslations("sagaIndex");
  const searchParams = useSearchParams();
  const params = useMemo(() => parseIndexParams((n) => searchParams.get(n)), [searchParams]);
  const model = useMemo(() => deriveIndexAtlas(cards, authenticated), [cards, authenticated]);

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
  const { camera, animated, zoomBy, fitAll, bind } = useAtlasCamera({
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

  const summary = summarizeIndex(model, model.sagaCount);
  return (
    <div className={styles.root} data-sagas-atlas data-ready={ready || undefined}>
      <div
        ref={stageRef}
        className={styles.stage}
        data-atlas-stage
        role="region"
        aria-label={t("atlas.planeLabel")}
        // El navegador desplaza un `overflow: hidden` para enseñar lo enfocado; la cámara ya lo hace.
        onScroll={(e) => {
          e.currentTarget.scrollTop = 0;
          e.currentTarget.scrollLeft = 0;
        }}
        {...bind}
      >
        <IndexPlane model={model} layout={layout} camera={camera} viewport={viewport} animated={animated && ready}
          dimmed={() => false} selectedId={null} onSelect={() => {}} onFocusSaga={() => {}} />
      </div>
      <IndexTopBar ref={topRef} count={model.sagaCount}
        summary={t.rich(`atlas.summary.${summary.key}`, { ...summary.values, b: bold })} actions={null} />
      <div ref={dockRef} className={styles.dock} data-atlas-chrome="dock" />
      <IndexZoom onZoomIn={() => zoomBy(1.4)} onZoomOut={() => zoomBy(1 / 1.4)} onFit={fitAll} />
    </div>
  );
}
