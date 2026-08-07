"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
import { buildChatMessages } from "@/lib/social/comment-tree";
import { useOptimisticAction } from "@/lib/reactivity/use-optimistic-action";
import { interactionReducer } from "@/lib/social/interaction-optimistic";
import { timeAgo } from "@/lib/relative-time";
import { useMentionAutocomplete } from "../social/use-mention-autocomplete";
import { RichTextView } from "../social/rich-text-view";
import { SpoilerGate } from "../social/spoiler-gate";
import { UserAvatar } from "../social/user-avatar";
import { CommentActions } from "../social/comment-actions";
import { CommentComposer } from "../social/comment-composer";
import { ReactionBar } from "../social/reaction-bar";

// Segunda presentación del MISMO motor de comentarios (Tarea 8): el chat de una
// actividad como burbujas de mensajería, en vez del "hilo" de ReviewInteractions.
// Comparte reducer + useOptimisticAction + acciones de servidor; solo cambia el
// render. `buildChatMessages` ordena por tiempo y marca inicio de grupo y la
// cita del padre. Sin realtime (async) y sin "Visto" (fuera de v1). La RLS de
// club_activity ya limita a participantes: si llega aquí, el viewer participa.
export function ActivityChatBubbles({
  interactionTargetId,
  reactionCount,
  viewerReacted,
  commentCount,
  comments,
  reactions,
  viewerLoggedIn,
  clubId,
  knownUsernames = [],
}: {
  interactionTargetId: string;
  reactionCount: number;
  viewerReacted: boolean;
  commentCount: number;
  comments: InteractionComment[];
  reactions: ReactionsByKind;
  viewerLoggedIn: boolean;
  /** Club de la actividad -- acota el autocompletar de @menciones a sus miembros. */
  clubId: string;
  /** Usernames @mencionados que existen de verdad (resueltos server-side). */
  knownUsernames?: string[];
}) {
  const t = useTranslations("social");
  const tTime = useTranslations("time");
  const { state, isPending, failed, run } = useOptimisticAction({
    state: { interactionTargetId, reactionCount, viewerReacted, commentCount, comments, reactions },
    reducer: interactionReducer,
  });
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [spoiler, setSpoiler] = useState(false);
  const [editDraft, setEditDraft] = useState("");
  const mention = useMentionAutocomplete({
    value: draft,
    onChange: setDraft,
    scope: { scope: "club", clubId },
  });

  const messages = buildChatMessages(state.comments);

  // Un thunk de `run` debe RECHAZAR para que useOptimisticAction revierta; las
  // acciones resuelven {ok:false} en vez de lanzar, así que lo traducimos.
  const throwIfFailed = (res: { ok: true } | { ok: false; error: string }) => {
    if (!res.ok) throw new Error(res.error);
  };

  function newOptimistic(body: string, parentId: string | null, isSpoiler: boolean): InteractionComment {
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
      isSpoiler,
      pinned: false,
      edited: false,
      reactionCount: 0,
      viewerReacted: false,
      reactions: emptyReactions(),
    };
  }

  function submit() {
    const value = draft.trim();
    if (!value) return;
    const parentId = replyingTo ?? null;
    const isSpoiler = spoiler;
    setDraft("");
    setSpoiler(false);
    setReplyingTo(null);
    run({ type: "addComment", comment: newOptimistic(value, parentId, isSpoiler) }, async () => {
      throwIfFailed(
        await addComment(interactionTargetId, value, {
          parentId: parentId ?? undefined,
          isSpoiler,
        }),
      );
    });
  }

  function startReply(c: InteractionComment) {
    setEditingId(null);
    setReplyingTo(c.id);
    // Prefija @autor al responder a alguien distinto de ti (si tiene username).
    setDraft(!c.isOwn && c.authorUsername ? `@${c.authorUsername} ` : "");
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

  // Participantes distintos, en orden de aparición, para la cabecera.
  const participants: InteractionComment[] = [];
  const seenAuthors = new Set<string>();
  for (const c of state.comments) {
    if (seenAuthors.has(c.authorId)) continue;
    seenAuthors.add(c.authorId);
    participants.push(c);
  }

  const quotedRepliedName =
    replyingTo != null
      ? state.comments.find((c) => c.id === replyingTo)?.author ?? null
      : null;

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-[11px]">
      {participants.length > 0 && (
        <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
          <div className="flex">
            {participants.slice(0, 5).map((c, i) => (
              <div key={c.authorId} className={i === 0 ? "" : "-ml-2"}>
                <UserAvatar name={c.author} avatarUrl={c.authorAvatarUrl} size={22} />
              </div>
            ))}
          </div>
          <span className="min-w-0 truncate">
            {participants.map((c) => c.author).join(", ")}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {messages.map((m) => {
          const c = m.comment;
          const own = c.isOwn;
          const showHeader = m.startsGroup && !own;
          return (
            <div key={c.id} className={`flex flex-col ${own ? "items-end" : "items-start"}`}>
              {m.quoted && (
                <p className="max-w-[85%] truncate text-[11px] text-muted-foreground">
                  ↳ @{m.quoted.author}:{" "}
                  {m.quoted.body.length > 60 ? `${m.quoted.body.slice(0, 60)}…` : m.quoted.body}
                </p>
              )}
              {showHeader && (
                <div className="mb-0.5 flex items-center gap-1.5">
                  <UserAvatar name={c.author} avatarUrl={c.authorAvatarUrl} size={18} />
                  <span className="text-[11px] font-medium text-foreground">{c.author}</span>
                </div>
              )}

              {editingId === c.id ? (
                <div className="w-full max-w-[85%]">
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
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs ${
                    own ? "bg-accent text-accent-foreground" : "bg-surface text-foreground"
                  }`}
                >
                  {c.isSpoiler ? (
                    <SpoilerGate>
                      <RichTextView text={c.body} knownUsernames={knownUsernames} />
                    </SpoilerGate>
                  ) : (
                    <RichTextView text={c.body} knownUsernames={knownUsernames} />
                  )}
                </div>
              )}

              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                <span suppressHydrationWarning>{timeAgo(c.createdAt, tTime)}</span>
                {c.pinned && <span aria-label={t("pinned")}>📌</span>}
                {c.edited && <span>· {t("edited")}</span>}
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
                {viewerLoggedIn && (
                  <button
                    type="button"
                    onClick={() => startReply(c)}
                    className="transition-colors hover:text-foreground"
                  >
                    {t("reply")}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {viewerLoggedIn && (
        <div className="sticky bottom-0 flex flex-col gap-1 bg-background pt-2">
          {quotedRepliedName && (
            <p className="text-[11px] text-muted-foreground">
              ↳ @{quotedRepliedName}
            </p>
          )}
          <div className="relative">
            <CommentComposer
              value={draft}
              onChange={setDraft}
              onSubmit={submit}
              onCancel={replyingTo != null ? () => {
                setReplyingTo(null);
                setDraft("");
              } : undefined}
              onInput={mention.onInput}
              onKeyDown={mention.onKeyDown}
              dropdown={mention.dropdown}
              submitLabel={t("sendMessage")}
              placeholder={t("writeComment")}
              isSpoiler={spoiler}
              onToggleSpoiler={() => setSpoiler((v) => !v)}
              compact
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
