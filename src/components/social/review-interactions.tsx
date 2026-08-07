"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { loginHref } from "@/lib/auth/safe-next";
import { HeartIcon, CommentIcon } from "@/components/ui/icons";
import {
  toggleReaction,
  addComment,
  deleteComment,
} from "@/lib/social/interaction-actions";
import {
  emptyReactions,
  type InteractionComment,
  type ReactionsByKind,
} from "@/lib/social/interactions";
import { useOptimisticAction } from "@/lib/reactivity/use-optimistic-action";
import { interactionReducer } from "@/lib/social/interaction-optimistic";
import { useMentionAutocomplete } from "./use-mention-autocomplete";
import { MentionText } from "./mention-text";
import { UserAvatar } from "./user-avatar";
import { CommentActions } from "./comment-actions";
import { ReactionBar } from "./reaction-bar";

// Like + hilo de comentarios bajo una reseña (EPIC-05, Bloque B, SD-3). El
// estado real deriva de las props que el servidor revalida tras cada acción
// (revalidatePath); encima, useOptimisticAction pinta like/comentario al
// instante y revierte en error. Los comentarios vienen prefetcheados (capados)
// desde el servidor — expandir no dispara fetch, solo muestra/oculta.
export function ReviewInteractions({
  interactionTargetId,
  reactionCount,
  viewerReacted,
  commentCount,
  comments,
  reactions,
  viewerLoggedIn,
  showTargetReaction = true,
  clubId,
  knownUsernames = [],
}: {
  interactionTargetId: string;
  reactionCount: number;
  viewerReacted: boolean;
  commentCount: number;
  comments: InteractionComment[];
  // Paleta de reacciones (♡/📖/😱/🔥) del target. reactionCount/viewerReacted
  // arriba se CONSERVAN como derivados -- el estado no-logueado los sigue
  // usando para el total, sin desglosar por emoji.
  reactions: ReactionsByKind;
  viewerLoggedIn: boolean;
  // false para targets sin sentido de "me gusta" propio (p.ej. un checkpoint
  // de buddy_read, EPIC-05 Bloque H1) -- el like en comentarios individuales
  // no se ve afectado, es un target distinto ("comment").
  showTargetReaction?: boolean;
  // Scope de @menciones del comentario: si el target vive dentro de un post
  // de club, el caller pasa el clubId para acotar el autocompletar a los
  // miembros del club; si se omite, el scope cae a "profile" (grafo social).
  clubId?: string;
  // Usernames @mencionados en `comments` que existen de verdad (resueltos
  // por el server parent con resolveKnownMentions) — linkifica el cuerpo de
  // cada comentario. Opcional: los callers que aún no la resuelven (fuera
  // del alcance de la Tarea 7) simplemente no linkifican, sin romper nada.
  knownUsernames?: string[];
}) {
  const t = useTranslations("social");
  const { state, isPending, failed, run } = useOptimisticAction({
    state: { interactionTargetId, reactionCount, viewerReacted, commentCount, comments, reactions },
    reducer: interactionReducer,
  });
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState("");
  const mention = useMentionAutocomplete({
    value: draft,
    onChange: setDraft,
    scope: clubId ? { scope: "club", clubId } : { scope: "profile" },
  });
  const pathname = usePathname();

  if (!viewerLoggedIn) {
    return (
      <div className="flex items-center gap-4 border-t border-border pt-[11px] text-[11.5px] text-muted-foreground">
        {showTargetReaction && (
          <span className="flex items-center gap-1.5">
            <HeartIcon className="h-4 w-4" /> {state.reactionCount}
          </span>
        )}
        <Link
          href={loginHref(pathname)}
          className="flex items-center gap-1.5 hover:text-foreground"
        >
          <CommentIcon className="h-4 w-4" />
          {t("commentsCount", { count: state.commentCount })}
        </Link>
      </div>
    );
  }

  function submitComment() {
    const value = draft.trim();
    if (!value) return;
    setDraft("");
    // Comentario optimista: muestra "Tú" hasta que la revalidación trae el real
    // (con id y autor de verdad) y useOptimistic lo sustituye al asentarse.
    const optimistic: InteractionComment = {
      id: `optimistic-${Date.now()}`,
      interactionTargetId: "optimistic-comment-target",
      authorId: "",
      author: t("you"),
      authorUsername: null,
      authorAvatarUrl: null,
      initials: "",
      body: value,
      createdAt: new Date().toISOString(),
      isOwn: true,
      canDelete: true,
      reactionCount: 0,
      viewerReacted: false,
      reactions: emptyReactions(),
    };
    run({ type: "addComment", comment: optimistic }, () =>
      addComment(interactionTargetId, value),
    );
  }

  return (
    // .frx del frame A: separador arriba, 11.5px y gap de 16px.
    <div className="flex flex-col gap-3 border-t border-border pt-[11px]">
      <div className="flex items-center gap-4 text-[11.5px]">
        {showTargetReaction && (
          <ReactionBar
            reactions={state.reactions}
            disabled={isPending}
            onToggle={(kind) =>
              run({ type: "toggleTarget", kind }, () =>
                toggleReaction(interactionTargetId, kind),
              )
            }
          />
        )}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <CommentIcon className="h-4 w-4" />
          {t("commentsCount", { count: state.commentCount })}
        </button>
      </div>

      {expanded && (
        <div className="flex flex-col gap-2">
          {state.comments.map((c) => (
            <div
              key={c.id}
              className="flex items-start gap-2 text-xs"
            >
              <UserAvatar name={c.author} avatarUrl={c.authorAvatarUrl} size={24} />
              <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                <p className="min-w-0 text-foreground">
                  {c.authorUsername ? (
                    <Link href={`/u/${c.authorUsername}`} className="font-medium hover:underline">
                      {c.author}
                    </Link>
                  ) : (
                    <span className="font-medium">{c.author}</span>
                  )}{" "}
                  <span className="text-muted-foreground">
                    <MentionText text={c.body} knownUsernames={knownUsernames} />
                  </span>
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  <ReactionBar
                    reactions={c.reactions}
                    disabled={isPending}
                    onToggle={(kind) =>
                      run({ type: "toggleComment", id: c.id, kind }, () =>
                        toggleReaction(c.interactionTargetId, kind),
                      )
                    }
                  />
                  <CommentActions
                    commentId={c.id}
                    canDelete={c.canDelete}
                    isOwn={c.isOwn}
                    isBusy={isPending}
                    onDelete={() =>
                      run({ type: "deleteComment", id: c.id }, () => deleteComment(c.id))
                    }
                  />
                </div>
              </div>
            </div>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitComment();
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <textarea
                value={draft}
                maxLength={2000}
                rows={2}
                onChange={(e) => setDraft(e.target.value)}
                onInput={mention.onInput}
                onKeyDown={mention.onKeyDown}
                placeholder={t("writeComment")}
                className="w-full resize-none rounded-xl border border-border bg-surface px-3 py-2 pr-12 text-xs outline-none focus:border-accent"
              />
              <span className="pointer-events-none absolute right-2 bottom-1.5 font-mono text-[9px] text-muted-foreground">
                {draft.length}/2000
              </span>
              {mention.dropdown}
            </div>
            <button
              type="submit"
              disabled={isPending || !draft.trim()}
              className="text-xs font-medium text-accent disabled:opacity-50"
            >
              {t("postComment")}
            </button>
          </form>
        </div>
      )}
      {failed && (
        <p role="alert" className="text-xs text-status-dropped">
          {t("actionError")}
        </p>
      )}
    </div>
  );
}
