"use client";
import { useTranslations } from "next-intl";
import type { AtlasLayout, Orientation } from "@/lib/sagas/atlas/layout";
import { SAGA_ITEM_ROLES, type SagaItemRole } from "@/lib/sagas/roles";
import { positions } from "./backdrop-shared";
import styles from "./atlas.module.css";

const isRole = (k: string): k is SagaItemRole => (SAGA_ITEM_ROLES as readonly string[]).includes(k);

/** Fondo de la lente Rol: una línea por carril con su etiqueta, e hilos discontinuos de la
 *  principal a cada obra con rol. Con `?rol=`, el carril elegido a plena opacidad y el resto atenuado. */
export function BackdropRol({ layout, orientation, role, onRole }: {
  layout: AtlasLayout;
  orientation: Orientation;
  role: SagaItemRole | null;
  onRole: (role: SagaItemRole) => void;
}) {
  const t = useTranslations("saga");
  const { minX, maxX, minY, maxY } = layout.extent;
  const at = positions(layout);
  const lanes = layout.guides.filter((g) => g.kind === "lane");
  const dim = (key: string) => role !== null && key !== role;
  return (
    <>
      <svg className={styles.backdrop} width={1} height={1} aria-hidden="true">
        {lanes.map((g) => (
          <line key={g.key} x1={orientation === "h" ? minX : g.x} x2={orientation === "h" ? maxX : g.x}
            y1={orientation === "h" ? g.y : minY} y2={orientation === "h" ? g.y : maxY}
            stroke="var(--line)" strokeWidth={1} opacity={dim(g.key) ? 0.35 : 1} />
        ))}
        {layout.threads.filter((th) => th.kind === "rol").map((th) => {
          const [from, to] = th.keys.map((k) => at.get(k));
          if (!from || !to) return null;
          const via = orientation === "h" ? { x: from.x + (to.x - from.x) / 2, y: to.y } : { x: to.x, y: from.y + (to.y - from.y) / 2 };
          return (
            <path key={th.keys.join(">")} d={`M ${from.x} ${from.y} Q ${via.x} ${via.y} ${to.x} ${to.y}`}
              fill="none" stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 4" opacity={0.7} />
          );
        })}
      </svg>
      {lanes.map((g) => {
        const text = g.key === "principal" ? t("atlas.principal") : t(`roleLabel.${g.key as SagaItemRole}`);
        const style = { left: g.x, top: g.y, opacity: dim(g.key) ? 0.35 : 1 };
        // La principal no es un rol filtrable (`?rol=` solo admite los de `SAGA_ITEM_ROLES`): etiqueta sin botón.
        if (!isRole(g.key)) return <span key={g.key} className={styles.lane} style={style}>{text}</span>;
        const key = g.key;
        return (
          <button key={g.key} type="button" className={`${styles.lane} ${styles.laneButton}`} style={style}
            aria-pressed={role === key} onClick={() => onRole(key)}>
            {text}
          </button>
        );
      })}
    </>
  );
}
