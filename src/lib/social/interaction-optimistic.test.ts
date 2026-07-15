import { describe, it, expect } from "vitest";
import { interactionReducer } from "./interaction-optimistic";
import type { InteractionComment, InteractionSummary } from "./interactions";

function comment(over: Partial<InteractionComment> = {}): InteractionComment {
  return {
    id: "c1",
    authorId: "u1",
    author: "Ana",
    initials: "AN",
    body: "hola",
    createdAt: "2026-07-15T00:00:00Z",
    isOwn: false,
    reactionCount: 0,
    viewerReacted: false,
    ...over,
  };
}

const base: InteractionSummary = {
  reactionCount: 2,
  viewerReacted: false,
  commentCount: 5, // capado: mayor que comments.length a propósito
  comments: [comment({ id: "c1" }), comment({ id: "c2", reactionCount: 3, viewerReacted: true })],
};

describe("interactionReducer", () => {
  it("toggleTarget suma/resta y hace ida y vuelta", () => {
    const on = interactionReducer(base, { type: "toggleTarget" });
    expect(on.viewerReacted).toBe(true);
    expect(on.reactionCount).toBe(3);
    const off = interactionReducer(on, { type: "toggleTarget" });
    expect(off.viewerReacted).toBe(false);
    expect(off.reactionCount).toBe(2);
  });

  it("toggleComment solo afecta al comentario indicado", () => {
    const r = interactionReducer(base, { type: "toggleComment", id: "c2" });
    const c1 = r.comments.find((c) => c.id === "c1")!;
    const c2 = r.comments.find((c) => c.id === "c2")!;
    expect(c1.viewerReacted).toBe(false); // intacto
    expect(c2.viewerReacted).toBe(false); // estaba true → false
    expect(c2.reactionCount).toBe(2); // 3 → 2
  });

  it("addComment añade y sube commentCount (no ligado a comments.length)", () => {
    const nuevo = comment({ id: "opt", body: "nuevo", isOwn: true });
    const r = interactionReducer(base, { type: "addComment", comment: nuevo });
    expect(r.comments).toHaveLength(3);
    expect(r.comments.at(-1)!.id).toBe("opt");
    expect(r.commentCount).toBe(6);
  });

  it("deleteComment quita y baja commentCount", () => {
    const r = interactionReducer(base, { type: "deleteComment", id: "c1" });
    expect(r.comments.map((c) => c.id)).toEqual(["c2"]);
    expect(r.commentCount).toBe(4);
  });
});
