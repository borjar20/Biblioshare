import { describe, it, expect } from "vitest";
import { normalizeIsbn } from "./isbn";

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
