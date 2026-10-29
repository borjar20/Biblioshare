"use client";
import Image from "next/image";
import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { SAGA_ACCENT } from "@/lib/sagas/accents";
import type { IndexAtlasChild, IndexAtlasSaga } from "@/lib/sagas/index-atlas/model";
import { SAGA_H, SAGA_W, type SagaBox } from "@/lib/sagas/index-atlas/layout";
import type { IndexLevel } from "./index-plane";
import styles from "./sagas-atlas.module.css";

const isRoot = (s: IndexAtlasSaga | IndexAtlasChild): s is IndexAtlasSaga => "zone" in s;

/** Iniciales de portada sin imagen: la primera letra o dígito de cada palabra (se saltan las
 *  que no tienen), dos como máximo: «La Rueda del Tiempo» → «LR», «[QA Sagas] Universo» → «QS». */
export function sagaInitials(name: string): string {
  const letters = name.split(/\s+/)
    .map((w) => w.match(/[\p{L}\p{N}]/u)?.[0])
    .filter((c): c is string => !!c)
    .slice(0, 2);
  return letters.length > 0 ? letters.join("").toUpperCase() : (name.trim()[0] ?? "").toUpperCase();
}

/** Una saga del plano (spec 2026-10-28 índice §5.1). La raíz es un botón (abre la mini-ficha);
 *  una subsaga, un enlace real fuera del orden de tabulación (se llega a ella por la mini-ficha
 *  y la lista). En `zones` sigue montada con `visibility: hidden`, como las obras del atlas de
 *  la saga: al volver a acercar, cada portada anima desde su sitio. */
export function IndexSaga({ saga, box, level, dimmed, selected, progress, zoneOf, onSelect, onFocus }: {
  saga: IndexAtlasSaga | IndexAtlasChild; box: SagaBox; level: IndexLevel; dimmed: boolean; selected: boolean;
  progress: { completed: number; total: number } | null; zoneOf?: string; onSelect?: () => void; onFocus?: () => void;
}) {
  const t = useTranslations("sagaIndex");
  const root = isRoot(saga);
  const coverUrl = root ? saga.coverUrl : null;
  // `--saga-accent` (no `--accent`: el token terracota ES `var(--accent)` y sería un ciclo).
  const style = {
    ["--s" as string]: box.scale,
    ["--saga-accent" as string]: SAGA_ACCENT[saga.accent].cssVar,
    width: SAGA_W,
    height: SAGA_H,
    transform: `translate(${box.x - SAGA_W / 2}px, ${box.y - SAGA_H / 2}px) scale(${box.scale})`,
    visibility: level === "zones" ? "hidden" : undefined,
  } as CSSProperties;
  const cover = (
    <span className={styles.cover}>
      {coverUrl ? (
        <Image src={coverUrl} alt="" fill sizes="160px" />
      ) : (
        <span className={styles.initials} style={{ background: SAGA_ACCENT[saga.accent].cssVar }} aria-hidden="true">
          {sagaInitials(saga.name)}
        </span>
      )}
    </span>
  );

  if (!root) {
    return (
      <a href={saga.href} className={styles.saga} data-saga-id={saga.id} data-child="" data-dimmed={dimmed || undefined}
        aria-label={t("atlas.sagaLabel", { name: saga.name, count: saga.titleCount })} tabIndex={-1} style={style}>
        {cover}
      </a>
    );
  }

  const label = saga.children.length > 0
    ? t("atlas.universeLabel", { name: saga.name, count: saga.children.length + 1 })
    : t("atlas.sagaLabel", { name: saga.name, count: saga.titleCount });
  const pct = progress && progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : null;
  const breakdown = (["book", "movie", "series"] as const)
    .filter((k) => saga.typeBreakdown[k] > 0)
    .map((k) => t(`typeCount.${k}`, { count: saga.typeBreakdown[k] }))
    .join(" · ");
  return (
    <button
      type="button"
      className={styles.saga}
      data-saga-id={saga.id}
      data-zone-of={zoneOf}
      data-dimmed={dimmed || undefined}
      data-selected={selected || undefined}
      aria-haspopup="dialog"
      aria-expanded={selected}
      aria-label={label}
      style={style}
      onClick={onSelect}
      onFocus={onFocus}
    >
      {cover}
      {level !== "zones" && (
        <span className={styles.caption} aria-hidden="true">
          <span className={styles.captionTitle}>{saga.name}</span>
          {level === "detail" && breakdown && <span className={styles.captionMeta}>{breakdown}</span>}
          {level === "detail" && pct !== null && (
            <span className={styles.bar}><i style={{ width: `${pct}%` }} /></span>
          )}
        </span>
      )}
    </button>
  );
}
