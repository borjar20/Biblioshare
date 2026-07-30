import { describe, expect, it } from "vitest";
import { GenreTag } from "./genre-tag";

// No usamos @testing-library/react (no está instalada y el repo no configura
// jsdom/happy-dom; vitest corre en entorno node — ver rating-dots.test.ts como
// precedente de tests de lógica pura sin DOM). En vez de renderizar, llamamos
// a GenreTag como función normal y inspeccionamos el elemento React devuelto:
// su `.type` (string "span" vs. el componente Link) y sus `.props`.
describe("GenreTag", () => {
  it("label canónica → elemento Link a /genero/[slug]", () => {
    const el = GenreTag({ label: "Ciencia ficción" });
    expect(el.type).not.toBe("span");
    expect(el.props.href).toBe("/genero/ciencia-ficcion");
  });

  it("label no canónica → span sin href", () => {
    const el = GenreTag({ label: "Basura vieja" });
    expect(el.type).toBe("span");
    expect(el.props.href).toBeUndefined();
    expect(el.props.children).toContain("Basura vieja");
  });
});
