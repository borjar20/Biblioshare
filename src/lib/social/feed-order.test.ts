import { describe, expect, it } from "vitest";
import {
  compareEntries,
  isAfterCursor,
  makeCursor,
  parseCursor,
  type FeedCursor,
  type OrderableEntry,
} from "./feed-order";

// Un alta de las 00:01 y una reseña de las 23:00, ambas del mismo día. La
// reseña tiene eventDate date-only (finished_on es una columna `date`), que es
// justo lo que antes la hundía por debajo del alta.
const alta: OrderableEntry = {
  eventDate: "2026-08-01T00:01:00.000+00:00",
  sortDate: "2026-08-01T00:01:00.000+00:00",
  id: "passes:aaa",
};
const resena: OrderableEntry = {
  eventDate: "2026-08-01",
  sortDate: "2026-08-01T23:00:00.000+00:00",
  id: "diary_entries:bbb",
};

describe("compareEntries", () => {
  it("ordena por hora real dentro del día, no por granularidad de la fecha", () => {
    expect([alta, resena].sort(compareEntries)).toEqual([resena, alta]);
  });

  it("ordena por día antes que por hora", () => {
    const ayer: OrderableEntry = {
      eventDate: "2026-07-31",
      sortDate: "2026-07-31T23:59:00.000+00:00",
      id: "diary_entries:ccc",
    };
    expect([ayer, alta].sort(compareEntries)).toEqual([alta, ayer]);
  });

  it("desempata por id cuando día y hora coinciden", () => {
    const a = { ...alta, id: "passes:aaa" };
    const b = { ...alta, id: "passes:zzz" };
    expect([a, b].sort(compareEntries)).toEqual([b, a]);
  });
});

describe("cursor", () => {
  it("un cursor nuevo lleva día, hora e id", () => {
    expect(makeCursor(resena)).toBe(
      "2026-08-01~2026-08-01T23:00:00.000+00:00~diary_entries:bbb",
    );
  });

  it("parsea el cursor nuevo conservando los ids con separadores raros", () => {
    expect(parseCursor("2026-08-01~2026-08-01T23:00:00.000+00:00~x~y")).toEqual({
      day: "2026-08-01",
      sortDate: "2026-08-01T23:00:00.000+00:00",
      id: "x~y",
    });
  });

  it("un cursor legado (fecha~id) se marca sin hora, para no perder filas", () => {
    expect(parseCursor("2026-08-01~diary_entries:bbb")).toEqual({
      day: "2026-08-01",
      sortDate: null,
      id: "diary_entries:bbb",
    });
  });
});

describe("isAfterCursor", () => {
  it("excluye el propio evento del cursor", () => {
    expect(isAfterCursor(resena, parseCursor(makeCursor(resena)))).toBe(false);
  });

  it("incluye lo que va estrictamente después en el orden total", () => {
    expect(isAfterCursor(alta, parseCursor(makeCursor(resena)))).toBe(true);
  });

  it("excluye lo que va antes", () => {
    expect(isAfterCursor(resena, parseCursor(makeCursor(alta)))).toBe(false);
  });

  it("un cursor legado usa la comparación antigua (eventDate, id): no pierde ni repite", () => {
    const legado = parseCursor("2026-08-01~passes:aaa");
    // Con la semántica antigua, "2026-08-01" < "2026-08-01T00:01..." como
    // cadena, así que la reseña date-only iba DESPUÉS del alta.
    expect(isAfterCursor(resena, legado)).toBe(true);
    expect(isAfterCursor(alta, legado)).toBe(false);
  });
});

describe("recorrido completo de paginación", () => {
  it("sirve cada fila exactamente una vez con fechas de granularidad mezclada", () => {
    const all: OrderableEntry[] = [
      alta,
      resena,
      { eventDate: "2026-08-01", sortDate: "2026-08-01T12:00:00.000+00:00", id: "episode_watches:d" },
      { eventDate: "2026-07-31", sortDate: "2026-07-31T09:00:00.000+00:00", id: "passes:e" },
      { eventDate: "2026-07-31", sortDate: "2026-07-31T09:00:00.000+00:00", id: "passes:f" },
      { eventDate: "2026-07-30T22:00:00.000+00:00", sortDate: "2026-07-30T22:00:00.000+00:00", id: "passes:g" },
    ];
    const sorted = [...all].sort(compareEntries);

    const served: string[] = [];
    let cursor: string | null = null;
    const PAGE = 2;
    for (let guard = 0; guard < 10; guard++) {
      const parsed: FeedCursor | null = cursor ? parseCursor(cursor) : null;
      const fresh: OrderableEntry[] = parsed
        ? sorted.filter((e) => isAfterCursor(e, parsed))
        : sorted;
      const page: OrderableEntry[] = fresh.slice(0, PAGE);
      if (page.length === 0) break;
      served.push(...page.map((e) => e.id));
      cursor = page.length < PAGE ? null : makeCursor(page[page.length - 1]);
      if (cursor === null) break;
    }

    expect(served).toEqual(sorted.map((e) => e.id));
    expect(new Set(served).size).toBe(all.length);
  });
});
