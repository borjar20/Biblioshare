"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { FeedEpisode, FeedEvent } from "@/lib/social/feed";
import { RatingDots } from "@/components/ui/rating-dots";
import { MentionText } from "@/components/social/mention-text";
import { SpoilerGate } from "@/components/social/spoiler-gate";
import { FeedCardShell } from "./feed-card/feed-card-shell";
import { FeedWorkRow } from "./feed-card/feed-work-row";
import { FeedMiniList } from "./feed-card/feed-mini-list";

// Tarjeta de valoración/reseña (finished/watched y los legados rated/reviewed/
// watchedEpisode) con el patrón C (spec 2026-10-05-feed-patron-c): lo que se
// valoró es el título y la nota va a la derecha.
//
// Dos rutas que el verbo nombra sin ambigüedad:
// - OBRA (libro, peli o la serie entera): «terminó», «terminó y valoró»,
//   «valoró la serie», «reseñó»…
// - EPISODIOS (post diario `watched`): «valoró/vio N episodios». Con uno solo,
//   el episodio es el título («S2E3 · 1893», «de Loki»); con varios, la serie
//   es el título y debajo cada episodio con SU nota. Antes el post llevaba
//   solo la nota del primero junto a «+3 episodios» y parecía la de todos.
//
// La reseña: en el feed, bajo la fila, recortada a 4 líneas con «Seguir
// leyendo»; en la cabecera de /post/[id] (`showInteractions=false`), entera.
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
  const workType = t("workType", { itemType: event.itemType });

  let verb: string;
  let row: React.ReactNode;
  if (event.episode) {
    // Las previews legadas (shared-activity) no traen `episodes`: un episodio.
    const eps: FeedEpisode[] = event.episodes?.length ? event.episodes : [{ ...event.episode, rating: event.rating }];
    verb = t("card.episodes", { rated: eps.some((e) => e.rating != null) ? "yes" : "no", count: eps.length });
    if (eps.length === 1) {
      const [only] = eps;
      row = (
        <FeedWorkRow
          itemType={event.itemType}
          itemId={event.itemId}
          coverUrl={event.itemCoverUrl}
          title={[episodeCode(only), only.title].filter(Boolean).join(" · ")}
          facts={t("card.episodeOf", { title: event.itemTitle })}
          trailing={only.rating != null ? <RatingDots value={only.rating} size="lg" itemType={event.itemType} /> : null}
        />
      );
    } else {
      row = (
        <FeedWorkRow
          itemType={event.itemType}
          itemId={event.itemId}
          coverUrl={event.itemCoverUrl}
          title={event.itemTitle}
          facts={workType}
        >
          <FeedMiniList
            rows={eps.map((e) => ({
              key: episodeCode(e),
              label: episodeCode(e),
              text: e.title ?? "",
              value:
                e.rating != null ? (
                  <RatingDots value={e.rating} size="sm" itemType={event.itemType} />
                ) : (
                  <span role="img" aria-label={t("card.noRating")} className="font-mono text-[10.5px] text-muted-foreground">—</span>
                ),
            }))}
          />
        </FeedWorkRow>
      );
    }
  } else {
    const v = event.verb === "rated" || event.verb === "reviewed" ? event.verb : "finished";
    verb = event.verb === "watchedEpisode" ? t("verbs.watchedEpisode") : t(`card.${v}`, { itemType: event.itemType });
    const facts = [
      workType,
      event.itemSubtitle,
      event.itemType !== "book" && event.itemYear != null ? String(event.itemYear) : null,
      event.reviewMeta?.readingDays != null ? t("review.metaDays", { count: event.reviewMeta.readingDays }) : null,
      event.reviewMeta?.totalPages != null ? t("review.metaPages", { count: event.reviewMeta.totalPages }) : null,
    ].filter(Boolean).join(" · ");
    row = (
      <FeedWorkRow
        itemType={event.itemType}
        itemId={event.itemId}
        coverUrl={event.itemCoverUrl}
        title={event.itemTitle}
        facts={facts}
        trailing={event.rating != null ? <RatingDots value={event.rating} size="lg" itemType={event.itemType} /> : null}
      />
    );
  }

  const gate = (node: React.ReactNode) => (event.reviewIsSpoiler ? <SpoilerGate>{node}</SpoilerGate> : node);
  // `whitespace-pre-line`: los saltos de línea de la reseña son del autor.
  const excerpt =
    event.reviewExcerpt &&
    (showInteractions ? (
      <div>
        {gate(
          <ClampedExcerpt
            text={event.reviewExcerpt}
            knownUsernames={knownUsernames}
            postHref={event.postId ? `/post/${event.postId}` : null}
          />,
        )}
      </div>
    ) : (
      gate(
        <p className="border-l-2 border-accent pl-3.5 font-serif text-[14px] leading-relaxed whitespace-pre-line break-words">
          <MentionText text={event.reviewExcerpt} knownUsernames={knownUsernames} />
        </p>,
      )
    ));

  return (
    <FeedCardShell
      actor={{ username: event.actorUsername, displayName: event.actorDisplayName, avatarUrl: event.actorAvatarUrl }}
      verb={verb}
      eventDate={event.eventDate}
      postId={event.postId}
      reactionCount={event.reactionCount}
      commentCount={event.commentCount}
      viewerCanDelete={event.viewerCanDelete}
      hideActor={hideActor}
      showInteractions={showInteractions}
    >
      {row}
      {excerpt}
    </FeedCardShell>
  );
}

function episodeCode(e: { season: number; episode: number }): string {
  return `S${e.season}E${e.episode}`;
}

// Extracto de la reseña en el feed (R2): 4 líneas como mucho. «Seguir leyendo»
// sale si el recorte visual esconde algo o si el servidor ya lo cortó
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
