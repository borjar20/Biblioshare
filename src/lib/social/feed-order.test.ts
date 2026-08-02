import { describe, expect, it } from "vitest";
import {
  addedUpperBound,
  compareEntries,
  isAfterCursor,
  makeCursor,
  parseCursor,
  timestampUpperBound,
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
      legacyFullDate: null,
    });
  });

  it("un cursor legado (fecha~id) se marca sin hora, para no perder filas", () => {
    expect(parseCursor("2026-08-01~diary_entries:bbb")).toEqual({
      day: "2026-08-01",
      sortDate: null,
      id: "diary_entries:bbb",
      legacyFullDate: "2026-08-01",
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

  it("un cursor legado con hora de precisión no trunca la fecha al comparar (regresión #critical)", () => {
    // Cursor legado emitido por un evento con eventDate de precisión horaria.
    const legado = parseCursor("2026-08-01T12:00:00.000+00:00~passes:aaa");
    const z: OrderableEntry = {
      eventDate: "2026-08-01",
      sortDate: "2026-08-01T00:00:00.000+00:00",
      id: "zzz_review",
    };
    // Semántica antigua: "2026-08-01" (entry) vs "2026-08-01T12:00:00.000+00:00"
    // (cursor) como cadenas completas -> "2026-08-01" < "...T12:00..." -> true.
    // Si `day` se trunca a 10 caracteres antes de comparar, ambas cadenas
    // quedan iguales y la fila se pierde silenciosamente.
    expect(isAfterCursor(z, legado)).toBe(true);
  });
});

describe("addedUpperBound", () => {
  // La cota de la fuente `added` tiene que ser un SUPERCONJUNTO de lo que
  // acepta `isAfterCursor` (si no, se pierden filas para siempre) y lo más
  // estrecha posible sin violarlo (si no, el `limit` se gasta en filas ya
  // servidas). El supremo del conjunto aceptado es `cursor.sortDate` ACOTADO
  // al día del cursor por los dos lados: ni por encima del fin del día ni por
  // debajo de su arranque.
  it("con cursor del mismo día usa la hora del cursor (cota estrecha)", () => {
    const cursor = parseCursor("2026-08-02~2026-08-02T09:00:00.000+00:00~passes:a");
    expect(addedUpperBound(cursor)).toBe("2026-08-02T09:00:00.000+00:00");
  });

  it("con cursor BACKDATEADO se queda en el fin del día, no en la hora de registro", () => {
    // Una reseña terminada el 15 de julio pero registrada hoy: `day` sale de
    // finished_on y `sortDate` de created_at. La hora de registro es 18 días
    // MÁS ANCHA que el día, así que usarla devolvería las altas de hoy —ya
    // servidas— y gastaría el `limit` entero en ellas.
    const cursor = parseCursor("2026-07-15~2026-08-02T18:30:00.000+00:00~diary_entries:b");
    expect(addedUpperBound(cursor)).toBe("2026-07-15T23:59:59.999+00:00");
  });

  it("con sortDate en el día ANTERIOR no baja del arranque del día del cursor", () => {
    // Reseña registrada a las 00:30 en Madrid (UTC+2): finished_on es la fecha
    // LOCAL "2026-08-03" y created_at el UTC "2026-08-02T22:00Z". A partir del
    // día siguiente `sessionRelativeBasis` ya no lo enmascara y la forma es
    // permanente. Si la cota bajase a las 22:00 del día 2, las altas de ese
    // día entre las 22:00 y las 23:59 —que `isAfterCursor` acepta, por ser de
    // un día anterior— no las traería ninguna página.
    const cursor = parseCursor("2026-08-03~2026-08-02T22:00:00.000+00:00~diary_entries:c");
    expect(addedUpperBound(cursor)).toBe("2026-08-03T00:00:00.000+00:00");
  });

  it("un cursor legado (sin hora) cae a la cota de día", () => {
    const cursor = parseCursor("2026-08-01~passes:aaa");
    expect(cursor.sortDate).toBeNull();
    expect(addedUpperBound(cursor)).toBe(timestampUpperBound(cursor));
  });

  it("nunca deja fuera nada que `isAfterCursor` acepte para la fuente added", () => {
    // Propiedad, no ejemplo: para las altas eventDate === sortDate === created_at.
    // Toda alta aceptada tiene que caber bajo la cota (`lte`, inclusiva).
    // Los cursores enumeran las tres relaciones posibles entre `day` y
    // `dayOf(sortDate)`, que es lo que decide la forma de la cota:
    const cursors = [
      // sortDate en un día POSTERIOR a `day` (reseña backdateada, registrada hoy)
      "2026-07-15~2026-08-02T18:30:00.000+00:00~diary_entries:b",
      // sortDate DENTRO de `day`, a media jornada y al filo del día
      "2026-08-02~2026-08-02T09:00:00.000+00:00~passes:a",
      "2026-08-02~2026-08-02T23:59:59.999+00:00~passes:z",
      "2026-08-02~2026-08-02T00:00:00.000+00:00~passes:0",
      // sortDate en el día ANTERIOR a `day`. No es exótico: `day` sale de una
      // fecha LOCAL (finished_on/watched_on/session_date) y `sortDate` de un
      // created_at UTC, así que todo lo registrado entre 00:00 y 02:00 en
      // Madrid queda con day = D y created_at = (D-1)T22:00..23:59Z en cuanto
      // pasa el día (`sessionRelativeBasis` solo lo enmascara el día mismo).
      "2026-08-03~2026-08-02T22:00:00.000+00:00~diary_entries:c",
    ].map(parseCursor);
    const stamps = [
      "2026-08-03T00:30:00.000+00:00",
      "2026-08-02T23:30:00.000+00:00",
      "2026-08-02T23:00:00.000+00:00",
      "2026-08-02T22:00:00.000+00:00",
      "2026-08-02T18:30:00.000+00:00",
      "2026-08-02T09:00:00.000+00:00",
      "2026-08-02T00:00:00.000+00:00",
      "2026-07-15T23:00:00.000+00:00",
      "2026-07-15T00:00:00.000+00:00",
      "2026-07-02T10:00:00.000+00:00",
    ];
    for (const cursor of cursors) {
      const bound = addedUpperBound(cursor);
      for (const stamp of stamps) {
        for (const id of ["passes:000", "passes:zzz"]) {
          const entry: OrderableEntry = { eventDate: stamp, sortDate: stamp, id };
          if (isAfterCursor(entry, cursor)) {
            expect(
              stamp <= bound,
              `alta ${stamp} aceptada por isAfterCursor pero fuera de la cota ${bound} ` +
                `(cursor day=${cursor.day} sortDate=${cursor.sortDate})`,
            ).toBe(true);
          }
        }
      }
    }
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
