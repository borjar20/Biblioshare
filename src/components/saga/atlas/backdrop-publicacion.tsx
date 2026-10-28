"use client";
import { useTranslations } from "next-intl";
import type { AtlasLayout, Orientation } from "@/lib/sagas/atlas/layout";
import { positions, smoothPath } from "./backdrop-shared";
import styles from "./atlas.module.css";

/** Fondo de la lente Publicación: eje de años (o «sin año») y un hilo dorado que une las obras
 *  en el orden de lectura, para ver cuánto se aparta de la salida. */
export function BackdropPublicacion({ layout, orientation }: { layout: AtlasLayout; orientation: Orientation }) {
  const t = useTranslations("saga");
  const { minX, maxX, minY, maxY } = layout.extent;
  const at = positions(layout);
  const ticks = layout.guides.filter((g) => g.kind === "tick");
  const axis = ticks[0];
  const thread = layout.threads.find((th) => th.kind === "publicacion");
  const pts = (thread?.keys ?? []).flatMap((k) => {
    const p = at.get(k);
    return p ? [p] : [];
  });
  return (
    <>
      <svg className={styles.backdrop} width={1} height={1} aria-hidden="true">
        {axis && (
          <line x1={orientation === "h" ? minX : axis.x} x2={orientation === "h" ? maxX : axis.x}
            y1={orientation === "h" ? axis.y : minY} y2={orientation === "h" ? axis.y : maxY}
            stroke="var(--line)" strokeWidth={1} />
        )}
        {ticks.map((g) => (
          <line key={g.key} x1={g.x} y1={g.y} x2={orientation === "h" ? g.x : g.x - 8} y2={orientation === "h" ? g.y - 8 : g.y}
            stroke="var(--muted)" strokeWidth={1} />
        ))}
        {pts.length > 1 && (
          <path d={smoothPath(pts)} fill="none" stroke="var(--glow)" strokeOpacity={0.5} strokeWidth={2} strokeLinecap="round" />
        )}
      </svg>
      {ticks.map((g) => (
        <span key={g.key} className={styles.tick} style={{ left: g.x, top: g.y }}>
          {g.key === "sin-año" ? t("atlas.noYear") : g.key}
        </span>
      ))}
    </>
  );
}
