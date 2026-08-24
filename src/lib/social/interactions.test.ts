import { expect, test } from "vitest";
import {
  anyViewerReacted,
  emptyReactions,
  tallyOf,
  totalReactions,
  type ReactionsByEmoji,
} from "./interactions";

test("emptyReactions arranca vacío: el mapa es disperso, no un registro de claves fijas", () => {
  expect(emptyReactions()).toEqual({});
});

test("tallyOf inventa un cero para el emoji ausente en vez de devolver undefined", () => {
  const reactions: ReactionsByEmoji = { "🔥": { count: 2, viewerReacted: true } };
  expect(tallyOf(reactions, "🔥")).toEqual({ count: 2, viewerReacted: true });
  expect(tallyOf(reactions, "❤️")).toEqual({ count: 0, viewerReacted: false });
  expect(tallyOf(emptyReactions(), "❤️")).toEqual({ count: 0, viewerReacted: false });
});

test("totalReactions y anyViewerReacted se derivan del mapa entero", () => {
  const reactions: ReactionsByEmoji = {
    "🔥": { count: 2, viewerReacted: false },
    "❤️": { count: 3, viewerReacted: true },
  };
  expect(totalReactions(reactions)).toBe(5);
  expect(anyViewerReacted(reactions)).toBe(true);
  expect(totalReactions(emptyReactions())).toBe(0);
  expect(anyViewerReacted(emptyReactions())).toBe(false);
});
