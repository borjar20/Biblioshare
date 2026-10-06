import { describe, expect, it } from "vitest";
import { readEditorialForm } from "./editorial-form-data";
import { safeReleaseUrl } from "./release-view";

function form(changes: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ title: "El nuevo libro", sourceName: "Editorial", sourceUrl: "https://editorial.example/noticia",
    market: "ES", language: "es", modality: "book", datePrecision: "unknown", ...changes })) data.set(key, value);
  return data;
}

describe("entrada editorial con precisión real", () => {
  it.each(["unknown", "month", "year"])("guarda %s sin ISBN ni día inventado", (precision) => {
    const value = precision === "month" ? "2027-02" : precision === "year" ? "2027" : "2027-02-22";
    const result = readEditorialForm(form({ datePrecision: precision, dateValue: value }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.input).toMatchObject({ isbn: null, datePrecision: precision, dateValue: precision === "unknown" ? null : value, status: "draft" });
  });
  it("un día imposible conserva error interpretable en el campo fecha", () => {
    expect(readEditorialForm(form({ datePrecision: "day", dateValue: "2027-02-30" }))).toEqual({ ok: false, errors: { dateValue: "invalid" } });
  });
  it("un mes completo no satisface una fecha de precisión anual", () => {
    expect(readEditorialForm(form({ datePrecision: "year", dateValue: "2027-02" }))).toEqual({ ok: false, errors: { dateValue: "invalid" } });
  });
  it("fuente y título son obligatorios, el ISBN declarado debe ser válido", () => {
    expect(readEditorialForm(form({ title: "", sourceUrl: "", isbn: "123456789" }))).toEqual({ ok: false, errors: { title: "required", sourceUrl: "required", isbn: "invalid" } });
  });
  it("la primera traducción al castellano exige edición castellana", () => {
    expect(readEditorialForm(form({ modality: "book_translation", language: "fr" }))).toEqual({ ok: false, errors: { language: "invalid" } });
    expect(readEditorialForm(form({ modality: "book_translation", language: "es-ES" })).ok).toBe(true);
  });
  it.each(["javascript:alert(1)", "data:text/html,hello", "https://actor:secret@editorial.example", "/internal", "http://editorial.example"])("no publica enlace inseguro %s", (url) => {
    expect(safeReleaseUrl(url)).toBeNull();
    expect(readEditorialForm(form({ sourceUrl: url }))).toEqual({ ok: false, errors: { sourceUrl: "invalid" } });
  });
});
