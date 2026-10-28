"use client";
import { COVER_H, type AtlasLayout, type Orientation } from "@/lib/sagas/atlas/layout";
import type { AtlasModel } from "@/lib/sagas/atlas/model";
import { arcChainPath, positions } from "./backdrop-shared";
import styles from "./atlas.module.css";

/** Separación (mundo) entre el pie de la portada y el centro del círculo del paso. */
const BADGE_GAP = 11;
const BADGE_R = 8;

/** Capa Itinerario (spec 2026-10-28 §5.2), común a las tres lentes: un hilo
 *  `--map-itinerary-jump` que une las obras con `step` en su orden y un círculo numerado bajo
 *  cada una. Los arcos se doblan hacia el lado contrario al hilo de Publicación para no pisarlo.
 *  Decorativo (`aria-hidden`): el paso ya va en el nombre accesible de cada obra. */
export function BackdropItinerary({ layout, model, orientation }: { layout: AtlasLayout; model: AtlasModel; orientation: Orientation }) {
  const at = positions(layout);
  const badges = model.works
    .filter((w) => w.step !== null)
    .sort((a, b) => (a.step ?? 0) - (b.step ?? 0))
    .flatMap((w) => {
      const p = at.get(w.key);
      return p ? [{ key: w.key, step: w.step as number, x: p.x, y: p.y + (p.scale * COVER_H) / 2 + BADGE_GAP }] : [];
    });
  if (badges.length === 0) return null;
  return (
    <svg className={styles.backdrop} width={1} height={1} aria-hidden="true">
      {badges.length > 1 && (
        <path d={arcChainPath(badges, orientation, -1)} fill="none" stroke="var(--map-itinerary-jump)" strokeWidth={2} strokeLinecap="round" />
      )}
      {badges.map((b) => (
        <g key={b.key}>
          <circle cx={b.x} cy={b.y} r={BADGE_R} fill="var(--map-itinerary-jump)" stroke="var(--ground)" strokeWidth={1.5} />
          <text x={b.x} y={b.y} className={styles.stepBadge} data-step-badge textAnchor="middle" dominantBaseline="central">
            {b.step}
          </text>
        </g>
      ))}
    </svg>
  );
}
