import { describe, expect, it } from "vitest";
import { esColocable } from "./placement";

describe("esColocable", () => {
  it("es true para libre y anclado (los que se recolocan por ventana)", () => {
    expect(esColocable("libre")).toBe(true);
    expect(esColocable("anclado")).toBe(true);
  });
  it("es false para fijo y sin clasificar", () => {
    expect(esColocable("fijo")).toBe(false);
    expect(esColocable(null)).toBe(false);
  });
});
