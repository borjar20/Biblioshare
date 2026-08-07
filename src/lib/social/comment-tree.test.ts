import { describe, it, expect } from "vitest";
import { buildCommentThreads, buildChatMessages } from "./comment-tree";
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
