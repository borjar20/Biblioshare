import { describe, it, expect, test } from "vitest";
import { interactionReducer } from "./interaction-optimistic";
import { emptyReactions, type InteractionComment, type InteractionSummary } from "./interactions";

test("toggleTarget alterna el kind indicado y ajusta derivados", () => {
  const base: InteractionSummary = {
    interactionTargetId: "t", reactionCount: 0, viewerReacted: false,
    commentCount: 0, comments: [], reactions: emptyReactions(),
  };
  const s = interactionReducer(base, { type: "toggleTarget", kind: "fire" });
  expect(s.reactions.fire).toEqual({ count: 1, viewerReacted: true });
  expect(s.reactionCount).toBe(1);
  expect(s.viewerReacted).toBe(true);
});

function comment(over: Partial<InteractionComment> = {}): InteractionComment {
  return {
    id: "c1",
    interactionTargetId: "target-comment-1",
    authorId: "u1",
    author: "Ana",
    authorUsername: "ana",
    authorAvatarUrl: null,
    initials: "AN",
    body: "hola",
    createdAt: "2026-07-15T00:00:00Z",
    isOwn: false,
    canDelete: false,
    canEdit: false,
    canPin: false,
    parentId: null,
    isSpoiler: false,
    pinned: false,
    edited: false,
    reactionCount: 0,
    viewerReacted: false,
    reactions: emptyReactions(),
    ...over,
  };
}

const base: InteractionSummary = {
  interactionTargetId: "target-pass-1",
  reactionCount: 2,
  viewerReacted: false,
  commentCount: 5, // capado: mayor que comments.length a propósito
  comments: [
    comment({ id: "c1" }),
    comment({
      id: "c2",
      reactionCount: 3,
      viewerReacted: true,
      reactions: { ...emptyReactions(), like: { count: 3, viewerReacted: true } },
    }),
  ],
  reactions: { ...emptyReactions(), like: { count: 2, viewerReacted: false } },
};

describe("interactionReducer", () => {
  it("toggleTarget suma/resta y hace ida y vuelta", () => {
    const on = interactionReducer(base, { type: "toggleTarget", kind: "like" });
    expect(on.interactionTargetId).toBe("target-pass-1");
    expect(on.viewerReacted).toBe(true);
    expect(on.reactionCount).toBe(3);
    const off = interactionReducer(on, { type: "toggleTarget", kind: "like" });
    expect(off.interactionTargetId).toBe("target-pass-1");
    expect(off.viewerReacted).toBe(false);
    expect(off.reactionCount).toBe(2);
  });

  it("toggleComment solo afecta al comentario indicado", () => {
    const r = interactionReducer(base, { type: "toggleComment", id: "c2", kind: "like" });
    const c1 = r.comments.find((c) => c.id === "c1")!;
    const c2 = r.comments.find((c) => c.id === "c2")!;
    expect(c2.interactionTargetId).toBe("target-comment-1");
    expect(c1.viewerReacted).toBe(false); // intacto
    expect(c2.viewerReacted).toBe(false); // estaba true → false
    expect(c2.reactionCount).toBe(2); // 3 → 2
  });

  it("addComment añade y sube commentCount (no ligado a comments.length)", () => {
    const nuevo = comment({
      id: "opt",
      interactionTargetId: "optimistic-comment-target",
      body: "nuevo",
      isOwn: true,
    });
    const r = interactionReducer(base, { type: "addComment", comment: nuevo });
    expect(r.comments).toHaveLength(3);
    expect(r.comments.at(-1)!.id).toBe("opt");
    expect(r.comments.at(-1)!.interactionTargetId).toBe("optimistic-comment-target");
    expect(r.interactionTargetId).toBe("target-pass-1");
    expect(r.commentCount).toBe(6);
  });

  it("deleteComment quita y baja commentCount", () => {
    const r = interactionReducer(base, { type: "deleteComment", id: "c1" });
    expect(r.comments.map((c) => c.id)).toEqual(["c2"]);
    expect(r.comments[0].interactionTargetId).toBe("target-comment-1");
    expect(r.interactionTargetId).toBe("target-pass-1");
    expect(r.commentCount).toBe(4);
  });
});
