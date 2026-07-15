"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { HeartIcon, CommentIcon } from "@/components/ui/icons";
import {
  toggleReaction,
  addComment,
  deleteComment,
} from "@/lib/social/interaction-actions";
import type {
  InteractionComment,
  TargetType,
} from "@/lib/social/interactions";
import { useOptimisticAction } from "@/lib/reactivity/use-optimistic-action";
import { interactionReducer } from "@/lib/social/interaction-optimistic";

// Like + hilo de comentarios bajo una reseña (EPIC-05, Bloque B, SD-3). El
// estado real deriva de las props que el servidor revalida tras cada acción
// (revalidatePath); encima, useOptimisticAction pinta like/comentario al
// instante y revierte en error. Los comentarios vienen prefetcheados (capados)
// desde el servidor — expandir no dispara fetch, solo muestra/oculta.
export function ReviewInteractions({
  targetType,
  targetId,
  reactionCount,
  viewerReacted,
  commentCount,
  comments,
  viewerLoggedIn,
  showTargetReaction = true,
}: {
  targetType: TargetType;
  targetId: string;
  reactionCount: number;
  viewerReacted: boolean;
  commentCount: number;
  comments: InteractionComment[];
  viewerLoggedIn: boolean;
  // false para targets sin sentido de "me gusta" propio (p.ej. un checkpoint
  // de buddy_read, EPIC-05 Bloque H1) -- el like en comentarios individuales
  // no se ve afectado, es un target distinto ("comment").
  showTargetReaction?: boolean;
}) {
  const t = useTranslations("social");
  const { state, isPending, run } = useOptimisticAction({
    state: { reactionCount, viewerReacted, commentCount, comments },
    reducer: interactionReducer,
  });
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState("");

  if (!viewerLoggedIn) {
    return (
      <div className="flex items-center gap-4 border-t border-border pt-3 text-xs text-muted-foreground">
        {showTargetReaction && (
          <span className="flex items-center gap-1.5">
            <HeartIcon className="h-4 w-4" /> {state.reactionCount}
          </span>
        )}
        <Link
          href="/login"
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
      authorId: "",
      author: t("you"),
      initials: "",
      body: value,
      createdAt: new Date().toISOString(),
      isOwn: true,
      reactionCount: 0,
      viewerReacted: false,
    };
    run({ type: "addComment", comment: optimistic }, () =>
      addComment(targetType, targetId, value),
    );
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <div className="flex items-center gap-4 text-xs">
        {showTargetReaction && (
          <button
            type="button"
            disabled={isPending}
            aria-label={t("like")}
            aria-pressed={state.viewerReacted}
            onClick={() =>
              run({ type: "toggleTarget" }, () =>
                toggleReaction(targetType, targetId),
              )
            }
            className={`flex items-center gap-1.5 transition-colors ${
              state.viewerReacted
                ? "text-accent"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <HeartIcon
              className="h-4 w-4"
              fill={state.viewerReacted ? "currentColor" : "none"}
            />
            {state.reactionCount}
          </button>
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
              className="flex items-start justify-between gap-2 text-xs"
            >
              <p className="text-foreground">
                <span className="font-medium">{c.author}</span>{" "}
                <span className="text-muted-foreground">{c.body}</span>
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  aria-pressed={c.viewerReacted}
                  onClick={() =>
                    run({ type: "toggleComment", id: c.id }, () =>
                      toggleReaction("comment", c.id),
                    )
                  }
                  className={`flex items-center gap-1 ${
                    c.viewerReacted ? "text-accent" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <HeartIcon className="h-3 w-3" fill={c.viewerReacted ? "currentColor" : "none"} />
                  {c.reactionCount > 0 && c.reactionCount}
                </button>
                {c.isOwn && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      run({ type: "deleteComment", id: c.id }, () =>
                        deleteComment(c.id),
                      )
                    }
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {t("deleteComment")}
                  </button>
                )}
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
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("writeComment")}
              className="flex-1 rounded-full border border-border bg-surface px-3 py-1.5 text-xs outline-none focus:border-accent"
            />
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
    </div>
  );
}
