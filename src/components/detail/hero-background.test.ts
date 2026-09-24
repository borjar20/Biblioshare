import { describe, expect, it } from "vitest";
import { pickHeroBackground } from "./hero-background";

describe("pickHeroBackground", () => {
  it("con backdrop, el backdrop manda aunque haya portada", () => {
    expect(
      pickHeroBackground({ backdropUrl: "https://b/x.jpg", coverUrl: "https://c/y.jpg" }),
    ).toEqual({ kind: "backdrop", src: "https://b/x.jpg" });
  });

  it("sin backdrop (todos los libros), cae a la portada", () => {
    expect(pickHeroBackground({ backdropUrl: null, coverUrl: "https://c/y.jpg" })).toEqual({
      kind: "cover",
      src: "https://c/y.jpg",
    });
  });

  it("una cadena vacía cuenta como ausente", () => {
    expect(pickHeroBackground({ backdropUrl: "", coverUrl: "" })).toEqual({ kind: "none" });
  });

  it("sin nada (alta manual recién creada), degradado del acento", () => {
    expect(pickHeroBackground({ backdropUrl: null, coverUrl: null })).toEqual({ kind: "none" });
  });
});
