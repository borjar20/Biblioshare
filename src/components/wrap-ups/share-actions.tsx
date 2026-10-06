"use client";
// Acciones del dueño en la story de cierre (spec 2026-10-06 §2 y §4): Compartir
// la imagen 9:16, Publicar / Despublicar y Actualizar. «Actualizar» se
// deshabilita con el motivo VISIBLE cuando canRefresh ≠ ok (no un tooltip: en
// móvil no hay hover).
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { publishWrapUp, refreshWrapUp, unpublishWrapUp } from "@/lib/wrap-ups/actions";
import type { OwnWrapUp } from "@/lib/wrap-ups/get-own-wrap-ups";
import { canRefresh } from "@/lib/wrap-ups/refresh-policy";
import type { WrapUpKind } from "@/lib/wrap-ups/windows";
import { browserShareEnv, imageFileName, imageUrl, prepareWrapUpImage, shareMode, shareWrapUpImage, type ShareEnv, type ShareMode } from "./share-image";
import styles from "./story-player.module.css";

type Notice = "refreshed" | "refreshLater" | "refreshPublished" | "refreshEmpty" | "actionError" | "shareError" | null;

/**
 * «Compartir»: hoja del sistema con el PNG si el dispositivo sabe compartir
 * ficheros (APK con el plugin, o Web Share); si no, un enlace de descarga. El
 * camino se decide tras montar (en SSR no hay `navigator`): hasta entonces es el
 * botón, que es lo que verá casi todo el mundo (móvil).
 */
function ShareButton({ kind, onError }: { kind: WrapUpKind; onError: () => void }) {
  const t = useTranslations("wrapUps");
  const [mode, setMode] = useState<ShareMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState<{ env: ShareEnv; file?: File } | null>(null);

  useEffect(() => {
    let live = true;
    browserShareEnv().then(async (env) => {
      const nextMode = shareMode(env);
      const file = nextMode === "web" ? await prepareWrapUpImage(env, kind) : undefined;
      if (live) { setReady({ env, file }); setMode(nextMode); }
    }).catch(() => { if (live) setMode("download"); });
    return () => { live = false; };
  }, [kind]);

  if (mode === "download") {
    return (
      <a className={`${styles.btn} ${styles.btnPrimary}`} href={imageUrl(kind)} download={imageFileName(kind)}>
        {t("ui.download")}
      </a>
    );
  }

  const share = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      await shareWrapUpImage(ready.env, kind, t("stories.cover.title", { kind }), ready.file);
    } catch {
      onError();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={share} disabled={busy || !ready} aria-busy={busy || !ready}>
      {t("ui.share")}
    </button>
  );
}

export function ClosingActions({ wrapUp }: { wrapUp: OwnWrapUp }) {
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
        <ShareButton key={wrapUp.refreshedAt ?? wrapUp.generatedAt} kind={wrapUp.kind} onError={() => setNotice("shareError")} />
        <button type="button" className={styles.btn} onClick={togglePublish} disabled={pending}>
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
