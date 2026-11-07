"use client";
import Link from "next/link";
import { useId, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { IndexAtlasModel, IndexAtlasSaga } from "@/lib/sagas/index-atlas/model";
import type { Insets } from "@/lib/atlas/visible-camera";
import styles from "./sagas-atlas.module.css";

const bold = (chunks: ReactNode) => <b>{chunks}</b>;

/** Vista de lista del atlas (spec 2026-10-28 índice §5.4): la misma información que el plano, en
 *  enlaces normales y en el mismo orden. Una saga que no cumple búsqueda o filtros se atenúa y
 *  lo dice en texto oculto, pero no desaparece. Se coloca entre la barra y el dock con `insets`.
 *  Sin prefetch: son todas las sagas del catálogo a la vez. */
export function IndexList({ model, dimmed, insets }: {
  model: IndexAtlasModel; dimmed: (s: IndexAtlasSaga) => boolean; insets: Insets;
}) {
  const t = useTranslations("sagaIndex");
  const uid = useId();
  const item = (s: IndexAtlasSaga) => {
    const progress = s.progress && s.progress.total > 0 ? s.progress : null;
    const off = dimmed(s);
    return (
      <li key={s.id} className={styles.listItem} data-saga-id={s.id} data-dimmed={off || undefined}>
        <Link href={s.href} prefetch={false} className={styles.listLink}>
          <span className={styles.listName}>{s.name}</span>
          <span className={styles.listMeta}>
            {t("atlas.sheet.titleCount", { count: s.titleCount })}
            {progress && <> · {t.rich("atlas.sheet.progress", { completed: progress.completed, total: progress.total, b: bold })}</>}
          </span>
          {off && <span className={styles.srOnly}>{t("atlas.list.notMatching")}</span>}
        </Link>
        {s.children.length > 0 && (
          <ul className={styles.listChildren}>
            {s.children.map((c) => (
              <li key={c.id}>
                <Link href={c.href} prefetch={false} className={styles.listLink}>
                  <span className={styles.listName}>{c.name}</span>
                  <span className={styles.listMeta}>{t("atlas.sheet.titleCount", { count: c.titleCount })}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  };
  return (
    <div className={styles.list} role="region" aria-label={t("atlas.list.label")} style={{ top: insets.top, bottom: insets.bottom }}>
      {model.zones.map((z) => {
        const id = `${uid}-${z.key}`;
        return (
          <section key={z.key} aria-labelledby={id} className={styles.listZone}>
            <h2 id={id} className={styles.listZoneTitle}>{t("atlas.zoneCount", { name: t(`atlas.zone.${z.key}`), count: z.count })}</h2>
            {z.comarcas
              ? z.comarcas.map((c) => (
                  <div key={c.key}>
                    <h3 className={styles.listComarca}>{t(`atlas.zone.${c.key}`)}</h3>
                    <ul className={styles.listItems}>{c.sagas.map(item)}</ul>
                  </div>
                ))
              : <ul className={styles.listItems}>{z.sagas.map(item)}</ul>}
          </section>
        );
      })}
    </div>
  );
}
