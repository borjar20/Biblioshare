"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ClubPost } from "@/lib/clubs/posts";
import { votePoll, deletePost } from "@/lib/clubs/posts";
import { ReviewInteractions } from "@/components/social/review-interactions";
import { MentionText } from "@/components/social/mention-text";
import { itemHref } from "@/lib/catalog/item-href";
import { ActionMenu } from "@/components/ui/action-menu";
import { ClampedText } from "@/components/ui/clamped-text";
import { TimeAgo } from "@/components/ui/time-ago";
import { UserAvatar } from "@/components/social/user-avatar";

export function ClubPostCard({
  post,
  viewerLoggedIn,
  canDelete,
  knownUsernames,
}: {
  post: ClubPost;
  viewerLoggedIn: boolean;
  canDelete: boolean;
  /** Usernames @mencionados (post + sus comentarios) que existen de verdad. */
  knownUsernames: string[];
}) {
  const t = useTranslations("clubPost");
  const [selectedOption, setSelectedOption] = useState(post.poll?.viewerOptionId ?? null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const authorName = post.authorDisplayName || post.authorUsername;

  function handleVote(optionId: string) {
    const previous = selectedOption;
    setSelectedOption(optionId);
    setError(null);
    startTransition(async () => {
      try {
        // selectedOption da feedback inmediato del radio; la revalidación
        // (Fase 1) resiembra la página 1 del feed con los conteos frescos.
        await votePoll(post.id, optionId);
      } catch {
        setSelectedOption(previous);
        setError(t("postError"));
      }
    });
  }

  function handleDelete() {
    if (!confirm(t("deleteConfirm"))) return;
    setError(null);
    startTransition(async () => {
      try {
        await deletePost(post.id);
      } catch {
        setError(t("postError"));
      }
    });
  }

  return (
    <article className="flex flex-col gap-3 rounded-card border border-border bg-surface shadow-card p-4">
      {/* Cabecera como la de las tarjetas del feed de Inicio (ThoughtCard):
          avatar + autor enlazado + hora. Antes solo el nombre, sin cuándo. */}
      <div className="flex items-center gap-2.5">
        <UserAvatar name={authorName} avatarUrl={post.authorAvatarUrl} size={30} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Link
            href={`/u/${post.authorUsername}`}
            className="truncate text-sm font-semibold text-foreground hover:underline"
          >
            {authorName}
          </Link>
          <TimeAgo iso={post.createdAt} className="font-mono text-[10px] text-muted-foreground" />
        </div>
        {/* Detrás del «···» (F3-012): un botón «Borrar» por post convertía el
            feed del club en una hilera de borrados a la vista, y a dedo (F4-027)
            cae justo donde se apoya el pulgar al desplazar. La confirmación ya
            estaba en handleDelete. */}
        {canDelete && (
          <ActionMenu
            label={t("postActionsLabel")}
            items={[
              {
                key: "delete",
                label: t("deletePost"),
                danger: true,
                disabled: isPending,
                onSelect: handleDelete,
              },
            ]}
          />
        )}
      </div>

      {error && <p className="text-xs text-status-dropped">{error}</p>}

      {/* Un post largo se pliega a ~10 líneas con «Ver más»: sin esto, un
          texto de varios párrafos ocupaba pantallas enteras en móvil y
          enterraba el resto del feed. */}
      {post.body && (
        <ClampedText className="whitespace-pre-wrap break-words font-serif text-[14px] leading-relaxed text-foreground">
          <MentionText text={post.body} knownUsernames={knownUsernames} />
        </ClampedText>
      )}

      {post.kind === "activity_share" && (
        post.sharedActivity ? (
          <Link
            href={itemHref(post.sharedActivity.itemType, post.sharedActivity.itemId)}
            className="flex items-center gap-2 rounded-md border border-border p-2 hover:bg-surface-muted"
          >
            {post.sharedActivity.itemCoverUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- portada externa/Storage
              <img src={post.sharedActivity.itemCoverUrl} alt="" className="h-14 w-10 shrink-0 rounded object-cover" />
            )}
            <span className="min-w-0 flex-1 truncate text-sm">{post.sharedActivity.itemTitle}</span>
          </Link>
        ) : (
          <p className="rounded-md border border-border p-2 text-xs text-muted-foreground">
            {t("noLongerAvailable")}
          </p>
        )
      )}

      {post.kind === "poll" && post.poll && (() => {
        // Encuesta del frame 2 (.poll): cada opción es una barra con relleno
        // proporcional (accent al 12%) y su % en mono; la opción votada lleva
        // borde accent. Radiogroup accesible: una sola elección.
        const poll = post.poll;
        const showResults = poll.resultsVisible;
        const total = poll.options.reduce((sum, o) => sum + (o.voteCount ?? 0), 0);
        return (
          <div role="radiogroup" aria-label={t("pollGroupLabel")} className="flex flex-col gap-[7px]">
            {poll.options.map((opt) => {
              const isSel = selectedOption === opt.id;
              const pct =
                showResults && total > 0
                  ? Math.round(((opt.voteCount ?? 0) / total) * 100)
                  : 0;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={isSel}
                  disabled={poll.isClosed || isPending}
                  onClick={() => handleVote(opt.id)}
                  className={`relative overflow-hidden rounded-lg border px-3 py-2.5 text-left text-[12.5px] transition-colors disabled:cursor-default ${
                    isSel ? "border-accent" : "border-border hover:bg-surface-muted"
                  }`}
                >
                  {showResults && (
                    <span
                      aria-hidden
                      className="absolute inset-y-0 left-0 bg-accent/[0.12]"
                      style={{ width: `${pct}%` }}
                    />
                  )}
                  <span className="relative flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">{opt.label}</span>
                    {showResults && (
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                        {pct}%
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
            {!showResults && (
              <p className="text-xs text-muted-foreground">{t("pollResultsHidden")}</p>
            )}
            {poll.isClosed && <p className="text-xs text-muted-foreground">{t("pollClosed")}</p>}
          </div>
        );
      })()}

      <ReviewInteractions
        interactionTargetId={post.interactionTargetId}
        reactionCount={post.reactionCount}
        viewerReacted={post.viewerReacted}
        commentCount={post.commentCount}
        comments={post.comments}
        reactions={post.reactions}
        viewerLoggedIn={viewerLoggedIn}
        clubId={post.clubId}
        knownUsernames={knownUsernames}
        voiceEnabled
      />
    </article>
  );
}
