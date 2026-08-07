"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { FeedEvent } from "@/lib/social/feed";
import { TimeAgo } from "@/components/ui/time-ago";
import { UserAvatar } from "@/components/social/user-avatar";
import { ReviewInteractions } from "@/components/social/review-interactions";
import { RichTextView } from "@/components/social/rich-text-view";
import { SpoilerGate } from "./spoiler-gate";
import { anchorHref } from "@/lib/catalog/anchor";

// Tarjeta de «Pensamiento» (Fase 5, Task 5.3): cabecera + píldora dorada,
// chip del ancla (obra/saga/persona), cuerpo markdown-lite con blur de
// spoiler (reutiliza SpoilerGate, mismo patrón que las notas públicas de
// progress-timeline-card) y el hilo estándar de ReviewInteractions.
// `event.thought` SIEMPRE viene relleno para verb:"thought" (lo garantiza
// getFeed) — el caller (feed-item.tsx) ya lo comprueba antes de renderizar,
// pero el tipo de FeedEvent lo deja nullable, así que aquí también se guarda.
export function ThoughtCard({
  event,
  viewerLoggedIn,
  hideActor = false,
  knownUsernames,
}: {
  event: FeedEvent;
  viewerLoggedIn: boolean;
  hideActor?: boolean;
  /** Usernames @mencionados que existen de verdad (cuerpo + comentarios). */
  knownUsernames: string[];
}) {
  const t = useTranslations("feed");
  const { thought } = event;
  if (!thought) return null;
  const actorName = event.actorDisplayName || event.actorUsername;

  const bodyEl = <RichTextView text={thought.body} knownUsernames={knownUsernames} />;

  return (
    <article className="flex flex-col gap-3 rounded-card border border-border bg-surface shadow-card p-4">
      {!hideActor && (
        <div className="flex items-center gap-2.5">
          <UserAvatar name={actorName} avatarUrl={event.actorAvatarUrl} size={30} />
          <p className="min-w-0 flex-1 text-sm text-foreground">
            <Link href={`/u/${event.actorUsername}`} className="font-semibold hover:underline">{actorName}</Link>{" "}
            <span className="text-muted-foreground">{t("thoughtShared")}</span>
          </p>
          <span className="self-start rounded-full border border-gold/35 bg-gold/15 px-2.5 py-0.5 font-mono text-[10.5px] tracking-wider text-gold-ink uppercase">
            {t("kind.thought")}
          </span>
        </div>
      )}

      <Link
        href={anchorHref(thought.anchor.type, thought.anchor.id)}
        className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-muted p-2.5 hover:border-accent"
      >
        <div className="relative h-11 w-8 shrink-0 overflow-hidden rounded bg-surface">
          {thought.anchor.imageUrl && (
            <Image src={thought.anchor.imageUrl} alt="" fill sizes="32px" className="object-cover" />
          )}
        </div>
        <span className="min-w-0 flex-1 truncate font-serif text-[14px] font-semibold text-foreground">
          {thought.anchor.title}
        </span>
      </Link>

      <div className="font-serif text-[14px] leading-relaxed text-foreground">
        {thought.isSpoiler ? <SpoilerGate>{bodyEl}</SpoilerGate> : bodyEl}
      </div>

      {event.interactionTarget?.interactionTargetId && (
        <ReviewInteractions
          interactionTargetId={event.interactionTarget.interactionTargetId}
          reactionCount={event.reactionCount}
          viewerReacted={event.viewerReacted}
          commentCount={event.commentCount}
          comments={event.comments}
          reactions={event.reactions}
          viewerLoggedIn={viewerLoggedIn}
          knownUsernames={knownUsernames}
        />
      )}
      <TimeAgo iso={event.eventDate} className="self-end font-mono text-[10px] text-muted-foreground" />
    </article>
  );
}
