"use client";
// Acciones del dueño en la story de cierre (spec 2026-10-06 §2 y §4): Publicar /
// Despublicar y Actualizar. «Actualizar» se deshabilita con el motivo VISIBLE
// cuando canRefresh ≠ ok (no un tooltip: en móvil no hay hover). El botón
// Compartir lo añade la Task 16 en el hueco `share`.
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { publishWrapUp, refreshWrapUp, unpublishWrapUp } from "@/lib/wrap-ups/actions";
import type { OwnWrapUp } from "@/lib/wrap-ups/get-own-wrap-ups";
import { canRefresh } from "@/lib/wrap-ups/refresh-policy";
import styles from "./story-player.module.css";

type Notice = "refreshed" | "refreshLater" | "refreshPublished" | "refreshEmpty" | "actionError" | null;

export function ClosingActions({ wrapUp, share }: { wrapUp: OwnWrapUp; share?: ReactNode }) {
  const t = useTranslations("wrapUps.ui");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<Notice>(null);
  // Se evalúa al pintar la story de cierre; si pasan los 10 min con ella abierta,
  // la acción del servidor vuelve a decidir (y devuelve too_soon si toca).
  const [now] = useState(() => new Date());
  const verdict = canRefresh(wrapUp, now);
  const published = wrapUp.publishedPostId != null;

  const run = (fn: () => Promise<Notice>) => start(async () => {
    try {
      setNotice(await fn());
      router.refresh();
    } catch {
      setNotice("actionError");
    }
  });

  const togglePublish = () => run(async () => {
    if (published) { await unpublishWrapUp(wrapUp.kind); return null; }
    const r = await publishWrapUp(wrapUp.kind);
    return r.ok ? null : "actionError";
  });

  const refresh = () => run(async () => {
    const r = await refreshWrapUp(wrapUp.kind);
    if (r.ok) return "refreshed";
    return r.reason === "too_soon" ? "refreshLater"
      : r.reason === "published" ? "refreshPublished"
      : r.reason === "empty" ? "refreshEmpty" : "actionError";
  });

  const refreshReason = verdict === "too_soon" ? t("refreshLater") : verdict === "published" ? t("refreshPublished") : null;

  return (
    <div className={styles.actions} aria-busy={pending}>
      <div className={styles.actionRow}>
        {/* Task 16: el botón «Compartir» va aquí, primero de la fila. */}
        {share}
        <button type="button" className={published ? styles.btn : `${styles.btn} ${styles.btnPrimary}`} onClick={togglePublish} disabled={pending}>
          {published ? t("unpublish") : t("publish")}
        </button>
        <button type="button" className={styles.btn} onClick={refresh} disabled={pending || verdict !== "ok"}
          aria-describedby={refreshReason ? "wrap-refresh-reason" : undefined}>
          {t("refresh")}
        </button>
      </div>
      {published && <p className={styles.note}>{t("published")}</p>}
      {refreshReason && <p id="wrap-refresh-reason" className={styles.note}>{refreshReason}</p>}
      <p className={styles.note} role="status">{notice && t(notice) !== refreshReason ? t(notice) : ""}</p>
    </div>
  );
}
