"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { PersonGroupEntry } from "@/lib/social/group-feed-entries";
import { TimeAgo } from "@/components/ui/time-ago";
import { UserAvatar } from "@/components/social/user-avatar";
import { RatingDots } from "@/components/ui/rating-dots";
import { ReviewInteractions } from "@/components/social/review-interactions";
import { MentionText } from "@/components/social/mention-text";
import { SpineCover } from "./spine-cover";
import { itemHref } from "@/lib/catalog/item-href";
import { splitCollapsedItems } from "./feed-collapse";

// Valoraciones de varios episodios de una MISMA serie, agrupadas con el mismo
// patrón que "añadió" / "avanzó". Cada episodio conserva lo suyo: su estado
// (VISTO, el «tweak de estado por episodio» de la maqueta — no un "Finalizado"
// de la serie entera, que sería falso valorando episodios sueltos), su nota y
// su propia fila de reacción (spec D1/D2: cada target vive en su fila real). Un
// solo episodio NO llega aquí — sale como ReviewCard suelta (ver
// group-feed-entries + feed-item).
export function EpisodeRatingsCard({
  entry,
  viewerLoggedIn,
  knownUsernames,
  hideActor = false,
}: {
  entry: PersonGroupEntry; // verb rated/reviewed/watchedEpisode, items = episodios desc
  viewerLoggedIn: boolean;
  /** Usernames @mencionados que existen de verdad (extractos + comentarios). */
  knownUsernames: string[];
  /** Oculta avatar+nombre y capitaliza el verbo (Actividad del perfil, #302). */
  hideActor?: boolean;
}) {
  const t = useTranslations("feed");
  const actorName = entry.actor.displayName || entry.actor.username;
  const series = entry.items[0];
  // Grupos largos se colapsan a los 2 episodios más recientes; el resto queda
  // tras "ver N episodios más" (mismo umbral que el timeline de progreso).
  const [expanded, setExpanded] = useState(false);
  const { visible, hiddenCount, collapsible } = splitCollapsedItems(entry.items, expanded);

  return (
    <article className="flex flex-col gap-3 rounded-card border border-border bg-surface shadow-card p-4">
      <div className="flex items-center gap-2.5">
        {!hideActor && <UserAvatar name={actorName} avatarUrl={entry.actor.avatarUrl} size={30} />}
        <p className="min-w-0 flex-1 text-sm leading-snug text-foreground">
          {!hideActor && (
            <>
              <Link href={`/u/${entry.actor.username}`} className="font-semibold hover:underline">{actorName}</Link>{" "}
            </>
          )}
          <span className={`text-muted-foreground${hideActor ? " first-letter:uppercase" : ""}`}>{t("grouped.ratedEpisodes", { count: entry.items.length })}</span>{" "}
          <Link href={itemHref("series", series.itemId)} className="font-serif font-semibold hover:underline">{series.itemTitle}</Link>
        </p>
        <span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.07em] uppercase text-muted-foreground">
          {t("kind.reviews")}
        </span>
      </div>

      <Link href={itemHref("series", series.itemId)} className="w-[38px] shrink-0">
        <SpineCover coverUrl={series.itemCoverUrl} title={series.itemTitle} className="aspect-[2/3] w-[38px]" />
      </Link>

      <div className="flex flex-col divide-y divide-border border-t border-border">
        {visible.map((ep) => (
          <div key={ep.id} className="flex gap-3 py-3 first:pt-3">
            <span className="w-[38px] shrink-0 pt-0.5 font-mono text-[11px] font-semibold text-muted-foreground">
              {ep.episode ? `S${ep.episode.season}E${ep.episode.episode}` : ""}
            </span>
            <div className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 font-mono text-[9px] tracking-[0.06em] uppercase text-foreground-faint">
                <span className="h-1 w-1 rounded-full bg-foreground-faint" />{t("episode.watched")}
              </span>
              {ep.rating != null && (
                <div className="mt-1">
                  <RatingDots value={ep.rating} size="sm" />
                </div>
              )}
              {ep.reviewExcerpt && (
                <p className="mt-1.5 border-l-2 border-accent pl-3 font-serif text-[13px] leading-relaxed">
                  <MentionText text={ep.reviewExcerpt} knownUsernames={knownUsernames} />
                </p>
              )}
              {ep.interactionTarget?.interactionTargetId && (
                <div className="mt-1.5">
                  <ReviewInteractions
                    interactionTargetId={ep.interactionTarget.interactionTargetId}
                    reactionCount={ep.reactionCount}
                    viewerReacted={ep.viewerReacted}
                    commentCount={ep.commentCount}
                    comments={ep.comments}
                    reactions={ep.reactions}
                    viewerLoggedIn={viewerLoggedIn}
                    knownUsernames={knownUsernames}
                  />
                </div>
              )}
              <TimeAgo iso={ep.eventDate} className="mt-1 block font-mono text-[9.5px] text-foreground-faint" />
            </div>
          </div>
        ))}

        {collapsible && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="py-2 text-left text-[12px] font-medium text-accent hover:underline"
          >
            {expanded ? t("progress.showLess") : t("episode.showMore", { count: hiddenCount })}
          </button>
        )}
      </div>
    </article>
  );
}
