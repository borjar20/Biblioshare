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
export function AtlasWork({ work, placed, accent, level, onSelect }: {
  work: AtlasWorkModel;
  placed: PlacedWork;
  accent: SagaAccentToken;
  level: AtlasLevel;
  onSelect?: (work: AtlasWorkModel) => void;
}) {
  const t = useTranslations("saga");
  const state = work.skipped ? t("atlas.skipped") : t(`atlas.${STATE_KEY[work.state]}`);
  const role = work.role ? t(`roleLabel.${work.role}`) : null;
  return (
    <button
      type="button"
      className={styles.work}
      data-work-key={work.key}
      data-state={work.state}
      data-skipped={work.skipped || undefined}
      aria-label={t("atlas.workAria", { title: work.title, state: role ? `${state}, ${role}` : state })}
      style={{
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
      {level === "detail" && (
        <span className={styles.caption} aria-hidden="true">
          <span className={styles.captionTitle}>{work.title}</span>
          {(work.readingNo !== null || work.role) && (
            <span className={styles.captionMeta}>
              {[work.readingNo !== null ? `#${work.readingNo}` : null, work.role ? t(`roleShort.${work.role}`) : null]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
        </span>
      )}
    </button>
  );
}
