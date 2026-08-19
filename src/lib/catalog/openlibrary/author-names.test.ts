import { describe, expect, it } from "vitest";
import { pickDisplayName } from "./author-names";

describe("pickDisplayName", () => {
  it("prefiere la forma latina cuando el nombre canónico no lo es", () => {
    // /authors/OL22242A.json real
    const result = pickDisplayName({
      name: "Фёдор Достоевский",
      personal_name: "Fyodor Mikhaylovich Dostoyevsky",
      alternate_names: ["Fyodor Dostoyevsky", "Dostoievski"],
    });

    expect(result).toEqual({
      name: "Fyodor Mikhaylovich Dostoyevsky",
      aliases: ["Фёдор Достоевский", "Fyodor Dostoyevsky", "Dostoievski"],
    });
  });

  it("recorta el punto final que Open Library deja pegado", () => {
    // /authors/OL22242A real: Homero, con el punto pegado tal cual lo devuelve OL
    const result = pickDisplayName({ name: "Όμηρος", personal_name: "Homer." });

    expect(result?.name).toBe("Homer");
    expect(result?.aliases).toEqual(["Όμηρος"]);
  });

  it("descarta al autor sin ninguna forma latina", () => {
    // /authors/OL7388009A.json real: el duplicado cirílico de Frank Herbert en
    // el work de Dune. Stub sin personal_name ni alternate_names.
    expect(pickDisplayName({ name: "Френк Герберт" })).toBeNull();
  });

  it("con el canónico ya latino, no inventa alias de más", () => {
    expect(pickDisplayName({ name: "Marc Simonetti" })).toEqual({
      name: "Marc Simonetti",
      aliases: [],
    });
  });

  it("no repite el nombre visible entre los alias ni duplica grafías", () => {
    const result = pickDisplayName({
      name: "Frank Herbert",
      personal_name: "Frank Herbert",
      alternate_names: ["Frank Herbert", "Френк Герберт"],
    });

    expect(result).toEqual({ name: "Frank Herbert", aliases: ["Френк Герберт"] });
  });

  it("sin ningún candidato utilizable devuelve null", () => {
    expect(pickDisplayName({})).toBeNull();
    expect(pickDisplayName({ name: "   " })).toBeNull();
    expect(pickDisplayName({ name: "1234" })).toBeNull();
  });

  it("corta la lista de alias para no guardar ruido sin fin", () => {
    const many = Array.from({ length: 40 }, (_, i) => `Alias ${i}`);
    const result = pickDisplayName({ name: "Autor Prolífico", alternate_names: many });

    expect(result?.aliases).toHaveLength(20);
    expect(result?.aliases[0]).toBe("Alias 0");
  });
});
