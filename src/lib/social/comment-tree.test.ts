import { describe, it, expect } from "vitest";
import { buildCommentThreads, buildCommentTree, buildChatMessages } from "./comment-tree";
import type { InteractionComment } from "./interactions";

function c(over: Partial<InteractionComment> & { id: string }): InteractionComment {
  return {
    id: over.id, interactionTargetId: "it-" + over.id, authorId: over.authorId ?? "u1",
    author: over.author ?? "U1", authorUsername: null, authorAvatarUrl: null, initials: "U",
    body: over.body ?? "x", createdAt: over.createdAt ?? "2026-01-01T00:00:00Z",
    isOwn: over.isOwn ?? false, canDelete: false, canEdit: false, canPin: false,
    parentId: over.parentId ?? null, isSpoiler: over.isSpoiler ?? false,
    pinned: over.pinned ?? false, edited: over.edited ?? false,
    reactionCount: over.reactionCount ?? 0, viewerReacted: false,
    reactions: { like:{count:0,viewerReacted:false}, read:{count:0,viewerReacted:false}, shock:{count:0,viewerReacted:false}, fire:{count:0,viewerReacted:false} },
  };
}

describe("buildCommentThreads", () => {
  it("aplana descendientes profundos bajo la raíz (dos niveles)", () => {
    const list = [
      c({ id: "a" }),
      c({ id: "b", parentId: "a", createdAt: "2026-01-01T01:00:00Z" }),
      c({ id: "cc", parentId: "b", createdAt: "2026-01-01T02:00:00Z" }), // respuesta a la respuesta
    ];
    const t = buildCommentThreads(list, "recent");
    expect(t).toHaveLength(1);
    expect(t[0].root.id).toBe("a");
    expect(t[0].replies.map((r) => r.id)).toEqual(["b", "cc"]); // ambas bajo la raíz, por fecha asc
  });
  it("orden recent: raíces por fecha desc, fijado primero", () => {
    const list = [
      c({ id: "a", createdAt: "2026-01-01T00:00:00Z" }),
      c({ id: "b", createdAt: "2026-01-02T00:00:00Z" }),
      c({ id: "p", createdAt: "2026-01-01T00:00:00Z", pinned: true }),
    ];
    expect(buildCommentThreads(list, "recent").map((x) => x.root.id)).toEqual(["p", "b", "a"]);
  });
  it("orden top: por reacciones desc (fijado primero)", () => {
    const list = [ c({ id: "a", reactionCount: 1 }), c({ id: "b", reactionCount: 5 }) ];
    expect(buildCommentThreads(list, "top").map((x) => x.root.id)).toEqual(["b", "a"]);
  });
  it("padre fuera del lote: el huérfano se trata como raíz", () => {
    const list = [ c({ id: "b", parentId: "missing" }) ];
    const t = buildCommentThreads(list, "recent");
    expect(t).toHaveLength(1);
    expect(t[0].root.id).toBe("b");
  });
  it("ciclo (no construible por la app): función total, cada nodo aparece una sola vez", () => {
    const list = [ c({ id: "a", parentId: "b" }), c({ id: "b", parentId: "a" }) ];
    const t = buildCommentThreads(list, "recent");
    const ids = t.flatMap((x) => [x.root.id, ...x.replies.map((r) => r.id)]);
    expect(ids.sort()).toEqual(["a", "b"]);
    expect(t).toHaveLength(1);
    expect(t[0].root.id).toBe("a");
  });
});

describe("buildCommentTree", () => {
  it("conserva la jerarquía real con profundidad (a > b > cc)", () => {
    const list = [
      c({ id: "a" }),
      c({ id: "b", parentId: "a", createdAt: "2026-01-01T01:00:00Z" }),
      c({ id: "cc", parentId: "b", createdAt: "2026-01-01T02:00:00Z" }),
    ];
    const t = buildCommentTree(list, "recent");
    expect(t).toHaveLength(1);
    expect(t[0].comment.id).toBe("a");
    expect(t[0].depth).toBe(0);
    expect(t[0].children.map((n) => n.comment.id)).toEqual(["b"]);
    expect(t[0].children[0].depth).toBe(1);
    expect(t[0].children[0].children.map((n) => n.comment.id)).toEqual(["cc"]);
    expect(t[0].children[0].children[0].depth).toBe(2);
  });
  it("respuestas hermanas en orden cronológico ascendente", () => {
    const list = [
      c({ id: "a" }),
      c({ id: "b2", parentId: "a", createdAt: "2026-01-01T02:00:00Z" }),
      c({ id: "b1", parentId: "a", createdAt: "2026-01-01T01:00:00Z" }),
    ];
    const t = buildCommentTree(list, "recent");
    expect(t[0].children.map((n) => n.comment.id)).toEqual(["b1", "b2"]);
  });
  it("orden de raíces: fijado primero, luego recientes / top", () => {
    const list = [
      c({ id: "a", createdAt: "2026-01-01T00:00:00Z", reactionCount: 1 }),
      c({ id: "b", createdAt: "2026-01-02T00:00:00Z", reactionCount: 5 }),
      c({ id: "p", createdAt: "2026-01-01T00:00:00Z", pinned: true }),
    ];
    expect(buildCommentTree(list, "recent").map((n) => n.comment.id)).toEqual(["p", "b", "a"]);
    expect(buildCommentTree(list, "top").map((n) => n.comment.id)).toEqual(["p", "b", "a"]);
  });
  it("padre fuera del lote: el huérfano es raíz", () => {
    const t = buildCommentTree([c({ id: "b", parentId: "missing" })], "recent");
    expect(t).toHaveLength(1);
    expect(t[0].comment.id).toBe("b");
    expect(t[0].depth).toBe(0);
  });
  it("ciclo (no construible por la app): total, cada nodo una sola vez", () => {
    const t = buildCommentTree([c({ id: "a", parentId: "b" }), c({ id: "b", parentId: "a" })], "recent");
    const ids: string[] = [];
    const walk = (nodes: ReturnType<typeof buildCommentTree>) => {
      for (const n of nodes) { ids.push(n.comment.id); walk(n.children); }
    };
    walk(t);
    expect(ids.sort()).toEqual(["a", "b"]);
  });
});

describe("buildChatMessages", () => {
  it("ordena por fecha, agrupa autor consecutivo y cita el padre", () => {
    const list = [
      c({ id: "a", authorId: "u1", body: "hola" }),
      c({ id: "b", authorId: "u1", createdAt: "2026-01-01T00:01:00Z" }),
      c({ id: "cc", authorId: "u2", parentId: "a", createdAt: "2026-01-01T00:02:00Z" }),
    ];
    const m = buildChatMessages(list);
    expect(m.map((x) => x.comment.id)).toEqual(["a", "b", "cc"]);
    expect(m[0].startsGroup).toBe(true);
    expect(m[1].startsGroup).toBe(false); // mismo autor consecutivo
    expect(m[2].startsGroup).toBe(true);
    expect(m[2].quoted).toEqual({ author: "U1", body: "hola" });
  });
});
