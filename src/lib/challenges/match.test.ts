import { describe, expect, it } from "vitest";
import { countForChallenge, itemMatchesChallenge, type CompletedItem } from "./match";
import type { Challenge } from "./types";

function challenge(overrides: Partial<Challenge>): Challenge {
  return {
    id: "c",
    name: "Reto",
    itemType: null,
    targetCount: 5,
    criteria: {},
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    archivedAt: null,
    ...overrides,
  };
}

function item(overrides: Partial<CompletedItem>): CompletedItem {
  return {
    itemType: "book",
    itemId: "i",
    finishedOn: "2026-06-15",
    genres: [],
    sagaIds: [],
    ...overrides,
  };
}

describe("itemMatchesChallenge", () => {
  it("counts any finished item when the challenge has no type and no criteria", () => {
    expect(itemMatchesChallenge(item({}), challenge({}))).toBe(true);
  });

  it("excludes items finished outside the date window", () => {
    expect(itemMatchesChallenge(item({ finishedOn: "2025-12-31" }), challenge({}))).toBe(false);
    expect(itemMatchesChallenge(item({ finishedOn: "2027-01-01" }), challenge({}))).toBe(false);
    expect(itemMatchesChallenge(item({ finishedOn: "2026-01-01" }), challenge({}))).toBe(true);
  });

  it("filters by item type when the challenge is typed", () => {
    const movies = challenge({ itemType: "movie" });
    expect(itemMatchesChallenge(item({ itemType: "movie" }), movies)).toBe(true);
    expect(itemMatchesChallenge(item({ itemType: "book" }), movies)).toBe(false);
  });

  it("matches a genre criterion case-insensitively", () => {
    const scifi = challenge({ criteria: { genre: "Ciencia ficción" } });
    expect(itemMatchesChallenge(item({ genres: ["ciencia ficción", "Aventuras"] }), scifi)).toBe(true);
    expect(itemMatchesChallenge(item({ genres: ["Drama"] }), scifi)).toBe(false);
  });

  it("matches a saga criterion by membership", () => {
    const saga = challenge({ criteria: { sagaId: "saga-1" } });
    expect(itemMatchesChallenge(item({ sagaIds: ["saga-1"] }), saga)).toBe(true);
    expect(itemMatchesChallenge(item({ sagaIds: ["saga-2"] }), saga)).toBe(false);
  });

  it("ANDs multiple criteria together", () => {
    const both = challenge({ itemType: "book", criteria: { genre: "Fantasía", sagaId: "s" } });
    expect(
      itemMatchesChallenge(item({ itemType: "book", genres: ["Fantasía"], sagaIds: ["s"] }), both)
    ).toBe(true);
    expect(
      itemMatchesChallenge(item({ itemType: "book", genres: ["Fantasía"], sagaIds: ["other"] }), both)
    ).toBe(false);
  });
});

describe("countForChallenge", () => {
  it("counts only the matching items", () => {
    const c = challenge({ itemType: "book" });
    const items = [
      item({ itemType: "book" }),
      item({ itemType: "movie" }),
      item({ itemType: "book", finishedOn: "2020-01-01" }),
      item({ itemType: "book" }),
    ];
    expect(countForChallenge(items, c)).toBe(2);
  });
});
