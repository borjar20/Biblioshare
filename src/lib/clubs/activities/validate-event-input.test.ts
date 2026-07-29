import { describe, expect, it } from "vitest";
import {
  EVENT_DESCRIPTION_MAX,
  EVENT_TITLE_MAX,
  validateEventInput,
} from "./validate-event-input";

const base = { title: "Quedada de julio", startsOn: "2027-01-01" };

describe("validateEventInput", () => {
  it("devuelve el título recortado", () => {
    expect(validateEventInput({ ...base, title: "  Quedada  " })).toBe("Quedada");
  });

  it("rechaza un título vacío o solo espacios", () => {
    expect(() => validateEventInput({ ...base, title: "" })).toThrow("title_required");
    expect(() => validateEventInput({ ...base, title: "   " })).toThrow("title_required");
  });

  it("rechaza sin fecha: la RPC la exige y así no se paga el roundtrip", () => {
    expect(() => validateEventInput({ ...base, startsOn: "" })).toThrow("starts_on_required");
  });

  // El límite se mide sobre el título YA recortado, igual que el CHECK de la
  // tabla, que se aplica sobre el valor guardado (que es el recortado).
  it("acepta justo el límite de título y rechaza uno más", () => {
    expect(validateEventInput({ ...base, title: "a".repeat(EVENT_TITLE_MAX) })).toHaveLength(
      EVENT_TITLE_MAX,
    );
    expect(() => validateEventInput({ ...base, title: "a".repeat(EVENT_TITLE_MAX + 1) })).toThrow(
      "title_too_long",
    );
  });

  it("no cuenta los espacios de sobra del título contra el límite", () => {
    const conEspacios = ` ${"a".repeat(EVENT_TITLE_MAX)} `;
    expect(validateEventInput({ ...base, title: conEspacios })).toHaveLength(EVENT_TITLE_MAX);
  });

  it("acepta justo el límite de descripción y rechaza una más", () => {
    expect(
      validateEventInput({ ...base, description: "a".repeat(EVENT_DESCRIPTION_MAX) }),
    ).toBe(base.title);
    expect(() =>
      validateEventInput({ ...base, description: "a".repeat(EVENT_DESCRIPTION_MAX + 1) }),
    ).toThrow("description_too_long");
  });

  it("la descripción es opcional", () => {
    expect(validateEventInput({ ...base, description: undefined })).toBe(base.title);
  });

  // El orden importa: un formulario sin título NI fecha debe quejarse del
  // título, que es el campo que el usuario tiene delante primero.
  it("con varios campos mal, avisa primero del título", () => {
    expect(() => validateEventInput({ title: "", startsOn: "" })).toThrow("title_required");
  });
});
