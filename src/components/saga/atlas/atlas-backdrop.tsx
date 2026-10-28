"use client";
import { useTranslations } from "next-intl";
import { SAGA_ACCENT } from "@/lib/sagas/accents";
import type { Lens, AtlasLayout } from "@/lib/sagas/atlas/layout";
import type { AtlasModel, AtlasRegion } from "@/lib/sagas/atlas/model";
import type { AtlasLevel } from "./atlas-work";
import styles from "./atlas.module.css";

/** Fondo del plano, en coordenadas de mundo (el plano ya lleva la transformación).
 *  Orden: regiones y arcos de ventana; en `islands`, un botón por región. Rol y
 *  Publicación (carriles, eje, hilos) llegan en la Task 7. */
export function AtlasBackdrop({ lens, layout, model, level, sagaName, authenticated, onIsland }: {
  lens: Lens;
  layout: AtlasLayout;
  model: AtlasModel;
  level: AtlasLevel;
  sagaName: string;
  authenticated: boolean;
  onIsland: (island: { x: number; y: number }) => void;
}) {
  const regionOf = new Map(model.regions.map((r) => [r.key, r] as const));
  if (lens !== "orden") return null;
  if (level === "islands") {
    return (
      <>
        {layout.islands.map((i) => {
          const region = regionOf.get(i.key);
          if (!region) return null;
          return (
            <IslandButton key={i.key} region={region} name={region.name ?? sagaName} x={i.x} y={i.y} r={i.r}
              works={model.works.filter((w) => w.regionKey === i.key).length}
              authenticated={authenticated} onClick={() => onIsland(i)} />
          );
        })}
      </>
    );
  }
  return (
    <svg className={styles.backdrop} width={1} height={1} aria-hidden="true">
      {layout.regions.map((r) => {
        const region = regionOf.get(r.key);
        const color = SAGA_ACCENT[region?.accent ?? "beige"].cssVar;
        return (
          <g key={r.key}>
            <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={16} fill={color} fillOpacity={0.1} />
            <text x={r.x + 6} y={r.y - 8} fill={color} className={styles.regionName}>
              {region?.name ?? sagaName}
            </text>
          </g>
        );
      })}
      {layout.arcs.map((a) => (
        <path key={a.key} d={`M ${a.x1} ${a.y1} Q ${a.via.x} ${a.via.y} ${a.x2} ${a.y2}`}
          fill="none" stroke="var(--map-window)" strokeWidth={1.5} strokeDasharray="4 4" />
      ))}
    </svg>
  );
}

function IslandButton({ region, name, x, y, r, works, authenticated, onClick }: {
  region: AtlasRegion; name: string; x: number; y: number; r: number; works: number; authenticated: boolean; onClick: () => void;
}) {
  const t = useTranslations("saga.atlas");
  const progress = authenticated && region.counted > 0;
  const finished = progress && region.completed >= region.counted;
  const figure = finished ? `${region.counted}✓` : progress && region.completed > 0 ? `${region.completed}/${region.counted}` : String(works);
  const color = SAGA_ACCENT[region.accent].cssVar;
  const current = region.state === "current";
  return (
    <button
      type="button"
      className={styles.island}
      data-state={region.state}
      aria-label={[
        progress ? t("islandAria", { name, completed: region.completed, total: region.counted }) : t("islandAriaCount", { name, count: works }),
        current ? t("islandCurrent") : null,
      ].filter(Boolean).join(", ")}
      style={{
        left: x - r, top: y - r, width: 2 * r, height: 2 * r,
        background: `color-mix(in srgb, ${color} ${current ? 50 : 32}%, transparent)`,
      }}
      onClick={onClick}
    >
      <span className={styles.islandLabel}>
        {figure}
        <small>{name}</small>
        {/* Señal que no depende del color (ni del aro dorado). */}
        {current && <span className={styles.islandCurrent} aria-hidden="true">● {t("islandCurrent")}</span>}
      </span>
    </button>
  );
}
