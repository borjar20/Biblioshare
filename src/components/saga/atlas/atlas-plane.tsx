"use client";
import type { CSSProperties } from "react";
import type { Camera, Point, Viewport } from "@/lib/atlas/types";
import type { SagaItemRole } from "@/lib/sagas/roles";
import type { AtlasLayout, Lens, Orientation } from "@/lib/sagas/atlas/layout";
import type { AtlasModel, AtlasWork as AtlasWorkModel } from "@/lib/sagas/atlas/model";
import { AtlasBackdrop } from "./atlas-backdrop";
import { AtlasWork, type AtlasLevel } from "./atlas-work";
import styles from "./atlas.module.css";

/** Nivel de zoom semántico (spec 2026-10-28 §5.3). Sin islas (saga sin subsagas) no hay nivel `islands`. */
export function zoomLevel(k: number, layout: AtlasLayout): AtlasLevel {
  return k < 0.5 && layout.islands.length > 0 ? "islands" : k > 1.6 ? "detail" : "covers";
}

/** El plano: un `div` con la transformación mundo → pantalla de la cámara. Dentro, el
 *  fondo SVG y una obra por item, en orden de lectura (es el orden de tabulación). */
export function AtlasPlane({ lens, orientation, role, layout, model, camera, viewport, animated, sagaName, authenticated, onIsland, onRole, onSelect }: {
  lens: Lens;
  orientation: Orientation;
  role: SagaItemRole | null; // resaltado de `?rol=` (solo cuenta en la lente Rol)
  layout: AtlasLayout;
  model: AtlasModel;
  camera: Camera;
  viewport: Viewport;
  animated: boolean;
  sagaName: string;
  authenticated: boolean;
  onIsland: (p: Point) => void;
  onRole: (role: SagaItemRole) => void;
  onSelect?: (work: AtlasWorkModel) => void;
}) {
  const level = zoomLevel(camera.k, layout);
  const placed = new Map(layout.items.map((i) => [i.key, i] as const));
  const accent = new Map(model.regions.map((r) => [r.key, r.accent] as const));
  const style: CSSProperties & { "--k": number } = {
    transform: `translate(${viewport.width / 2 - camera.x * camera.k}px, ${viewport.height / 2 - camera.y * camera.k}px) scale(${camera.k})`,
    transformOrigin: "0 0",
    "--k": camera.k,
  };
  const works = [...model.works].sort((a, b) => a.readingIndex - b.readingIndex);
  return (
    <div className={styles.plane} style={style} data-level={level} data-animated={animated}>
      <AtlasBackdrop lens={lens} orientation={orientation} role={role} layout={layout} model={model} level={level} sagaName={sagaName}
        authenticated={authenticated} onIsland={onIsland} onRole={onRole} />
      {works.map((w) => {
        const p = placed.get(w.key);
        return p ? (
          <AtlasWork key={w.key} work={w} placed={p} accent={accent.get(w.regionKey) ?? "beige"} level={level}
            dimmed={lens === "rol" && role !== null && w.role !== role}
            showReadingNo={lens === "publicacion"} onSelect={onSelect} />
        ) : null;
      })}
    </div>
  );
}
