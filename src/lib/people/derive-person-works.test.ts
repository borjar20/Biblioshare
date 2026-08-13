import { describe, expect, it } from "vitest";
import type { CreditRole } from "./types";
import type { ProfileWork } from "./profile-types";
import {
  deriveCollaborators,
  deriveDominantType,
  deriveLibrarySummary,
  libraryPercent,
  deriveRatingBuckets,
  deriveRoleCounts,
  dominantItemType,
  filterWorks,
  groupByYear,
  groupWorks,
  pickFeatured,
} from "./derive-person-works";

function work(over: Partial<ProfileWork> & { itemId: string }): ProfileWork {
  return {
    itemType: "movie",
    title: `Obra ${over.itemId}`,
    coverUrl: null,
    href: `/pelicula/${over.itemId}`,
    year: 2000,
    durationMinutes: null,
    roles: ["cast"] as CreditRole[],
    character: null,
    globalRating: null,
    sagaId: null,
    sagaName: null,
    status: null,
    userRating: null,
    finishedOn: null,
    progressLabel: null,
    progressPercent: null,
    ...over,
  } as ProfileWork;
}

describe("deriveRoleCounts", () => {
  it("cuenta por rol y ORDENA por volumen descendente", () => {
    const works = [
      work({ itemId: "1", roles: ["cast"] }),
      work({ itemId: "2", roles: ["cast"] }),
      work({ itemId: "3", roles: ["director"] }),
      work({ itemId: "4", roles: ["cast", "director"] }),
    ];

    expect(deriveRoleCounts(works)).toEqual([
      { role: "cast", count: 3 },
      { role: "director", count: 2 },
    ]);
  });

  it("una obra con dos roles cuenta en LOS DOS", () => {
    const counts = deriveRoleCounts([work({ itemId: "1", roles: ["cast", "director"] })]);
    expect(counts).toEqual([
      { role: "cast", count: 1 },
      { role: "director", count: 1 },
    ]);
  });
});

describe("deriveDominantType", () => {
  it("mayoría de pantalla -> watched", () => {
    expect(
      deriveDominantType([
        work({ itemId: "1", itemType: "movie" }),
        work({ itemId: "2", itemType: "series" }),
        work({ itemId: "3", itemType: "book" }),
      ])
    ).toBe("watched");
  });

  it("mayoría de libros -> read", () => {
    expect(
      deriveDominantType([
        work({ itemId: "1", itemType: "book" }),
        work({ itemId: "2", itemType: "book" }),
        work({ itemId: "3", itemType: "movie" }),
      ])
    ).toBe("read");
  });

  it("empate exacto -> mixed", () => {
    expect(
      deriveDominantType([
        work({ itemId: "1", itemType: "book" }),
        work({ itemId: "2", itemType: "movie" }),
      ])
    ).toBe("mixed");
  });
});

describe("dominantItemType", () => {
  it("el tipo más frecuente manda", () => {
    expect(
      dominantItemType([
        work({ itemId: "1", itemType: "series" }),
        work({ itemId: "2", itemType: "series" }),
        work({ itemId: "3", itemType: "movie" }),
      ])
    ).toBe("series");
  });

  it("responde distinto que deriveDominantType: 3 series + 2 pelis es «watched» pero `series`", () => {
    const works = [
      work({ itemId: "1", itemType: "series" }),
      work({ itemId: "2", itemType: "series" }),
      work({ itemId: "3", itemType: "series" }),
      work({ itemId: "4", itemType: "movie" }),
      work({ itemId: "5", itemType: "movie" }),
    ];
    expect(deriveDominantType(works)).toBe("watched");
    expect(dominantItemType(works)).toBe("series");
  });

  it("sin obras -> movie (no revienta)", () => {
    expect(dominantItemType([])).toBe("movie");
  });
});

describe("deriveRatingBuckets", () => {
  it("diez cubos, uno por cada nota interna 1–10", () => {
    expect(deriveRatingBuckets([])).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("cada nota cae en SU cubo, sin agrupar de dos en dos", () => {
    const buckets = deriveRatingBuckets([
      work({ itemId: "a", userRating: 7 }),
      work({ itemId: "b", userRating: 8 }),
      work({ itemId: "c", userRating: 8 }),
      work({ itemId: "d", userRating: 10 }),
    ]);
    // 7 -> índice 6 (3,5★); 8 -> índice 7 (4★); 10 -> índice 9 (5★)
    expect(buckets).toEqual([0, 0, 0, 0, 0, 0, 1, 2, 0, 1]);
  });

  it("las obras sin nota no cuentan", () => {
    const buckets = deriveRatingBuckets([
      work({ itemId: "a", userRating: null }),
      work({ itemId: "b", userRating: 2 }),
    ]);
    expect(buckets.reduce((x, y) => x + y, 0)).toBe(1);
  });

  it("los extremos 1 y 10 no se salen del array", () => {
    const buckets = deriveRatingBuckets([
      work({ itemId: "a", userRating: 1 }),
      work({ itemId: "b", userRating: 10 }),
    ]);
    expect(buckets[0]).toBe(1);
    expect(buckets[9]).toBe(1);
    expect(buckets).toHaveLength(10);
  });
});

describe("deriveLibrarySummary", () => {
  it("M>=3 y N>=1 -> visible, con recuento y verbo", () => {
    const works = [
      work({ itemId: "1", status: "completed" }),
      work({ itemId: "2", status: "planned" }),
      work({ itemId: "3" }),
    ];

    expect(deriveLibrarySummary(works)).toEqual({
      visible: true,
      total: 3,
      done: 1,
      percent: 33,
      verb: "watched",
    });
  });

  it("M < 3 -> NO visible («has visto 0 de 1» no informa de nada)", () => {
    expect(deriveLibrarySummary([work({ itemId: "1", status: "completed" })]).visible).toBe(false);
  });

  it("N === 0 -> NO visible", () => {
    expect(
      deriveLibrarySummary([work({ itemId: "1" }), work({ itemId: "2" }), work({ itemId: "3" })])
        .visible
    ).toBe(false);
  });
});

describe("libraryPercent", () => {
  it("redondea al entero", () => {
    expect(libraryPercent(1, 3)).toBe(33);
    expect(libraryPercent(2, 3)).toBe(67);
    expect(libraryPercent(1, 2)).toBe(50);
  });

  it("nunca 0% habiendo terminado alguna: 1 de 300 es 1%, no 0%", () => {
    // 0,33% redondearía a 0 y contradiría al propio bloque, que solo se pinta
    // si hay al menos una terminada.
    expect(libraryPercent(1, 300)).toBe(1);
  });

  it("nunca 100% quedando alguna: 299 de 300 es 99%", () => {
    expect(libraryPercent(299, 300)).toBe(99);
  });

  it("100% solo con todas", () => {
    expect(libraryPercent(3, 3)).toBe(100);
  });

  it("sin terminar ninguna, 0%; y sin obras, 0% sin dividir por cero", () => {
    expect(libraryPercent(0, 5)).toBe(0);
    expect(libraryPercent(0, 0)).toBe(0);
  });
});

describe("pickFeatured", () => {
  it("manda la nota: primero las tuyas, luego las globales, al final las sin nota", () => {
    const works = [
      work({ itemId: "reciente", year: 2024 }),
      work({ itemId: "global", globalRating: 9 }),
      work({ itemId: "mia", userRating: 8 }),
      work({ itemId: "vieja", year: 1990 }),
    ];

    expect(pickFeatured(works).map((w) => w.itemId)).toEqual([
      "mia",
      "global",
      "reciente",
      "vieja",
    ]);
  });

  it("una nota tuya baja gana a una global alta: son tramos, no números comparables", () => {
    const works = [
      work({ itemId: "global10", globalRating: 10 }),
      work({ itemId: "mia6", userRating: 6 }),
      work({ itemId: "x" }),
      work({ itemId: "y" }),
    ];

    expect(pickFeatured(works).map((w) => w.itemId).slice(0, 2)).toEqual(["mia6", "global10"]);
  });

  it("la nota gana al rol: una peli que ACTÚA y puntuaste alto pasa por delante de una que dirige sin nota", () => {
    // Este es el cambio del 2026-08-12 (segunda enmienda): antes el peso del rol
    // iba primero y «dirige» ganaba siempre, puntuases lo que puntuases.
    const works = [
      work({ itemId: "dirige", roles: ["director"], year: 2014 }),
      work({ itemId: "actua", roles: ["cast"], character: "Bill", userRating: 9 }),
      work({ itemId: "x" }),
      work({ itemId: "y" }),
    ];

    expect(pickFeatured(works).map((w) => w.itemId).slice(0, 2)).toEqual(["actua", "dirige"]);
  });

  it("el caso Phil Lord: SIN notas, su obra como director gana a los making-of recientes", () => {
    // En catálogo recién hidratado nadie tiene nota, así que todo cae al tramo
    // de «sin nota» y el desempate real sería el AÑO — los featurettes de 2023
    // por delante de su cine. Lo sostiene el peso del rol. Ver `workRoleWeight`.
    const works = [
      work({ itemId: "makingof1", year: 2023, roles: ["cast"], character: "Self" }),
      work({ itemId: "makingof2", year: 2023, roles: ["cast"], character: "Self - Presenter" }),
      work({ itemId: "lluvia", year: 2009, roles: ["director", "writer"] }),
      work({ itemId: "lego", year: 2014, roles: ["director", "writer"] }),
      work({ itemId: "cameo", year: 2022, roles: ["cast"], character: "Additional Voices" }),
    ];

    expect(pickFeatured(works).map((w) => w.itemId)).toEqual([
      "lego",
      "lluvia",
      "cameo",
      "makingof1",
      "makingof2",
    ]);
  });

  it("las apariciones como sí mismo van al final AUNQUE las hayas puntuado alto", () => {
    // El único sitio donde la nota no manda: el late night con un 10 tuyo
    // sigue sin ser obra suya.
    const works = [
      work({ itemId: "latenight", roles: ["cast"], character: "Himself", userRating: 10 }),
      work({ itemId: "peli", roles: ["director"], userRating: 5 }),
      work({ itemId: "x" }),
      work({ itemId: "y" }),
    ];

    expect(pickFeatured(works).map((w) => w.itemId)).toEqual(["peli", "x", "y", "latenight"]);
  });

  it("tope de 5", () => {
    const works = Array.from({ length: 9 }, (_, i) => work({ itemId: String(i), year: 2000 + i }));
    expect(pickFeatured(works)).toHaveLength(5);
  });

  it("con menos de 4 obras NO hay destacadas", () => {
    expect(pickFeatured([work({ itemId: "1" }), work({ itemId: "2" }), work({ itemId: "3" })])).toEqual(
      []
    );
  });
});

describe("groupByYear", () => {
  it("agrupa por año descendente; los sin año van al final", () => {
    const groups = groupByYear([
      work({ itemId: "a", year: 1999 }),
      work({ itemId: "b", year: 2020 }),
      work({ itemId: "c", year: null }),
      work({ itemId: "d", year: 2020 }),
    ]);

    expect(groups.map((g) => g.year)).toEqual([2020, 1999, null]);
    expect(groups[0].works.map((w) => w.itemId)).toEqual(["b", "d"]);
  });
});

describe("groupWorks", () => {
  it("cronología: un tramo por año, descendente y los sin año al final", () => {
    const groups = groupWorks(
      [
        work({ itemId: "a", year: 1999 }),
        work({ itemId: "b", year: 2020 }),
        work({ itemId: "c", year: null }),
      ],
      "chronology"
    );

    expect(groups.map((g) => g.year)).toEqual([2020, 1999, null]);
    expect(groups.every((g) => g.role === null)).toBe(true);
  });

  it("por categoría: un tramo por rol, autoría antes que reparto", () => {
    const groups = groupWorks(
      [
        work({ itemId: "1", roles: ["cast"] }),
        work({ itemId: "2", roles: ["director"] }),
        work({ itemId: "3", roles: ["writer"] }),
      ],
      "role"
    );

    expect(groups.map((g) => g.role)).toEqual(["director", "writer", "cast"]);
  });

  it("por categoría, una obra con varios roles sale UNA vez, en el de más peso", () => {
    // Repetir la fila en «Dirección» y en «Reparto» descuadraría el recuento de
    // la cabecera y rompería la lectura de la lista.
    const groups = groupWorks([work({ itemId: "1", roles: ["cast", "director"] })], "role");

    expect(groups).toHaveLength(1);
    expect(groups[0].role).toBe("director");
    expect(groups[0].works.map((w) => w.itemId)).toEqual(["1"]);
  });

  it("por categoría, dentro del tramo manda el año descendente", () => {
    const groups = groupWorks(
      [
        work({ itemId: "viejo", roles: ["director"], year: 1990 }),
        work({ itemId: "nuevo", roles: ["director"], year: 2020 }),
      ],
      "role"
    );

    expect(groups[0].works.map((w) => w.itemId)).toEqual(["nuevo", "viejo"]);
  });

  it("NINGÚN orden pierde obras: lo que entra, sale", () => {
    const works = Array.from({ length: 9 }, (_, i) =>
      work({ itemId: String(i), year: 2000 + (i % 3), roles: [(["cast", "director", "writer"] as CreditRole[])[i % 3]] })
    );

    for (const order of ["chronology", "role"] as const) {
      const salidas = groupWorks(works, order).flatMap((g) => g.works.map((w) => w.itemId));
      expect(new Set(salidas).size).toBe(9);
      expect(salidas).toHaveLength(9);
    }
  });
});

describe("filterWorks", () => {
  const works = [
    work({ itemId: "1", itemType: "movie", roles: ["cast"] }),
    work({ itemId: "2", itemType: "series", roles: ["director"] }),
    work({ itemId: "3", itemType: "book", roles: ["author"] }),
    work({ itemId: "4", itemType: "movie", roles: ["cast", "director"] }),
  ];

  it("sin filtros -> todo", () => {
    expect(filterWorks(works, {})).toHaveLength(4);
  });

  it("filtra por tipo", () => {
    expect(filterWorks(works, { type: "movie" }).map((w) => w.itemId)).toEqual(["1", "4"]);
  });

  it("filtra por crédito, incluyendo obras con varios roles", () => {
    expect(filterWorks(works, { role: "director" }).map((w) => w.itemId)).toEqual(["2", "4"]);
  });

  it("combina tipo y crédito", () => {
    expect(filterWorks(works, { type: "movie", role: "director" }).map((w) => w.itemId)).toEqual([
      "4",
    ]);
  });
});

describe("deriveCollaborators", () => {
  it("solo personas con >=2 obras compartidas, ordenadas por recuento", () => {
    const rows = [
      { personId: "a", name: "Ana", photoUrl: null, role: "director" as CreditRole, itemKey: "movie:1" },
      { personId: "a", name: "Ana", photoUrl: null, role: "director" as CreditRole, itemKey: "movie:2" },
      { personId: "a", name: "Ana", photoUrl: null, role: "director" as CreditRole, itemKey: "movie:3" },
      { personId: "b", name: "Bea", photoUrl: null, role: "cast" as CreditRole, itemKey: "movie:1" },
      { personId: "b", name: "Bea", photoUrl: null, role: "cast" as CreditRole, itemKey: "movie:2" },
      { personId: "c", name: "Caro", photoUrl: null, role: "cast" as CreditRole, itemKey: "movie:1" },
    ];

    const out = deriveCollaborators(rows);

    expect(out.map((c) => [c.id, c.sharedCount])).toEqual([
      ["a", 3],
      ["b", 2],
    ]);
    expect(out[0].href).toBe("/persona/a");
  });

  it("la misma obra contada dos veces (dos roles) NO infla el recuento", () => {
    const rows = [
      { personId: "a", name: "Ana", photoUrl: null, role: "cast" as CreditRole, itemKey: "movie:1" },
      { personId: "a", name: "Ana", photoUrl: null, role: "director" as CreditRole, itemKey: "movie:1" },
    ];

    expect(deriveCollaborators(rows)).toEqual([]);
  });
});
