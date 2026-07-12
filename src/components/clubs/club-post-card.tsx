"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ClubPost } from "@/lib/clubs/posts";
import { votePoll, deletePost } from "@/lib/clubs/posts";
import { ReviewInteractions } from "@/components/social/review-interactions";
import { itemHref } from "@/lib/catalog/item-href";
import { Button } from "@/components/ui/button";

export function ClubPostCard({
  post,
  viewerLoggedIn,
  canDelete,
  onDeleted,
}: {
  post: ClubPost;
  viewerLoggedIn: boolean;
  canDelete: boolean;
  onDeleted: () => void;
}) {
  const t = useTranslations("clubPost");
  const [selectedOption, setSelectedOption] = useState(post.poll?.viewerOptionId ?? null);
  const [isPending, startTransition] = useTransition();

  function handleVote(optionId: string) {
    setSelectedOption(optionId);
    startTransition(async () => {
      await votePoll(post.id, optionId);
    });
  }

  function handleDelete() {
    if (!confirm(t("deleteConfirm"))) return;
    startTransition(async () => {
      await deletePost(post.id);
      onDeleted();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">
          {post.authorDisplayName || post.authorUsername}
        </span>
        {canDelete && (
          <Button type="button" variant="ghost" disabled={isPending} onClick={handleDelete}>
            {t("deletePost")}
          </Button>
        )}
      </div>

      <p className="whitespace-pre-wrap text-sm text-foreground">{post.body}</p>

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

      {post.kind === "poll" && post.poll && (
        <div className="flex flex-col gap-1">
          {post.poll.options.map((opt) => (
            <label key={opt.id} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`poll-${post.id}`}
                checked={selectedOption === opt.id}
                disabled={post.poll!.isClosed || isPending}
                onChange={() => handleVote(opt.id)}
              />
              <span className="flex-1">{opt.label}</span>
              {opt.voteCount != null && (
                <span className="text-xs text-muted-foreground">
                  {t("pollVotes", { count: opt.voteCount })}
                </span>
              )}
            </label>
          ))}
          {!post.poll.resultsVisible && (
            <p className="text-xs text-muted-foreground">{t("pollResultsHidden")}</p>
          )}
          {post.poll.isClosed && <p className="text-xs text-muted-foreground">{t("pollClosed")}</p>}
        </div>
      )}

      <ReviewInteractions
        targetType="club_post"
        targetId={post.id}
        reactionCount={post.reactionCount}
        viewerReacted={post.viewerReacted}
        commentCount={post.commentCount}
        comments={post.comments}
        viewerLoggedIn={viewerLoggedIn}
      />
    </div>
  );
}
