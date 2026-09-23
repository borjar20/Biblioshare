import { describe, it, expect } from "vitest";
import { isHardToRead, needsEnglish, pickReadable } from "./readable-title";

describe("isHardToRead", () => {
  it.each(["미쓰 홍당무", "Жмурки", "名探偵コナン 隻眼の残像", "Ο Θίασος", "이정현 (Lee Jung Hyun) - V"])(
    "%s es ilegible",
    (t) => expect(isHardToRead(t)).toBe(true)
  );

  it.each([
    "El viaje de Chihiro",
    "La haine",
    "Agárralo como puedas 33⅓: El insulto final",
    "AL’S BRAIN: ‘Weird Al’ Yankovic",
    "Łódź 1999",
    "",
  ])("%s se lee", (t) => expect(isHardToRead(t)).toBe(false));

  it("null no es ilegible", () => expect(isHardToRead(null)).toBe(false));
});

describe("pickReadable", () => {
  it("cae al título inglés si el español es ilegible", () => {
    expect(
      pickReadable({ title: "미쓰 홍당무", synopsis: null }, { title: "Crush and Blush", overview: "Mi-sook…" })
    ).toEqual({ title: "Crush and Blush", synopsis: "Mi-sook…" });
  });

  it("no toca un título latino aunque haya inglés (una francesa sin traducir)", () => {
    expect(
      pickReadable({ title: "La haine", synopsis: "Tres amigos…" }, { title: "Hate", overview: "Three…" })
    ).toEqual({ title: "La haine", synopsis: "Tres amigos…" });
  });

  it("se queda el original si el inglés tampoco se lee", () => {
    expect(pickReadable({ title: "Жмурки", synopsis: null }, { title: "Жмурки", overview: "" })).toEqual({
      title: "Жмурки",
      synopsis: null,
    });
  });

  it("sin versión inglesa devuelve la española", () => {
    expect(pickReadable({ title: "심판", synopsis: " " }, null)).toEqual({ title: "심판", synopsis: null });
  });
});

describe("needsEnglish", () => {
  it("pide inglés si el título es ilegible o falta la sinopsis", () => {
    expect(needsEnglish({ title: "심판", synopsis: "x" })).toBe(true);
    expect(needsEnglish({ title: "Origen", synopsis: "" })).toBe(true);
    expect(needsEnglish({ title: "Origen", synopsis: "Un ladrón…" })).toBe(false);
  });
});
