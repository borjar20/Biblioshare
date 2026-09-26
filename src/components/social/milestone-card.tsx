"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { FeedEvent, MilestoneViewerContext } from "@/lib/social/feed";
import type { ItemType } from "@/lib/catalog/types";
import { TimeAgo } from "@/components/ui/time-ago";
import { RatingDots } from "@/components/ui/rating-dots";
import { CommentIcon, HeartIcon } from "@/components/ui/icons";
import { UserAvatar } from "@/components/social/user-avatar";
import { QuickAddButton } from "@/components/library/quick-add-button";
import { SpineCover } from "./spine-cover";
import { itemHref } from "@/lib/catalog/item-href";
import { PostDeleteError, PostDeleteMenu, useDeletePost } from "./post-delete-menu";

// Tarjeta de HITO (post kind = started | dropped): «actor empezó / abandonó una
// obra». Sin nota ni reseña —esos son atributos del post `finished`—. Un post
// `started` NO debe pintarse como «Finalizado» (por eso no reutiliza ReviewCard).
//
// Rediseño del feed (propuestas 1 y 4): el hito dice UNA frase, así que es una
// fila compacta —avatar, frase, datos de la obra y miniatura— y no una tarjeta
// grande con la caja interior vacía. Debajo, el contexto de quien mira (su pase
// de la obra, los seguidos que también la llevan y «Añadir» si no la tiene),
// que es lo que da al hito una razón para pararse en él.
export function MilestoneCard({
  event,
  hideActor = false,
  showInteractions = true,
}: {
  event: FeedEvent;
  viewerLoggedIn: boolean;
  hideActor?: boolean;
  /** Usernames @mencionados que existen de verdad (comentarios del hilo). */
  knownUsernames: string[];
  /** `false` en la cabecera de /post/[id]: el hilo lo pinta PostThread aparte. */
  showInteractions?: boolean;
}) {
  const t = useTranslations("feed");
  const tSocial = useTranslations("social");
  const actorName = event.actorDisplayName || event.actorUsername;
  const { deleted, error: deleteError, pending, requestDelete } = useDeletePost(event.postId);
  if (deleted) return null;
  const deleteMenu = event.viewerCanDelete && event.postId && (
    <PostDeleteMenu onDelete={requestDelete} pending={pending} />
  );
  const href = itemHref(event.itemType, event.itemId);
  const facts = [
    t("workType", { itemType: event.itemType }),
    event.itemSubtitle,
    event.itemYear != null ? String(event.itemYear) : null,
    event.itemSeasons != null ? t("milestone.seasons", { count: event.itemSeasons }) : null,
  ].filter(Boolean);

  // Sin ceros ni «Ver hilo» (propuesta 2): un icono que lleva a /post/[id] y,
  // si hay actividad, los contadores.
  const threadLink = showInteractions && event.postId && (
    <Link
      href={`/post/${event.postId}`}
      aria-label={
        event.commentCount > 0
          ? tSocial("commentsCount", { count: event.commentCount })
          : tSocial("postComment")
      }
      className="flex shrink-0 items-center gap-2.5 px-1 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
    >
      {event.reactionCount > 0 && (
        <span className="flex items-center gap-1 text-accent">
          <HeartIcon className="h-3.5 w-3.5" />
          {event.reactionCount}
        </span>
      )}
      <span className="flex items-center gap-1">
        <CommentIcon className="h-4 w-4" />
        {event.commentCount > 0 && event.commentCount}
      </span>
    </Link>
  );

  return (
    <article className="flex flex-col gap-2 rounded-card border border-border bg-surface px-3 py-2.5">
      <div className="flex items-center gap-2.5">
        {!hideActor && <UserAvatar name={actorName} avatarUrl={event.actorAvatarUrl} size={30} />}
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] leading-snug text-foreground">
            {!hideActor && (
              <>
                <Link href={`/u/${event.actorUsername}`} className="font-semibold hover:underline">
                  {actorName}
                </Link>{" "}
              </>
            )}
            <span className={`text-muted-foreground${hideActor ? " inline-block first-letter:uppercase" : ""}`}>
              {t(`verbs.${event.verb}`)}
            </span>{" "}
            <Link href={href} className="font-serif font-semibold hover:underline">
              {event.itemTitle}
            </Link>
          </p>
          <p className="mt-0.5 truncate font-mono text-[10.5px] text-muted-foreground">
            {facts.join(" · ")}
            {facts.length > 0 && " · "}
            <TimeAgo iso={event.eventDate} />
          </p>
        </div>
        <Link href={href} className="w-[34px] shrink-0" tabIndex={-1} aria-hidden>
          <SpineCover coverUrl={event.itemCoverUrl} title={event.itemTitle} sizes="34px" className="aspect-[2/3] w-[34px]" />
        </Link>
        {threadLink}
        {deleteMenu}
      </div>

      {event.viewerContext && (
        <MilestoneContextRow
          context={event.viewerContext}
          itemType={event.itemType}
          itemId={event.itemId}
          indent={!hideActor}
        />
      )}
      {deleteError && <PostDeleteError />}
    </article>
  );
}

function MilestoneContextRow({
  context,
  itemType,
  itemId,
  indent,
}: {
  context: MilestoneViewerContext;
  itemType: ItemType;
  itemId: string;
  indent: boolean;
}) {
  const t = useTranslations("feed");
  const { viewerPass, friends, friendsTotal, friendsStatus, ownPost } = context;
  const hasFriends = friends.length > 0;
  const offerAdd = !ownPost && viewerPass === null;
  if (!hasFriends && !viewerPass && !offerAdd) return null;

  const hidden = friendsTotal - friends.length;
  const names = new Intl.ListFormat("es", { style: "long", type: "conjunction" }).format([
    ...friends.map((f) => f.displayName || f.username),
    ...(hidden > 0 ? [t("milestone.andMore", { count: hidden })] : []),
  ]);

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 ${indent ? "pl-10" : ""}`}>
      {hasFriends && (
        <span className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-foreground-soft">
          <span className="flex shrink-0 -space-x-1.5">
            {friends.map((f) => (
              <span key={f.userId} className="rounded-full ring-2 ring-surface">
                <UserAvatar name={f.displayName || f.username} avatarUrl={f.avatarUrl} size={18} />
              </span>
            ))}
          </span>
          <span className="min-w-0">
            {t("milestone.friends", { names, count: friendsTotal, status: friendsStatus, itemType })}
          </span>
        </span>
      )}
      {viewerPass && (
        <span className="flex items-center gap-1.5 font-mono text-[10.5px] text-muted-foreground">
          {t("milestone.you", { status: viewerPass.status, itemType })}
          {viewerPass.status === "completed" && viewerPass.rating != null && (
            <RatingDots value={viewerPass.rating} itemType={itemType} size="sm" />
          )}
        </span>
      )}
      {offerAdd && (
        <span className="ml-auto">
          <QuickAddButton itemType={itemType} itemId={itemId} />
        </span>
      )}
    </div>
  );
}
