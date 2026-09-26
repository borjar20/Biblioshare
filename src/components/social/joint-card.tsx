"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { FeedEvent, JointCardMember } from "@/lib/social/feed";
import { TimeAgo } from "@/components/ui/time-ago";
import { UserAvatar } from "@/components/social/user-avatar";
import { RatingDots } from "@/components/ui/rating-dots";
import { PostSummary } from "@/components/social/post-summary";
import { MentionText } from "@/components/social/mention-text";
import { SpoilerGate } from "@/components/social/spoiler-gate";
import { SpineCover } from "./spine-cover";
import { itemHref } from "@/lib/catalog/item-href";
import { formatDots, groupRating } from "@/lib/rating/dots";
import { PostDeleteError, PostDeleteMenu, useDeletePost } from "./post-delete-menu";

// Tarjeta de VISIONADO CONJUNTO (post kind = joint, #1220): «Ana, Luis y 1 más
// vieron X juntos», la obra, y una fila por persona con SU nota y SU reseña. Los
// miembros que quien mira no puede ver no se nombran: solo cuentan («y N más»).
// La cabecera no es el autor del post (quien creó el visionado) sino el grupo:
// el hecho es de todos.
//
// Rediseño del feed (J1–J3): «juntos» se dice una vez, en la frase de la
// cabecera (sin chip ni estado verde en la caja); la caja lleva los datos de la
// obra y la media del grupo; y cada persona sale UNA vez, con su avatar en su
// fila (la cabecera es solo texto) y sin divisorias entre filas.
export function JointCard({
  event,
  knownUsernames,
  showInteractions = true,
}: {
  event: FeedEvent;
  viewerLoggedIn: boolean;
  hideActor?: boolean;
  knownUsernames: string[];
  /** `false` en la cabecera de /post/[id]: el hilo lo pinta PostThread aparte. */
  showInteractions?: boolean;
}) {
  const t = useTranslations("feed");
  const { deleted, error: deleteError, pending, requestDelete } = useDeletePost(event.postId);
  const joint = event.joint;
  if (deleted || !joint) return null;
  const deleteMenu = event.viewerCanDelete && event.postId && (
    <PostDeleteMenu onDelete={requestDelete} pending={pending} />
  );

  const parts = joint.members.map((m) => m.displayName || m.username);
  if (joint.hiddenCount > 0) parts.push(t("joint.andMore", { count: joint.hiddenCount }));
  const names = new Intl.ListFormat("es", { style: "long", type: "conjunction" }).format(parts);
  // Media de los miembros que quien mira puede ver: de los ocultos no sabe ni
  // la nota.
  const average = groupRating(joint.members.map((m) => m.rating));
  const facts = [
    t("workType", { itemType: event.itemType }),
    event.itemSubtitle,
    event.itemType !== "book" && event.itemYear != null ? String(event.itemYear) : null,
  ].filter(Boolean);

  return (
    <article className="flex flex-col gap-3 rounded-card border border-border bg-surface shadow-card p-4">
      <div className="flex items-center gap-2.5">
        <p className="min-w-0 flex-1 text-sm text-foreground">
          {t("joint.header", { names, itemType: event.itemType })}
        </p>
        <TimeAgo iso={event.eventDate} className="shrink-0 font-mono text-[10px] text-muted-foreground" />
        {deleteMenu}
      </div>

      <div className="flex gap-3 rounded-lg border border-border bg-surface-muted p-3">
        <Link href={itemHref(event.itemType, event.itemId)} className="w-[58px] shrink-0">
          <SpineCover coverUrl={event.itemCoverUrl} title={event.itemTitle} className="aspect-[2/3] w-[58px]" />
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            href={itemHref(event.itemType, event.itemId)}
            className="block font-serif text-[15px] leading-tight font-semibold hover:underline"
          >
            {event.itemTitle}
          </Link>
          <p className="mt-1.5 font-mono text-[10px] text-muted-foreground">{facts.join(" · ")}</p>
          {average != null && (
            <p className="mt-2.5 flex items-center gap-2 font-mono text-[10.5px] text-muted-foreground">
              {t("joint.groupAverage")}
              <RatingDots value={average} size="sm" itemType={event.itemType} />
              <span className="text-foreground">{formatDots(average)}</span>
            </p>
          )}
        </div>
      </div>

      <ul className="flex flex-col gap-3">
        {joint.members.map((m) => (
          <JointMemberRow key={m.userId} member={m} itemType={event.itemType} knownUsernames={knownUsernames} />
        ))}
      </ul>

      {showInteractions && event.postId && (
        <PostSummary postId={event.postId} reactionCount={event.reactionCount} commentCount={event.commentCount} />
      )}
      {deleteError && <PostDeleteError />}
    </article>
  );
}

function JointMemberRow({
  member,
  itemType,
  knownUsernames,
}: {
  member: JointCardMember;
  itemType: FeedEvent["itemType"];
  knownUsernames: string[];
}) {
  const t = useTranslations("feed");
  const name = member.displayName || member.username;
  const excerpt = member.reviewExcerpt && (
    <p className="pl-[30px] font-serif text-[13.5px] leading-normal whitespace-pre-line break-words">
      <MentionText text={member.reviewExcerpt} knownUsernames={knownUsernames} />
    </p>
  );
  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <UserAvatar name={name} avatarUrl={member.avatarUrl} size={22} />
        <Link href={`/u/${member.username}`} className="min-w-0 flex-1 truncate text-[13px] font-semibold hover:underline">
          {name}
        </Link>
        {member.rating != null ? (
          <RatingDots value={member.rating} size="sm" itemType={itemType} />
        ) : (
          <span className="font-mono text-[10px] text-muted-foreground">{t("joint.noRating")}</span>
        )}
      </div>
      {member.reviewExcerpt && (member.reviewIsSpoiler ? <SpoilerGate>{excerpt}</SpoilerGate> : excerpt)}
    </li>
  );
}
