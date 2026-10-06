import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NARRATOR_STATES, narratorSheet } from "./narrator";

describe("narradora", () => {
  it("existe un PNG por estado", () => {
    for (const s of NARRATOR_STATES) expect(existsSync(`public${narratorSheet(s).src.split("?")[0]}`)).toBe(true);
  });
  it("son los siete de la spec", () =>
    expect([...NARRATOR_STATES].sort()).toEqual(["binger", "cinephile", "explorer", "festive", "quiet", "reader", "social"]));
});
