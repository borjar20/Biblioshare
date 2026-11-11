"use client";
import { memo, useMemo } from "react";
import { useTranslations } from "next-intl";
import type { Camera, Viewport } from "@/lib/atlas/types";
import { SAGA_ACCENT } from "@/lib/sagas/accents";
import type { IndexAtlasModel } from "@/lib/sagas/index-atlas/model";
import type { IndexLayout, SagaBox } from "@/lib/sagas/index-atlas/layout";
import { IndexSaga } from "./index-saga";
import styles from "./sagas-atlas.module.css";

/** Nivel de zoom semántico (spec 2026-10-28 índice §5.1). */
export type IndexLevel = "zones" | "covers" | "detail";
export const indexZoomLevel = (k: number): IndexLevel => (k < 0.5 ? "zones" : k > 1.6 ? "detail" : "covers");

type ContentProps = {
  model: IndexAtlasModel; layout: IndexLayout; level: IndexLevel; dimmedIds: ReadonlySet<string>;
  selectedId: string | null; onSelect: (id: string) => void; onFocusSaga: (id: string) => void;
};

/** El plano: zonas (fondo), islas de universo y sagas, en el orden de lista (orden de tabulación).
 *  Por fotograma de cámara solo cambian `transform` y `--k` de este envoltorio: el contenido va
 *  en un hijo `memo` que solo se repinta al cambiar de nivel, de atenuación, de selección o de
 *  layout. `onSelect` y `onFocusSaga` deben ser estables (reciben el id de la saga). */
export function IndexPlane({ camera, viewport, animated, ...content }: Omit<ContentProps, "level"> & {
  camera: Camera; viewport: Viewport; animated: boolean;
}) {
  const level = indexZoomLevel(camera.k);
  const tx = viewport.width / 2 - camera.x * camera.k;
  const ty = viewport.height / 2 - camera.y * camera.k;
  return (
    <div
      className={styles.plane}
      data-animated={animated || undefined}
      data-level={level}
      style={{ transform: `translate(${tx}px, ${ty}px) scale(${camera.k})`, transformOrigin: "0 0", ["--k" as string]: camera.k }}
    >
      <PlaneContent {...content} level={level} />
    </div>
  );
}

const PlaneContent = memo(function PlaneContent({ model, layout, level, dimmedIds, selectedId, onSelect, onFocusSaga }: ContentProps) {
  const t = useTranslations("sagaIndex.atlas");
  const { sagas, accentOf, rootBox, childBoxes, zoneOfModel } = useMemo(() => {
    const sagas = model.zones.flatMap((z) => z.sagas);
    const rootBox = new Map<string, SagaBox>();
    const childBoxes = new Map<string, SagaBox[]>();
    for (const b of layout.sagas) {
      if (b.parentId === null) rootBox.set(b.id, b);
      else childBoxes.set(b.parentId, [...(childBoxes.get(b.parentId) ?? []), b]);
    }
    return {
      sagas,
      accentOf: new Map(sagas.map((s) => [s.id, SAGA_ACCENT[s.accent].cssVar] as const)),
      rootBox,
      childBoxes,
      zoneOfModel: new Map(model.zones.map((z) => [z.key, z] as const)),
    };
  }, [model, layout]);
  return (
    <>
      {layout.zones.map((z) => {
        const zone = zoneOfModel.get(z.key)!;
        const label = t("zoneCount", { name: t(`zone.${z.key}`), count: zone.count });
        return (
          <section key={z.key} className={styles.zone} data-zone={z.key} style={{ left: z.x, top: z.y, width: z.w, height: z.h }} aria-label={label}>
            <span className={styles.zoneLabel} aria-hidden="true">{label}</span>
          </section>
        );
      })}
      {layout.comarcas.map((c) => (
        <span key={c.key} className={styles.comarcaLabel} style={{ left: c.x, top: c.y }} aria-hidden="true">{t(`zone.${c.key}`)}</span>
      ))}
      {layout.islands.map((i) => (
        <span key={i.id} className={styles.island} data-island={i.id} aria-hidden="true"
          style={{ left: i.x, top: i.y, width: i.w, height: i.h, ["--saga-accent" as string]: accentOf.get(i.id) }}>
          {i.hidden > 0 && <span className={styles.islandMore}>{t("moreChildren", { count: i.hidden })}</span>}
        </span>
      ))}
      {sagas.map((s) => {
        const box = rootBox.get(s.id)!;
        const dimmed = dimmedIds.has(s.id);
        return (
          <div key={s.id}>
            <IndexSaga saga={s} box={box} level={level} dimmed={dimmed} selected={selectedId === s.id}
              progress={s.progress} zoneOf={s.zone} onSelect={onSelect} onFocus={onFocusSaga} />
            {(childBoxes.get(s.id) ?? []).map((cb) => {
              const child = s.children.find((c) => c.id === cb.id)!;
              return <IndexSaga key={cb.id} saga={child} box={cb} level={level} dimmed={dimmed} selected={false} progress={null} />;
            })}
          </div>
        );
      })}
    </>
  );
});
