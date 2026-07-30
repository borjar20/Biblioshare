import { describe, it, expect } from "vitest";
import { extractMentions } from "./mentions";

describe("extractMentions", () => {
  it("extracts a simple mention", () => {
    expect(extractMentions("hola @borjar20 qué tal")).toEqual(["borjar20"]);
  });
  it("lowercases and dedupes", () => {
    expect(extractMentions("@Borja y @borja")).toEqual(["borja"]);
  });
  it("ignores @ inside emails", () => {
    expect(extractMentions("escribe a foo@borjar20.com")).toEqual([]);
  });
  it("ignores @ inside paths", () => {
    expect(extractMentions("ver /u/@borja")).toEqual([]);
  });
  it("matches at start of string", () => {
    expect(extractMentions("@borja hola")).toEqual(["borja"]);
  });
  it("matches after punctuation", () => {
    expect(extractMentions("gracias,@borja!")).toEqual(["borja"]);
  });
  it("rejects too-short usernames (<3)", () => {
    expect(extractMentions("@ab @abc")).toEqual(["abc"]);
  });
  it("caps at 3-30 chars", () => {
    const long = "a".repeat(31);
    expect(extractMentions(`@${long}`)).toEqual([long.slice(0, 30)]);
  });
  it("caps total mentions at 10", () => {
    const text = Array.from({ length: 15 }, (_, i) => `@user_${i}`).join(" ");
    expect(extractMentions(text)).toHaveLength(10);
  });
  it("returns empty for no mentions", () => {
    expect(extractMentions("sin menciones aquí")).toEqual([]);
  });
});
