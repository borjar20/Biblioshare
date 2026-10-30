import { describe, expect, it } from "vitest";
import { coverInitials } from "./cover-initials";
import { coverKey, toProfileCover } from "./types";

describe("coverInitials", () => {
  it("toma la inicial de las dos primeras palabras", () => {
    expect(coverInitials("El imperio final")).toBe("EI");
  });
  it("ignora dígitos y signos", () => {
    expect(coverInitials("2001: Odisea")).toBe("O");
  });
  it("con una sola palabra devuelve una letra", () => {
    expect(coverInitials("Rayuela")).toBe("R");
  });
  it("sin letras usa el primer carácter no blanco", () => {
    expect(coverInitials("  1984 ")).toBe("1");
  });
  it("vacío devuelve ?", () => {
    expect(coverInitials("   ")).toBe("?");
  });
});

describe("toProfileCover", () => {
  it("añade el enlace a la ficha", () => {
    const c = toProfileCover({ itemType: "movie", itemId: "m1", title: "Pearl", coverUrl: null });
    expect(c).toEqual({ itemType: "movie", itemId: "m1", title: "Pearl", coverUrl: null, href: "/pelicula/m1" });
    expect(coverKey(c)).toBe("movie:m1");
  });
});
