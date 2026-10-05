"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { TimeAgo } from "@/components/ui/time-ago";
import { CommentIcon, HeartIcon } from "@/components/ui/icons";
import { UserAvatar } from "@/components/social/user-avatar";
import { PostDeleteError, PostDeleteMenu, useDeletePost } from "../post-delete-menu";

// Armazón del patrón C (spec 2026-10-05-feed-patron-c): cabecera fina en una
// línea —avatar 22 px · quién · verbo · hora · icono de comentarios · menú— y
// debajo el cuerpo de cada tarjeta. Sin caja interior ni fila de pie: el icono
// de la cabecera ES el enlace al hilo (/post/[id]), como en el hito.
//
// `hideActor` (Actividad del perfil): sin avatar ni nombre; el verbo arranca en
// mayúscula. `showInteractions=false` (cabecera de /post/[id]): sin icono, el
// hilo va debajo de la página.
export type FeedCardActor = { username: string; displayName: string | null; avatarUrl: string | null };

export function FeedCardShell({
  actor,
  verb,
  eventDate,
  postId,
  reactionCount,
  commentCount,
  viewerCanDelete,
  hideActor = false,
  showInteractions = true,
  children,
}: {
  actor: FeedCardActor;
  verb: ReactNode;
  eventDate: string;
  postId: string | null | undefined;
  reactionCount: number;
  commentCount: number;
  viewerCanDelete: boolean | undefined;
  hideActor?: boolean;
  showInteractions?: boolean;
  children: ReactNode;
}) {
  const { deleted, error, pending, requestDelete } = useDeletePost(postId);
  if (deleted) return null;
  const name = actor.displayName || actor.username;

  return (
    <article className="flex flex-col gap-2 rounded-card border border-border bg-surface px-3 py-2.5 shadow-card">
      <div className="flex items-center gap-2">
        {!hideActor && <UserAvatar name={name} avatarUrl={actor.avatarUrl} size={22} />}
        <p className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">
          {!hideActor && (
            <>
              <Link href={`/u/${actor.username}`} className="font-semibold hover:underline">
                {name}
              </Link>{" "}
            </>
          )}
          <span className={`text-muted-foreground${hideActor ? " inline-block first-letter:uppercase" : ""}`}>
            {verb}
          </span>
        </p>
        <TimeAgo iso={eventDate} className="shrink-0 font-mono text-[10px] text-muted-foreground" />
        {showInteractions && postId && (
          <FeedThreadLink postId={postId} reactionCount={reactionCount} commentCount={commentCount} />
        )}
        {viewerCanDelete && postId && <PostDeleteMenu onDelete={requestDelete} pending={pending} />}
      </div>
      {children}
      {error && <PostDeleteError />}
    </article>
  );
}

// Sin ceros ni «Ver hilo» (#1227, propuesta 2): un icono que lleva a
// /post/[id] y, si hay actividad, los contadores.
function FeedThreadLink({
  postId,
  reactionCount,
  commentCount,
}: {
  postId: string;
  reactionCount: number;
  commentCount: number;
}) {
  const t = useTranslations("social");
  return (
    <Link
      href={`/post/${postId}`}
      aria-label={commentCount > 0 ? t("commentsCount", { count: commentCount }) : t("postComment")}
      className="flex shrink-0 items-center gap-2.5 px-1 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
    >
      {reactionCount > 0 && (
        <span className="flex items-center gap-1 text-accent">
          <HeartIcon className="h-3.5 w-3.5" />
          {reactionCount}
        </span>
      )}
      <span className="flex items-center gap-1">
        <CommentIcon className="h-4 w-4" />
        {commentCount > 0 && commentCount}
      </span>
    </Link>
  );
}
