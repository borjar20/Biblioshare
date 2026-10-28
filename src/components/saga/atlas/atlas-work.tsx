"use client";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { SAGA_ACCENT, type SagaAccentToken } from "@/lib/sagas/accents";
import type { AtlasWork as AtlasWorkModel } from "@/lib/sagas/atlas/model";
import { COVER_H, COVER_W, type PlacedWork } from "@/lib/sagas/atlas/layout";
import styles from "./atlas.module.css";

export type AtlasLevel = "islands" | "covers" | "detail";

const STATE_KEY = { done: "done", now: "now", todo: "todo" } as const;

/** Una obra del plano (spec 2026-10-28 §5.3): portada en `covers`, más título y rol en
 *  `detail`. En `islands` sigue montada pero con `visibility: hidden` (fuera también del
 *  orden de tabulación): al volver a acercar, cada portada anima desde su sitio. */
export function AtlasWork({ work, placed, accent, level, dim = 1, filtered = false, progress = false, showReadingNo = false, onSelect }: {
  work: AtlasWorkModel;
  placed: PlacedWork;
  accent: SagaAccentToken;
  level: AtlasLevel;
  dim?: number; // opacidad final: el mínimo de las fuentes (`workDim`)
  filtered?: boolean; // atenuada por un filtro (carril de `?rol=` u obra fuera del itinerario)
  progress?: boolean; // capa Progreso encendida: marcas y estado en el nombre accesible
  showReadingNo?: boolean; // Publicación: número de lectura sobre la portada
  onSelect?: (work: AtlasWorkModel) => void;
}) {
  const t = useTranslations("saga");
  const state = work.skipped ? t("atlas.skipped") : t(`atlas.${STATE_KEY[work.state]}`);
  const role = work.role ? t(`roleLabel.${work.role}`) : null;
  // Sin la capa (o sin sesión) el nombre no afirma un estado del lector: solo título, rol y paso.
  const label = [work.title, progress ? state : null, role, work.step !== null ? t("atlas.step", { n: work.step }) : null]
    .filter(Boolean)
    .join(", ");
  return (
    <button
      type="button"
      className={styles.work}
      data-work-key={work.key}
      data-state={work.state}
      data-skipped={work.skipped || undefined}
      data-dimmed={filtered || undefined}
      data-step={work.step ?? undefined}
      aria-label={label}
      style={{
        ["--dim" as string]: dim,
        // `--s`: la escala propia (extras a 0,7); el área táctil la compensa junto a `--k`.
        ["--s" as string]: placed.scale,
        width: COVER_W,
        height: COVER_H,
        transform: `translate(${placed.x - COVER_W / 2}px, ${placed.y - COVER_H / 2}px) scale(${placed.scale})`,
        visibility: level === "islands" ? "hidden" : undefined,
      }}
      onClick={onSelect ? () => onSelect(work) : undefined}
    >
      <span className={styles.cover}>
        {work.coverUrl ? (
          <Image src={work.coverUrl} alt="" fill sizes="180px" />
        ) : (
          <span className={styles.spine} style={{ background: SAGA_ACCENT[accent].cssVar }} aria-hidden="true">
            {work.title}
          </span>
        )}
      </span>
      {/* Capa Progreso: señales que no dependen del color (✓, etiqueta «ahora», tachado en CSS). */}
      {progress && work.state === "done" && !work.skipped && (
        <span className={styles.doneMark} data-done-mark aria-hidden="true">✓</span>
      )}
      {progress && work.state === "now" && (
        <span className={styles.nowLabel} data-now-label aria-hidden="true">{t("atlas.now")}</span>
      )}
      {showReadingNo && (
        <span className={styles.badge} data-reading-no aria-hidden="true">{work.readingNo ?? "·"}</span>
      )}
      {level === "detail" && (
        <span className={styles.caption} aria-hidden="true">
          <span className={styles.captionTitle}>{work.title}</span>
          {/* Con la insignia en la esquina (Publicación) el número no se repite bajo el título. */}
          {((!showReadingNo && work.readingNo !== null) || work.role) && (
            <span className={styles.captionMeta}>
              {[!showReadingNo && work.readingNo !== null ? `#${work.readingNo}` : null, work.role ? t(`roleShort.${work.role}`) : null]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
        </span>
      )}
    </button>
  );
}
