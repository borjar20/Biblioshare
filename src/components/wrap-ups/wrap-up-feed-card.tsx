"use client";
// Tarjeta del feed de una crónica publicada (post `wrap_up`, spec 2026-10-06 §5
// «Tarjeta del feed»). Solo pinta el ShareSummary público: periodo, cifra del
// cierre, hasta 4 portadas, la narradora (primer frame, quieta) y la ardilla del
// autor. Al pulsarla abre la imagen 9:16 grande en un <dialog> nativo; NUNCA las
// stories (esas son solo del dueño). Cabecera y pie como ExperienceFeedCard:
// reacciones/comentarios en /post/[id] y borrado para el dueño o moderación.
//
// Mensajes de cliente: wrapUps.feed + wrapUps.stories.{closing,time} (ver
// WRAP_UP_FEED_MESSAGES); las rutas que pintan el feed los añaden a RouteMessages.
import Link from "next/link";
import { useRef, useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import type { WrapUpFeedEvent } from "@/lib/social/feed";
import { narratorSheet } from "@/lib/wrap-ups/narrator";
import { closingCopy, sharedPeriodLabel, type T } from "@/lib/wrap-ups/view-models";
import { PetSprite } from "@/components/pet/pet-sprite";
import { TimeAgo } from "@/components/ui/time-ago";
import { UserAvatar } from "@/components/social/user-avatar";
import { PostSummary } from "@/components/social/post-summary";
import { PostDeleteError, PostDeleteMenu, useDeletePost } from "@/components/social/post-delete-menu";
import { POSTER_FIELD } from "./poster";
import { PosterCover } from "./poster-cover";
import { pixelFont } from "./pixel-font";
import poster from "./poster.module.css";
import styles from "./wrap-up-feed-card.module.css";

/** Imagen 9:16 del resumen publicado. La ruta lee con la sesión: misma RLS que el feed. */
export const wrapUpShareImageUrl = (shareId: string) => `/api/og/wrap-up/share/${shareId}`;

export function WrapUpFeedCard({
  event: e,
  hideActor = false,
  showInteractions = true,
  variant = "feed",
}: {
  event: WrapUpFeedEvent;
  viewerLoggedIn: boolean;
  hideActor?: boolean;
  showInteractions?: boolean;
  /** `detail` (/post/[id]): la imagen grande en la propia tarjeta en vez del cierre compacto. */
  variant?: "feed" | "detail";
}) {
  const t = useTranslations("wrapUps.feed");
  const tRoot = useTranslations() as unknown as T;
  const { deleted, error, pending, requestDelete } = useDeletePost(e.postId);
  const dialogRef = useRef<HTMLDialogElement>(null);
  // La imagen se genera al pedirla (Satori): no se monta hasta abrir el diálogo,
  // o cada tarjeta del feed la pediría al cargar la página.
  const [imageRequested, setImageRequested] = useState(false);
  if (deleted) return null;

  const s = e.summary;
  const name = e.actorDisplayName || e.actorUsername;
  const period = sharedPeriodLabel(s);
  const copy = closingCopy(s, tRoot);
  const imageAlt = t("imageAlt", { name, period });
  const image = (
    // eslint-disable-next-line @next/next/no-img-element -- PNG de una ruta propia (ya optimizado), no un asset estático
    <img src={wrapUpShareImageUrl(e.shareId)} alt={imageAlt} width={1080} height={1920} className={styles.image} />
  );

  function openImage() {
    setImageRequested(true);
    dialogRef.current?.showModal();
  }

  return (
    <article data-testid="wrap-up-feed-card" className={`${pixelFont.variable} space-y-3 rounded-card border border-border bg-surface p-4 shadow-card`}>
      <div className="flex flex-wrap items-center gap-2.5">
        {!hideActor && <UserAvatar name={name} avatarUrl={e.actorAvatarUrl} size={28} />}
        {/* Nombre y rótulo apilados: el rótulo es largo y, en fila, dejaba el nombre a una letra por línea en móvil. */}
        <div className="flex min-w-0 flex-1 flex-col">
          {!hideActor && <Link href={`/u/${e.actorUsername}`} className="break-words text-sm font-semibold hover:underline">{name}</Link>}
          <span className="text-xs text-muted-foreground">{t("title", { kind: s.kind })}</span>
        </div>
        <TimeAgo iso={e.eventDate} className="shrink-0 font-mono text-[10px] text-muted-foreground" />
        {e.viewerCanDelete && e.postId && <PostDeleteMenu pending={pending} onDelete={requestDelete} />}
      </div>

      {variant === "detail" ? (
        <div className={styles.detail}>{image}</div>
      ) : (
        <div lang="es" className={styles.mini} style={{ "--field": POSTER_FIELD[s.palette] } as CSSProperties}>
          <p className={poster.eyebrow}>{period}</p>
          <div className={styles.row}>
            {copy.figure && (
              <p className={`${poster.plate} ${styles.figure}`}>
                <span className={styles.figureValue}>{copy.figure.value}</span>{" "}
                <span className={styles.figureUnit}>{copy.figure.unit}</span>
              </p>
            )}
            <div className={`${poster.plate} ${styles.lines}`}>
              {copy.lines.map((l, i) => <p key={i}>{l}</p>)}
            </div>
          </div>
          {s.covers.length > 0 && (
            <ul className={`${poster.covers} ${styles.covers}`}>
              {s.covers.slice(0, 4).map((c) => <PosterCover key={`${c.type}-${c.id}`} item={c} />)}
            </ul>
          )}
          <div className={styles.cast}>
            <NarratorStill variant={s.narrator} />
            {s.pet && (
              <span className={styles.pet}>
                <PetSprite stage={s.pet.stage} petClass={s.pet.petClass} mood="happy" scale={1} label={s.pet.name} />
              </span>
            )}
          </div>
          {/* Botón que cubre el cierre: toda la tarjeta se pulsa, sin anidar listas dentro de un <button>. */}
          <button type="button" className={styles.open} onClick={openImage} aria-label={t("openImage")} aria-haspopup="dialog" />
        </div>
      )}

      {showInteractions && e.postId && <PostSummary postId={e.postId} reactionCount={e.reactionCount} commentCount={e.commentCount} />}
      {error && <PostDeleteError />}

      {variant === "feed" && (
        <dialog
          ref={dialogRef}
          aria-label={imageAlt}
          className={styles.dialog}
          // Clic en el telón (fuera de la imagen) cierra, como el resto de capas.
          onClick={(ev) => { if (ev.target === ev.currentTarget) ev.currentTarget.close(); }}
        >
          <button type="button" className={styles.close} onClick={() => dialogRef.current?.close()}>{t("close")}</button>
          {imageRequested && image}
        </dialog>
      )}
    </article>
  );
}

/** Narradora en su primer frame, quieta: en el feed no se anima (la tarjeta se ojea). */
function NarratorStill({ variant }: { variant: WrapUpFeedEvent["summary"]["narrator"] }) {
  const { src, cell, frames } = narratorSheet(variant);
  const style: CSSProperties = {
    width: cell,
    height: cell,
    backgroundImage: `url(${src})`,
    backgroundSize: `${cell * frames}px ${cell}px`,
  };
  return (
    <span className={`${poster.narratorStamp} ${styles.narrator}`} aria-hidden="true">
      <span className={poster.narratorSprite} style={style} data-variant={variant} />
    </span>
  );
}
