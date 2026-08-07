import type { InteractionComment } from "./interactions";

export type CommentSort = "recent" | "top";
export type CommentThread = { root: InteractionComment; replies: InteractionComment[] };
export type ChatMessage = {
  comment: InteractionComment;
  startsGroup: boolean;
  quoted: { author: string; body: string } | null;
};

const asc = (a: InteractionComment, b: InteractionComment) => a.createdAt.localeCompare(b.createdAt);

// Sube por parentId hasta el ancestro con parentId null presente en el lote.
// Si el padre no está cargado (corte de prefetch), el propio nodo es su raíz.
function rootIdOf(c: InteractionComment, byId: Map<string, InteractionComment>): string {
  let cur = c;
  const seen = new Set<string>();
  while (cur.parentId && byId.has(cur.parentId) && !seen.has(cur.parentId)) {
    seen.add(cur.id);
    cur = byId.get(cur.parentId)!;
  }
  return cur.id;
}

export function buildCommentThreads(comments: InteractionComment[], sort: CommentSort): CommentThread[] {
  const byId = new Map(comments.map((c) => [c.id, c]));
  const threads = new Map<string, CommentThread>();
  const ensure = (root: InteractionComment) => {
    if (!threads.has(root.id)) threads.set(root.id, { root, replies: [] });
    return threads.get(root.id)!;
  };
  // Primero las raíces reales, para que existan antes de colgar respuestas.
  for (const c of comments) if (rootIdOf(c, byId) === c.id) ensure(c);
  for (const c of comments) {
    const rid = rootIdOf(c, byId);
    if (rid === c.id) continue;
    const root = byId.get(rid);
    if (root) ensure(root).replies.push(c);
  }
  const list = [...threads.values()];
  for (const t of list) t.replies.sort(asc);
  list.sort((a, b) => {
    if (a.root.pinned !== b.root.pinned) return a.root.pinned ? -1 : 1;
    if (sort === "top" && b.root.reactionCount !== a.root.reactionCount) {
      return b.root.reactionCount - a.root.reactionCount;
    }
    return b.root.createdAt.localeCompare(a.root.createdAt); // recientes primero
  });
  return list;
}

export function buildChatMessages(comments: InteractionComment[]): ChatMessage[] {
  const byId = new Map(comments.map((c) => [c.id, c]));
  const ordered = [...comments].sort(asc);
  return ordered.map((comment, i) => {
    const prev = ordered[i - 1];
    const parent = comment.parentId ? byId.get(comment.parentId) : undefined;
    return {
      comment,
      startsGroup: !prev || prev.authorId !== comment.authorId,
      quoted: parent ? { author: parent.author, body: parent.body } : null,
    };
  });
}
