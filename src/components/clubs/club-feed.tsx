"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { listClubPosts, type ClubPost, type ClubPostsPage } from "@/lib/clubs/posts";
import { loadMoreClubPosts } from "./club-post-actions";
import { ClubPostComposer } from "./club-post-composer";
import { ClubPostCard } from "./club-post-card";
import { Button } from "@/components/ui/button";

export function ClubFeed({
  clubId,
  viewerId,
  viewerRole,
  initialPage,
}: {
  clubId: string;
  viewerId: string;
  viewerRole: "member" | "moderator" | "owner";
  initialPage: ClubPostsPage;
}) {
  const t = useTranslations("clubPost");
  const [posts, setPosts] = useState(initialPage.posts);
  const [cursor, setCursor] = useState(initialPage.nextCursor);
  const [isPending, startTransition] = useTransition();

  function refresh(page: ClubPostsPage) {
    setPosts(page.posts);
    setCursor(page.nextCursor);
  }

  function loadMore() {
    if (!cursor) return;
    startTransition(async () => {
      const page = await loadMoreClubPosts(clubId, cursor);
      setPosts((prev) => [...prev, ...page.posts]);
      setCursor(page.nextCursor);
    });
  }

  function canDelete(post: ClubPost) {
    return post.authorId === viewerId || viewerRole === "moderator" || viewerRole === "owner";
  }

  return (
    <div className="flex flex-col gap-4">
      <ClubPostComposer
        clubId={clubId}
        onPosted={() => {
          startTransition(async () => {
            refresh(await listClubPosts(clubId));
          });
        }}
      />

      {posts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {posts.map((post) => (
            <ClubPostCard
              key={post.id}
              post={post}
              viewerLoggedIn
              canDelete={canDelete(post)}
              onDeleted={() => setPosts((prev) => prev.filter((p) => p.id !== post.id))}
            />
          ))}
        </div>
      )}

      {cursor && (
        <Button type="button" variant="ghost" disabled={isPending} onClick={loadMore}>
          {t("loadMore")}
        </Button>
      )}
    </div>
  );
}
