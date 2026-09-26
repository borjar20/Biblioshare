"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { FeedEvent } from "@/lib/social/feed";
import { TimeAgo } from "@/components/ui/time-ago";
import { UserAvatar } from "@/components/social/user-avatar";
import { RatingDots } from "@/components/ui/rating-dots";
import { PostSummary } from "@/components/social/post-summary";
import { MentionText } from "@/components/social/mention-text";
import { SpoilerGate } from "@/components/social/spoiler-gate";
import { SpineCover } from "./spine-cover";
import { itemHref } from "@/lib/catalog/item-href";
import { PostDeleteError, PostDeleteMenu, useDeletePost } from "./post-delete-menu";

// Variante C de un evento de reseña (finished/rated/reviewed/watchedEpisode):
// hero con lomo + nota + meta (tipo · autor · días · pág.), extracto de reseña y
// UNA fila de reacción (el target del propio evento).
//
// Rediseño del feed (R1, R2): sin chip «Reseña» ni estado «Finalizado»/«Visto»
// —el verbo de la cabecera ya lo dice— y, en el feed, la reseña va DENTRO de la
// caja de la obra, bajo la nota, recortada a 4 líneas con «Seguir leyendo». En
// la cabecera de /post/[id] (`showInteractions=false`) llega el texto entero y
// se pinta fuera de la caja, sin recortar: ahí es donde se lee.
// `hideActor`: variante para "Reseñas recientes" del perfil (mismo prop que
// tenía el FeedCard viejo) — el autor es el propio perfil, así que se oculta
// la cabecera. El «hace x» NO depende de esa variante (va en la cabecera o, sin
// ella, junto al menú): la antigüedad de la reseña se publica siempre.
export function ReviewCard({
  event,
  hideActor = false,
  knownUsernames,
  showInteractions = true,
}: {
  event: FeedEvent;
  viewerLoggedIn: boolean;
  hideActor?: boolean;
  /** Usernames @mencionados que existen de verdad (extracto + comentarios). */
  knownUsernames: string[];
  /** `false` en la cabecera de /post/[id]: el hilo lo pinta PostThread aparte. */
  showInteractions?: boolean;
}) {
  const t = useTranslations("feed");
  const actorName = event.actorDisplayName || event.actorUsername;
  const meta = [
    t("workType", { itemType: event.itemType }),
    event.itemSubtitle,
    // El año solo cuando no hay episodio: en series «S1E5» ya sitúa el post.
    event.episode == null && event.itemType !== "book" && event.itemYear != null ? String(event.itemYear) : null,
    event.reviewMeta?.readingDays != null ? t("review.metaDays", { count: event.reviewMeta.readingDays }) : null,
    event.reviewMeta?.totalPages != null ? t("review.metaPages", { count: event.reviewMeta.totalPages }) : null,
    event.episode ? `S${event.episode.season}E${event.episode.episode}` : null,
    // Post diario de series (fase 4): el primer episodio del día y cuántos más.
    event.episodeCount != null && event.episodeCount > 1
      ? t("review.moreEpisodes", { count: event.episodeCount - 1 })
      : null,
  ].filter(Boolean).join(" · ");
  const { deleted, error: deleteError, pending, requestDelete } = useDeletePost(event.postId);
  if (deleted) return null;
  const deleteMenu = event.viewerCanDelete && event.postId && (
    <PostDeleteMenu onDelete={requestDelete} pending={pending} />
  );

  // `whitespace-pre-line`: los saltos de línea de la reseña son del autor
  // (textarea); sin esto el HTML los colapsa y el extracto sale de corrido.
  const fullExcerpt = event.reviewExcerpt && (
    <p className="border-l-2 border-accent pl-3.5 font-serif text-[14px] leading-relaxed whitespace-pre-line break-words">
      <MentionText text={event.reviewExcerpt} knownUsernames={knownUsernames} />
    </p>
  );
  const inBoxExcerpt = event.reviewExcerpt && (
    <ClampedExcerpt
      text={event.reviewExcerpt}
      knownUsernames={knownUsernames}
      postHref={event.postId ? `/post/${event.postId}` : null}
    />
  );
  const gate = (node: React.ReactNode) => (event.reviewIsSpoiler ? <SpoilerGate>{node}</SpoilerGate> : node);

  return (
    <article className="flex flex-col gap-3 rounded-card border border-border bg-surface shadow-card p-4">
      {!hideActor ? (
        <div className="flex items-center gap-2.5">
          <UserAvatar name={actorName} avatarUrl={event.actorAvatarUrl} size={30} />
          <p className="min-w-0 flex-1 truncate text-sm text-foreground">
            <Link href={`/u/${event.actorUsername}`} className="font-semibold hover:underline">{actorName}</Link>{" "}
            <span className="text-muted-foreground">{t(`verbs.${event.verb}`)}</span>
          </p>
          <TimeAgo iso={event.eventDate} className="shrink-0 font-mono text-[10px] text-muted-foreground" />
          {deleteMenu}
        </div>
      ) : (
        // Sin cabecera, la hora va sola a la derecha, con el menú si lo hay.
        <div className="-mb-1 flex items-center justify-end gap-2">
          <TimeAgo iso={event.eventDate} className="shrink-0 font-mono text-[10px] text-muted-foreground" />
          {deleteMenu}
        </div>
      )}

      <div className="flex gap-3 rounded-lg border border-border bg-surface-muted p-3">
        <Link href={itemHref(event.itemType, event.itemId)} className="w-[58px] shrink-0">
          <SpineCover coverUrl={event.itemCoverUrl} title={event.itemTitle} className="aspect-[2/3] w-[58px]" />
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={itemHref(event.itemType, event.itemId)} className="block font-serif text-[15px] leading-tight font-semibold hover:underline">
            {event.itemTitle}
          </Link>
          {event.rating != null && <div className="mt-2"><RatingDots value={event.rating} itemType={event.itemType} /></div>}
          {meta && <p className="mt-1.5 font-mono text-[10px] text-muted-foreground">{meta}</p>}
          {showInteractions && inBoxExcerpt && <div className="mt-2">{gate(inBoxExcerpt)}</div>}
        </div>
      </div>

      {!showInteractions && fullExcerpt && gate(fullExcerpt)}

      {showInteractions && event.postId && (
        <PostSummary
          postId={event.postId}
          reactionCount={event.reactionCount}
          commentCount={event.commentCount}
        />
      )}
      {deleteError && <PostDeleteError />}
    </article>
  );
}

// Extracto de la reseña dentro de la caja (R2): 4 líneas como mucho. «Seguir
// leyendo» sale si el recorte visual esconde algo o si el servidor ya lo cortó
// (`excerpt()` termina en «…»). El recorte se mide en el navegador con un
// ResizeObserver, que además avisa en su primera observación; sin él (SSR,
// jsdom) solo cuenta el «…».
function ClampedExcerpt({
  text,
  knownUsernames,
  postHref,
}: {
  text: string;
  knownUsernames: string[];
  postHref: string | null;
}) {
  const t = useTranslations("feed");
  const ref = useRef<HTMLParagraphElement>(null);
  const [clamped, setClamped] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setClamped(el.scrollHeight > el.clientHeight + 1));
    observer.observe(el);
    return () => observer.disconnect();
  }, [text]);
  const truncated = clamped || text.endsWith("…");
  return (
    <>
      {/* `whitespace-pre-line`: los saltos de línea son del autor (textarea). */}
      <p
        ref={ref}
        className="line-clamp-4 font-serif text-[13.5px] leading-normal whitespace-pre-line break-words text-foreground"
      >
        <MentionText text={text} knownUsernames={knownUsernames} />
      </p>
      {truncated && postHref && (
        <Link href={postHref} className="mt-1 inline-block text-[11.5px] font-medium text-accent hover:underline">
          {t("review.readMore")}
        </Link>
      )}
    </>
  );
}
