import { describe, expect, it } from "vitest";
import { isAllowedCoverHost, capOfficialCovers } from "./official-covers";

describe("isAllowedCoverHost", () => {
  it("acepta los CDN oficiales por https", () => {
    expect(isAllowedCoverHost("https://image.tmdb.org/t/p/w342/x.jpg")).toBe(true);
    expect(isAllowedCoverHost("https://covers.openlibrary.org/b/id/1-L.jpg")).toBe(true);
    // Google Books entra en la allowlist como enriquecedor de portada cuando
    // Open Library no la da (decisiones.md, 2026-08-27).
    expect(isAllowedCoverHost("https://books.google.com/books/content?id=x&zoom=2")).toBe(true);
  });

  it("la allowlist de Google Books es por HOST, no por ruta (matiz asumido a propósito)", () => {
    // Consecuencia registrada en decisiones.md (2026-08-27): cualquier ruta
    // bajo el host pasa, no solo /books/content.
    expect(isAllowedCoverHost("https://books.google.com/cualquier/otra/ruta.jpg")).toBe(true);
    // Pero no otros subdominios de Google: la entrada es exactamente ese host.
    expect(isAllowedCoverHost("https://google.com/x.jpg")).toBe(false);
    expect(isAllowedCoverHost("https://books.googleusercontent.com/x.jpg")).toBe(false);
  });

  it("rechaza otros hosts, http y basura", () => {
    expect(isAllowedCoverHost("https://evil.example.com/x.jpg")).toBe(false);
    expect(isAllowedCoverHost("http://image.tmdb.org/x.jpg")).toBe(false);
    expect(isAllowedCoverHost("http://books.google.com/books/content?id=x")).toBe(false);
    expect(isAllowedCoverHost("no-soy-una-url")).toBe(false);
    expect(isAllowedCoverHost("")).toBe(false);
  });

  it("rechaza vectores de bypass de allowlist y normaliza mayúsculas", () => {
    expect(isAllowedCoverHost("https://image.tmdb.org.evil.com/x.jpg")).toBe(false);
    expect(isAllowedCoverHost("https://evil.com@image.tmdb.org/x.jpg")).toBe(true);
    expect(isAllowedCoverHost("https://image.tmdb.org@evil.com/x.jpg")).toBe(false);
    expect(isAllowedCoverHost("https://books.google.com.evil.com/x.jpg")).toBe(false);
    expect(isAllowedCoverHost("https://evil.com@books.google.com/x.jpg")).toBe(true);
    expect(isAllowedCoverHost("https://books.google.com@evil.com/x.jpg")).toBe(false);
    expect(isAllowedCoverHost("https://IMAGE.TMDB.ORG/x.jpg")).toBe(true);
    expect(isAllowedCoverHost("https://BOOKS.GOOGLE.COM/x.jpg")).toBe(true);
    expect(isAllowedCoverHost("//covers.openlibrary.org/x.jpg")).toBe(false);
  });
});

describe("capOfficialCovers", () => {
  it("deduplica conservando el orden", () => {
    expect(capOfficialCovers(["a", "b", "a", "c"])).toEqual(["a", "b", "c"]);
  });

  it("corta en 12", () => {
    const many = Array.from({ length: 30 }, (_, i) => `u${i}`);
    expect(capOfficialCovers(many)).toHaveLength(12);
  });
});
