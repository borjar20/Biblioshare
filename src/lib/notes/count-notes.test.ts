import { describe, expect, it } from "vitest";
import { countNotes } from "./get-notes";
import type { Note } from "./types";

function note(partial: Partial<Note>): Note {
  return {
    id: "x",
    itemType: "book",
    itemId: "i",
    kind: "note",
    body: "b",
    position: {},
    isFavorite: false,
    tags: [],
    isSpoiler: false,
    isPublic: false,
    createdAt: "2026-07-17",
    itemTitle: null,
    ...partial,
  };
}

describe("countNotes", () => {
  it("cuenta citas, notas y favoritas por separado", () => {
    const notes = [
      note({ kind: "quote", isFavorite: true }),
      note({ kind: "quote" }),
      note({ kind: "note", isFavorite: true }),
      note({ kind: "note" }),
    ];
    expect(countNotes(notes)).toEqual({
      quotes: 2,
      notes: 2,
      favorites: 2,
      total: 4,
    });
  });

  it("sin notas, todo a cero", () => {
    expect(countNotes([])).toEqual({ quotes: 0, notes: 0, favorites: 0, total: 0 });
  });
});
