import { describe, it, expect } from "vitest";
import { canonicalIsbn13, normalizeIsbn } from "./isbn";

describe("normalizeIsbn", () => {
  it("acepta ISBN-13 con y sin separadores", () => {
    expect(normalizeIsbn("9780441172719")).toBe("9780441172719");
    expect(normalizeIsbn("978-0-441-17271-9")).toBe("9780441172719");
    expect(normalizeIsbn(" 978 0441 172719 ")).toBe("9780441172719");
  });

  it("acepta ISBN-10 y normaliza la X final a mayúscula", () => {
    expect(normalizeIsbn("0441172717")).toBe("0441172717");
    expect(normalizeIsbn("155404295x")).toBe("155404295X");
  });

  it("rechaza texto y longitudes inválidas", () => {
    expect(normalizeIsbn("la casa de los espíritus")).toBeNull();
    expect(normalizeIsbn("12345")).toBeNull();
    expect(normalizeIsbn("97804411727190")).toBeNull(); // 14 dígitos
    expect(normalizeIsbn("")).toBeNull();
  });
});

describe("canonicalIsbn13", () => {
  it("convierte un ISBN-10 válido a su ISBN-13 equivalente", () => {
    expect(canonicalIsbn13("84-339-2042-1")).toBe("9788433920423");
  });

  it("tolera NBSP y BOM alrededor, pero no U+0085 ni espacios internos distintos del ASCII", () => {
    expect(canonicalIsbn13("\u00a08433920421\u00a0")).toBe("9788433920423");
    expect(canonicalIsbn13("\ufeff8433920421\ufeff")).toBe("9788433920423");
    expect(canonicalIsbn13("\u00858433920421\u0085")).toBeNull();
    expect(canonicalIsbn13("8433\u00a0920421")).toBeNull();
  });

  it("convierte la X válida sin aceptar el ejemplo con checksum incorrecto de #906", () => {
    expect(canonicalIsbn13("155404295X")).toBe("9781554042951");
    expect(canonicalIsbn13("843392042X")).toBeNull();
  });

  it("conserva ISBN-13 válidos, incluido el prefijo 979", () => {
    expect(canonicalIsbn13("978-84-339-2042-3")).toBe("9788433920423");
    expect(canonicalIsbn13("979-123456789-6")).toBe("9791234567896");
  });

  it("no crea claves canónicas para ISBN con checksum inválido", () => {
    expect(canonicalIsbn13("8433920422")).toBeNull();
    expect(canonicalIsbn13("9788433920424")).toBeNull();
  });
});
