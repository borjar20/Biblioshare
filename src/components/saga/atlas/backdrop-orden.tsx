"use client";
import { useTranslations } from "next-intl";
import { SAGA_ACCENT } from "@/lib/sagas/accents";
import type { AtlasLayout } from "@/lib/sagas/atlas/layout";
import type { AtlasModel, AtlasRegion } from "@/lib/sagas/atlas/model";
import type { AtlasLevel } from "./atlas-work";
import styles from "./atlas.module.css";

/** Fondo de la lente Orden: regiones y arcos de ventana; en `islands`, un botón por región. */
export function BackdropOrden({ layout, model, level, sagaName, progress, onIsland }: {
  layout: AtlasLayout;
  model: AtlasModel;
  level: AtlasLevel;
  sagaName: string;
  progress: boolean; // capa Progreso encendida (y con sesión)
  onIsland: (island: { x: number; y: number }) => void;
}) {
  const regionOf = new Map(model.regions.map((r) => [r.key, r] as const));
  if (level === "islands") {
    return (
      <>
        {layout.islands.map((i) => {
          const region = regionOf.get(i.key);
          if (!region) return null;
          return (
            <IslandButton key={i.key} region={region} name={region.name ?? sagaName} x={i.x} y={i.y} r={i.r}
              works={model.works.filter((w) => w.regionKey === i.key).length}
              progress={progress} onClick={() => onIsland(i)} />
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

function IslandButton({ region, name, x, y, r, works, progress, onClick }: {
  region: AtlasRegion; name: string; x: number; y: number; r: number; works: number; progress: boolean; onClick: () => void;
}) {
  const t = useTranslations("saga.atlas");
  const counted = progress && region.counted > 0;
  const finished = counted && region.completed >= region.counted;
  const figure = finished ? `${region.counted}✓` : counted && region.completed > 0 ? `${region.completed}/${region.counted}` : String(works);
  const color = SAGA_ACCENT[region.accent].cssVar;
  const current = region.state === "current";
  return (
    <button
      type="button"
      className={styles.island}
      data-state={region.state}
      aria-label={[
        counted ? t("islandAria", { name, completed: region.completed, total: region.counted }) : t("islandAriaCount", { name, count: works }),
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
