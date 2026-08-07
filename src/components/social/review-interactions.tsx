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
  editComment,
  pinComment,
  deleteComment,
} from "@/lib/social/interaction-actions";
import {
  emptyReactions,
  type InteractionComment,
  type ReactionsByKind,
} from "@/lib/social/interactions";
import { buildCommentThreads, type CommentSort } from "@/lib/social/comment-tree";
import { useOptimisticAction } from "@/lib/reactivity/use-optimistic-action";
import { interactionReducer } from "@/lib/social/interaction-optimistic";
import { useMentionAutocomplete } from "./use-mention-autocomplete";
import { RichTextView } from "./rich-text-view";
import { SpoilerGate } from "./spoiler-gate";
import { UserAvatar } from "./user-avatar";
import { CommentActions } from "./comment-actions";
import { CommentComposer } from "./comment-composer";
import { ReactionBar } from "./reaction-bar";

// Like + hilo enriquecido de comentarios bajo una reseña (EPIC-05, Bloque B,
// SD-3 + reestructura Tarea 7). El estado real deriva de las props que el
// servidor revalida tras cada acción (revalidatePath); encima,
// useOptimisticAction pinta like/comentario/edición/fijado al instante y
// revierte en error. Las server actions ahora RESUELVEN con {ok:false} en vez
// de lanzar, así que cada thunk de `run` convierte el fallo en throw para que
// useOptimisticAction haga rollback (el rollback solo dispara si el thunk
// rechaza). Los comentarios vienen prefetcheados (capados) desde el servidor —
// expandir no dispara fetch, solo muestra/oculta. `buildCommentThreads` los
// agrupa en raíz + respuestas planas (Reddit-lite, sin anidado profundo).
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
  const [sort, setSort] = useState<CommentSort>("recent");
  const [openReplies, setOpenReplies] = useState<Set<string>>(new Set());
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rootSpoiler, setRootSpoiler] = useState(false);
  const [rootDraft, setRootDraft] = useState("");
  const [replyDraft, setReplyDraft] = useState("");
  const [editDraft, setEditDraft] = useState("");
  const mention = useMentionAutocomplete({
    value: rootDraft,
    onChange: setRootDraft,
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

  const threads = buildCommentThreads(state.comments, sort);

  // Un thunk de `run` debe RECHAZAR para que useOptimisticAction revierta; las
  // acciones ahora resuelven {ok:false} en vez de lanzar, así que lo traducimos.
  const throwIfFailed = (res: { ok: true } | { ok: false; error: string }) => {
    if (!res.ok) throw new Error(res.error);
  };

  function newOptimistic(body: string, parentId: string | null, spoiler: boolean): InteractionComment {
    return {
      id: `optimistic-${Date.now()}`,
      interactionTargetId: "optimistic-comment-target",
      authorId: "",
      author: t("you"),
      authorUsername: null,
      authorAvatarUrl: null,
      initials: "",
      body,
      createdAt: new Date().toISOString(),
      isOwn: true,
      canDelete: true,
      canEdit: true,
      canPin: false,
      parentId,
      isSpoiler: spoiler,
      pinned: false,
      edited: false,
      reactionCount: 0,
      viewerReacted: false,
      reactions: emptyReactions(),
    };
  }

  function submitRoot() {
    const value = rootDraft.trim();
    if (!value) return;
    const spoiler = rootSpoiler;
    setRootDraft("");
    setRootSpoiler(false);
    run({ type: "addComment", comment: newOptimistic(value, null, spoiler) }, async () => {
      throwIfFailed(await addComment(interactionTargetId, value, { isSpoiler: spoiler }));
    });
  }

  function startReply(rootId: string, c: InteractionComment) {
    setEditingId(null);
    setReplyingTo(rootId);
    // Prefija @autor cuando respondes a alguien distinto de ti y su username
    // existe (si no hay username no se puede mencionar, se deja vacío).
    setReplyDraft(!c.isOwn && c.authorUsername ? `@${c.authorUsername} ` : "");
  }

  function submitReply(rootId: string) {
    const value = replyDraft.trim();
    if (!value) return;
    setReplyDraft("");
    setReplyingTo(null);
    setOpenReplies((prev) => new Set(prev).add(rootId));
    run({ type: "addComment", comment: newOptimistic(value, rootId, false) }, async () => {
      throwIfFailed(await addComment(interactionTargetId, value, { parentId: rootId }));
    });
  }

  function startEdit(c: InteractionComment) {
    setReplyingTo(null);
    setEditingId(c.id);
    setEditDraft(c.body);
  }

  function submitEdit(id: string) {
    const value = editDraft.trim();
    if (!value) return;
    setEditingId(null);
    run({ type: "editComment", id, body: value }, async () => {
      throwIfFailed(await editComment(id, value));
    });
  }

  function toggleReplies(rootId: string) {
    setOpenReplies((prev) => {
      const next = new Set(prev);
      if (next.has(rootId)) next.delete(rootId);
      else next.add(rootId);
      return next;
    });
  }

  function renderComment(c: InteractionComment, rootId: string, isReply: boolean) {
    return (
      <div key={c.id} className="flex items-start gap-2 text-xs">
        <UserAvatar name={c.author} avatarUrl={c.authorAvatarUrl} size={isReply ? 20 : 24} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="min-w-0 text-foreground">
                {c.authorUsername ? (
                  <Link href={`/u/${c.authorUsername}`} className="font-medium hover:underline">
                    {c.author}
                  </Link>
                ) : (
                  <span className="font-medium">{c.author}</span>
                )}
                {c.pinned && (
                  <span className="ml-1.5 text-[10px] text-muted-foreground">📌 {t("pinned")}</span>
                )}
              </p>
              {editingId === c.id ? (
                <div className="mt-1">
                  <CommentComposer
                    value={editDraft}
                    onChange={setEditDraft}
                    onSubmit={() => submitEdit(c.id)}
                    onCancel={() => {
                      setEditingId(null);
                      setEditDraft("");
                    }}
                    submitLabel={t("saveEdit")}
                    placeholder={t("writeComment")}
                    showFormatting
                    compact
                    busy={isPending}
                  />
                </div>
              ) : (
                <div className="text-muted-foreground">
                  {c.isSpoiler ? (
                    <SpoilerGate>
                      <RichTextView text={c.body} knownUsernames={knownUsernames} />
                    </SpoilerGate>
                  ) : (
                    <RichTextView text={c.body} knownUsernames={knownUsernames} />
                  )}
                  {c.edited && <span className="ml-1 text-[10px]">· {t("edited")}</span>}
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ReactionBar
                reactions={c.reactions}
                disabled={isPending}
                onToggle={(kind) =>
                  run({ type: "toggleComment", id: c.id, kind }, async () => {
                    await toggleReaction(c.interactionTargetId, kind);
                  })
                }
              />
              <CommentActions
                commentId={c.id}
                canDelete={c.canDelete}
                canEdit={c.canEdit}
                canPin={c.canPin}
                pinned={c.pinned}
                isOwn={c.isOwn}
                isBusy={isPending}
                onEdit={() => startEdit(c)}
                onTogglePin={() =>
                  run({ type: "pinComment", id: c.id, pinned: !c.pinned }, async () => {
                    throwIfFailed(await pinComment(c.id, !c.pinned));
                  })
                }
                onDelete={() =>
                  run({ type: "deleteComment", id: c.id }, async () => {
                    throwIfFailed(await deleteComment(c.id));
                  })
                }
              />
            </div>
          </div>
          <button
            type="button"
            onClick={() => startReply(rootId, c)}
            className="self-start text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("reply")}
          </button>
        </div>
      </div>
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
              run({ type: "toggleTarget", kind }, async () => {
                await toggleReaction(interactionTargetId, kind);
              })
            }
          />
        )}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <CommentIcon className="h-4 w-4" />
          {t("commentsCount", { count: state.commentCount })}
        </button>
      </div>

      {expanded && (
        <div className="flex flex-col gap-3">
          {threads.length > 1 && (
            <div className="flex items-center gap-1 text-[11px]">
              <button
                type="button"
                aria-pressed={sort === "recent"}
                onClick={() => setSort("recent")}
                className={`rounded-md px-2 py-1 font-medium transition-colors ${
                  sort === "recent"
                    ? "bg-accent/10 text-accent"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("sortRecent")}
              </button>
              <button
                type="button"
                aria-pressed={sort === "top"}
                onClick={() => setSort("top")}
                className={`rounded-md px-2 py-1 font-medium transition-colors ${
                  sort === "top"
                    ? "bg-accent/10 text-accent"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("sortTop")}
              </button>
            </div>
          )}

          {threads.map((thread) => {
            const repliesOpen = openReplies.has(thread.root.id);
            return (
              <div key={thread.root.id} className="flex flex-col gap-2">
                {renderComment(thread.root, thread.root.id, false)}

                {thread.replies.length > 0 && (
                  <button
                    type="button"
                    onClick={() => toggleReplies(thread.root.id)}
                    aria-expanded={repliesOpen}
                    className="ml-8 self-start text-[11px] font-medium text-accent hover:underline"
                  >
                    {repliesOpen
                      ? t("hideReplies")
                      : `${t("viewReplies")} (${thread.replies.length})`}
                  </button>
                )}

                {repliesOpen && thread.replies.length > 0 && (
                  <div className="ml-4 flex flex-col gap-2 border-l border-border pl-3">
                    {thread.replies.map((r) => renderComment(r, thread.root.id, true))}
                  </div>
                )}

                {replyingTo === thread.root.id && (
                  <div className="ml-8">
                    <CommentComposer
                      value={replyDraft}
                      onChange={setReplyDraft}
                      onSubmit={() => submitReply(thread.root.id)}
                      onCancel={() => {
                        setReplyingTo(null);
                        setReplyDraft("");
                      }}
                      submitLabel={t("reply")}
                      placeholder={t("writeReply")}
                      compact
                      busy={isPending}
                    />
                  </div>
                )}
              </div>
            );
          })}

          <div className="relative">
            <CommentComposer
              value={rootDraft}
              onChange={setRootDraft}
              onSubmit={submitRoot}
              onInput={mention.onInput}
              onKeyDown={mention.onKeyDown}
              dropdown={mention.dropdown}
              submitLabel={t("postComment")}
              placeholder={t("writeComment")}
              isSpoiler={rootSpoiler}
              onToggleSpoiler={() => setRootSpoiler((v) => !v)}
              showFormatting
              busy={isPending}
            />
          </div>
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
