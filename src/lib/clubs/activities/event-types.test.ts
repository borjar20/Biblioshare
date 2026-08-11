import { describe, it, expect } from "vitest";
import { parseEventConfig } from "./event-types";

describe("parseEventConfig", () => {
  it("encuentro: config vacío pase lo que pase", () => {
    expect(parseEventConfig("encuentro", null)).toEqual({});
    expect(parseEventConfig("encuentro", { foo: 1 })).toEqual({});
  });

  it("lanzamiento: normaliza item/releaseType/platform/region/allDay", () => {
    const c = parseEventConfig("lanzamiento", {
      item: { itemType: "series", itemId: "abc" },
      releaseType: "estreno_temporada",
      platform: "netflix",
      region: "España",
      allDay: true,
    });
    expect(c).toEqual({
      item: { itemType: "series", itemId: "abc" },
      releaseType: "estreno_temporada",
      platform: "netflix",
      region: "España",
      allDay: true,
    });
  });

  it("lanzamiento: tolera forma incompleta / basura", () => {
    const c = parseEventConfig("lanzamiento", { item: { itemType: "book" } }); // sin itemId
    expect(c).toEqual({ item: null, releaseType: null, allDay: false });
  });

  it("fecha_destacada: filtra relaciones inválidas y conserva el orden", () => {
    const c = parseEventConfig("fecha_destacada", {
      relations: [
        { kind: "item", itemType: "book", itemId: "b1" },
        { kind: "activity", activityId: "a1" },
        { kind: "item", itemType: "book" }, // inválida: sin itemId
        { kind: "bogus" },                  // inválida
      ],
      allDay: true,
    });
    expect(c).toEqual({
      relations: [
        { kind: "item", itemType: "book", itemId: "b1" },
        { kind: "activity", activityId: "a1" },
      ],
      allDay: true,
    });
  });

  it("fecha_destacada: sin relaciones", () => {
    expect(parseEventConfig("fecha_destacada", null)).toEqual({ relations: [], allDay: true });
  });
});
