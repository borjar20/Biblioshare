import { describe, expect, it } from "vitest";
import {
  capReached,
  orderedReactions,
  summarize,
  viewerReactionCount,
} from "./reaction-display";
import { emptyReactions, type ReactionsByEmoji } from "./interactions";

const reactions: ReactionsByEmoji = {
  "🔥": { count: 1, viewerReacted: false },
  "❤️": { count: 5, viewerReacted: true },
  "😂": { count: 1, viewerReacted: false },
  "👏": { count: 3, viewerReacted: false },
};

describe("orderedReactions", () => {
  it("ordena por recuento descendente", () => {
    expect(orderedReactions(reactions).map((r) => r.emoji)).toEqual(["❤️", "👏", "🔥", "😂"]);
  });

  // Sin desempate estable, dos emojis empatados bailan entre renders. El
  // desempate es el orden de INSERCIÓN del mapa, que es el de primera
  // aparición porque la consulta va ordenada por created_at.
  it("en empate respeta el orden de primera aparición", () => {
    const empate: ReactionsByEmoji = {
      "😂": { count: 2, viewerReacted: false },
      "🔥": { count: 2, viewerReacted: false },
    };
    expect(orderedReactions(empate).map((r) => r.emoji)).toEqual(["😂", "🔥"]);
    const alReves: ReactionsByEmoji = {
      "🔥": { count: 2, viewerReacted: false },
      "😂": { count: 2, viewerReacted: false },
    };
    expect(orderedReactions(alReves).map((r) => r.emoji)).toEqual(["🔥", "😂"]);
  });

  it("de un mapa vacío saca una lista vacía", () => {
    expect(orderedReactions(emptyReactions())).toEqual([]);
  });
});

describe("summarize", () => {
  it("corta en 3 pero el total cuenta todo", () => {
    const { top, total, viewerReacted } = summarize(reactions);
    expect(top.map((r) => r.emoji)).toEqual(["❤️", "👏", "🔥"]);
    expect(total).toBe(10);
    expect(viewerReacted).toBe(true);
  });

  it("acepta otro tope", () => {
    expect(summarize(reactions, 1).top.map((r) => r.emoji)).toEqual(["❤️"]);
  });

  it("sin reacciones da total 0 y nada arriba", () => {
    expect(summarize(emptyReactions())).toEqual({ top: [], total: 0, viewerReacted: false });
  });
});

describe("tope por persona", () => {
  it("cuenta solo las del viewer", () => {
    expect(viewerReactionCount(reactions)).toBe(1);
  });

  it("capReached avisa al llegar a 6 propias, no a 6 totales", () => {
    expect(capReached(reactions)).toBe(false);
    const seis: ReactionsByEmoji = Object.fromEntries(
      ["❤️", "📖", "😱", "🔥", "😂", "👏"].map((emoji) => [
        emoji,
        { count: 1, viewerReacted: true },
      ]),
    );
    expect(viewerReactionCount(seis)).toBe(6);
    expect(capReached(seis)).toBe(true);
  });
});
