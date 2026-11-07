import { describe, expect, it } from "vitest";
import { openingLine, savedLine } from "./session-lines";

describe("openingLine", () => {
  it("libro con página: recuerda por dónde iba", () => {
    expect(openingLine("book", 180)).toEqual({ key: "openBook", values: { page: 180 } });
  });
  it("libro sin empezar y serie", () => {
    expect(openingLine("book", null).key).toBe("openFirst");
    expect(openingLine("book", 0).key).toBe("openFirst");
    expect(openingLine("series", null).key).toBe("openSeries");
  });
});

describe("savedLine", () => {
  const base = { itemType: "book" as const, episodes: 0 };
  it("terminado manda", () => {
    expect(savedLine({ ...base, fromPage: 300, toPage: 412, total: 412 }).key).toBe("savedFinished");
  });
  it("cruzar la mitad", () => {
    expect(savedLine({ ...base, fromPage: 180, toPage: 214, total: 412 })).toEqual({ key: "savedHalf", values: { delta: 34 } });
  });
  it("cerca del final: ≤ 30 páginas", () => {
    expect(savedLine({ ...base, fromPage: 370, toPage: 382, total: 412 })).toEqual({ key: "savedNearEnd", values: { delta: 12, remaining: 30 } });
  });
  it("páginas sin hito, sin total y sin avance", () => {
    expect(savedLine({ ...base, fromPage: 10, toPage: 30, total: 412 })).toEqual({ key: "savedPages", values: { delta: 20 } });
    expect(savedLine({ ...base, fromPage: 10, toPage: 30, total: null }).key).toBe("savedPages");
    expect(savedLine({ ...base, fromPage: 30, toPage: 30, total: 412 }).key).toBe("savedGeneric");
  });
  it("series: episodios marcados", () => {
    expect(savedLine({ itemType: "series", fromPage: null, toPage: null, total: null, episodes: 3 })).toEqual({ key: "savedEpisodes", values: { count: 3 } });
    expect(savedLine({ itemType: "series", fromPage: null, toPage: null, total: null, episodes: 0 }).key).toBe("savedGeneric");
  });
});
