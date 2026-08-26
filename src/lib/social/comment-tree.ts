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
  const seen = new Set<string>();
  let cur = c;
  while (cur.parentId) {
    const parent = byId.get(cur.parentId);
    if (!parent) return cur.id; // huérfano (padre fuera del lote): raíz él mismo
    if (seen.has(cur.id)) {
      seen.add(cur.id);
      return [...seen].sort()[0]!; // ciclo: representante canónico = id menor
    }
    seen.add(cur.id);
    cur = parent;
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

// Árbol de comentarios REAL (posts Spec 2b, /post/[id]): a diferencia de
// `buildCommentThreads` —que aplana todo a raíz + respuestas planas para el feed
// y las superficies compartidas—, este conserva la jerarquía por `parentId`. La
// UI de `/post/[id]` la renderiza anidada. La profundidad de DATOS es libre; la
// de RENDER (sangría) la capa la vista a `MAX_THREAD_DEPTH` niveles: más adentro
// no se sangra más, el nodo se pinta al nivel tope, con la línea «↳ En respuesta
// a @usuario» dando el contexto de a quién responde. Capado a 2 (raíz + un nivel)
// para que en móvil el hilo no se estreche: la cabecera de respuesta sustituye a
// la sangría como señal de jerarquía.
export const MAX_THREAD_DEPTH = 2;

export type CommentNode = {
  comment: InteractionComment;
  depth: number; // real, 0 = raíz de hilo; el render satura la sangría en MAX_THREAD_DEPTH
  children: CommentNode[];
};

export function buildCommentTree(
  comments: InteractionComment[],
  sort: CommentSort,
): CommentNode[] {
  const byId = new Map(comments.map((c) => [c.id, c]));
  const childrenOf = new Map<string, InteractionComment[]>();
  const roots: InteractionComment[] = [];
  for (const c of comments) {
    // Padre presente en el lote → cuelga de él; si no (raíz real, o padre fuera
    // del corte de prefetch), es raíz de hilo.
    const parent = c.parentId ? byId.get(c.parentId) : undefined;
    if (parent && parent.id !== c.id) {
      const arr = childrenOf.get(parent.id);
      if (arr) arr.push(c);
      else childrenOf.set(parent.id, [c]);
    } else {
      roots.push(c);
    }
  }
  // `placed` corta ciclos (imposibles con las constraints de BD, pero barato de
  // blindar) y evita doble colocación: cada comentario tiene un único padre, así
  // que aparece una sola vez. Nunca recursión infinita.
  const placed = new Set<string>();
  const build = (c: InteractionComment, depth: number): CommentNode => {
    placed.add(c.id);
    const children = (childrenOf.get(c.id) ?? [])
      .filter((k) => !placed.has(k.id))
      .sort(asc) // respuestas en orden cronológico (viejas primero, estilo hilo)
      .map((k) => build(k, depth + 1));
    return { comment: c, depth, children };
  };
  const nodes = roots.map((r) => build(r, 0));
  // Comentarios atrapados en un ciclo no cuelgan de ninguna raíz: se promueven a
  // raíz (en orden de aparición) para que la función sea TOTAL, sin perderlos.
  for (const cm of comments) if (!placed.has(cm.id)) nodes.push(build(cm, 0));
  nodes.sort((a, b) => {
    if (a.comment.pinned !== b.comment.pinned) return a.comment.pinned ? -1 : 1;
    if (sort === "top" && b.comment.reactionCount !== a.comment.reactionCount) {
      return b.comment.reactionCount - a.comment.reactionCount;
    }
    return b.comment.createdAt.localeCompare(a.comment.createdAt); // recientes primero
  });
  return nodes;
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
