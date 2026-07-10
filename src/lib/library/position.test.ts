import { describe, it, expect } from "vitest";
import { parsePosition, formatPosition } from "./position";

describe("parsePosition", () => {
  it("libro: página válida y formato conocido", () => {
    expect(parsePosition("book", { page: 42, format: "hardcover" })).toEqual({
      page: 42,
      format: "hardcover",
    });
  });

  it("libro: descarta página negativa y formato desconocido", () => {
    expect(parsePosition("book", { page: -3, format: "e-ink" })).toEqual({});
  });

  it("serie: temporada/episodio válidos", () => {
    expect(parsePosition("series", { season: 2, episode: 5 })).toEqual({
      season: 2,
      episode: 5,
    });
  });

  it("serie: descarta si falta alguno o es negativo", () => {
    expect(parsePosition("series", { season: 1 })).toEqual({});
    expect(parsePosition("series", { season: -1, episode: 2 })).toEqual({});
  });

  it("película y JSONB no-objeto → posición vacía", () => {
    expect(parsePosition("movie", { page: 5 })).toEqual({});
    expect(parsePosition("book", null)).toEqual({});
    expect(parsePosition("book", "garbage")).toEqual({});
  });
});

describe("formatPosition", () => {
  it("libro con página y formato", () => {
    expect(formatPosition("book", { page: 100, format: "paperback" })).toBe(
      "Pág. 100 · Bolsillo"
    );
  });

  it("serie como TxEy", () => {
    expect(formatPosition("series", { season: 3, episode: 7 })).toBe("T3E7");
  });

  it("posición vacía → null", () => {
    expect(formatPosition("book", {})).toBeNull();
    expect(formatPosition("movie", {})).toBeNull();
  });
});
