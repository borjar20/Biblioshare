import { describe, expect, it } from "vitest";
import { isSamePersonName, authorListMatchesName } from "./person-name";

describe("person identity for catalog matching", () => {
  it.each([
    ["Alexandre Dumas", "Alexandre Dumas hijo"],
    ["Alexandre Dumas padre", "Alexandre Dumas hijo"],
    ["John Smith", "John Smith Jr."],
    ["John Smith II", "John Smith III"],
    ["Ana", "Susana Fortes"],
    ["—", "Brandon Sanderson"],
    ["...", "..."],
    ["Kevin J. Anderson", "Kevin R. Anderson"],
    ["J. R. R. Tolkien", "John Ronald Christopher Tolkien"],
    ["J. Tolkien", "John Ronald Reuel Tolkien"],
  ])("keeps distinct or unknown identities apart: %s / %s", (a, b) => {
    expect(isSamePersonName(a, b)).toBe(false);
    expect(isSamePersonName(b, a)).toBe(false);
  });
  it.each([
    ["Kevin J. Anderson", "Kevin Anderson"],
    ["Anderson, Kevin J.", "Kevin Anderson"],
    ["Ludwig van Beethoven", "Ludwig Beethoven"],
    ["José Saramago", "Jose Saramago"],
    ["John Smith, Jr.", "John Smith junior"],
    ["J. R. R. Tolkien", "John Ronald Reuel Tolkien"],
  ])("recognizes name formatting: %s / %s", (a, b) => {
    expect(isSamePersonName(a, b)).toBe(true);
    expect(isSamePersonName(b, a)).toBe(true);
  });
  it("handles contributor lists and inverted names without matching a fragment", () => {
    expect(authorListMatchesName("Brandon Sanderson, Rafael Marín", "Brandon Sanderson")).toBe(true);
    expect(authorListMatchesName("Anderson, Kevin J.", "Kevin Anderson")).toBe(true);
    expect(authorListMatchesName("Alexandre Dumas hijo, Rafael Marín", "Alexandre Dumas")).toBe(false);
    expect(authorListMatchesName("Anderson, Kevin J.", "Anderson")).toBe(false);
  });
});
