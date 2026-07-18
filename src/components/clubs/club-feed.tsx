"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { type ClubPost, type ClubPostsPage } from "@/lib/clubs/posts";
import { loadMoreClubPosts } from "./club-post-actions";
import { ClubPostComposer } from "./club-post-composer";
import { ClubPostCard } from "./club-post-card";
import { Button } from "@/components/ui/button";

export function ClubFeed({
  clubId,
  viewerId,
  viewerRole,
  viewerName,
  viewerAvatarUrl,
  initialPage,
}: {
  clubId: string;
  viewerId: string;
  viewerRole: "member" | "moderator" | "owner";
  viewerName: string;
  viewerAvatarUrl: string | null;
  initialPage: ClubPostsPage;
}) {
  const t = useTranslations("clubPost");
  const [posts, setPosts] = useState(initialPage.posts);
  const [cursor, setCursor] = useState(initialPage.nextCursor);
  const [isPending, startTransition] = useTransition();

  // Página 1 server-authoritative: cuando una mutación revalida el club (Fase 1)
  // la RSC re-ejecuta y entrega un initialPage nuevo; resembramos desde él, así
  // el post nuevo / el voto / el borrado se reflejan sin recargar. Es el patrón
  // "ajustar estado al cambiar una prop" de React (en render, con seguimiento
  // del valor previo — no un efecto). Las páginas extra de "cargar más" se
  // pierden al resembrar: trade-off aceptado por la convención (reconciliar la
  // primera página). initialPage solo cambia de identidad cuando la RSC
  // re-ejecuta, no en re-renders de cliente.
  const [seededPage, setSeededPage] = useState(initialPage);
  if (seededPage !== initialPage) {
    setSeededPage(initialPage);
    setPosts(initialPage.posts);
    setCursor(initialPage.nextCursor);
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
        viewerName={viewerName}
        viewerAvatarUrl={viewerAvatarUrl}
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
