import { describe, expect, it } from "vitest";
import type { CreditRole } from "./types";
import type { ProfileWork } from "./profile-types";
import {
  deriveCollaborators,
  deriveDominantType,
  deriveLibrarySummary,
  deriveRoleCounts,
  deriveRoleSections,
  filterWorks,
  groupByYear,
  pickFeatured,
  splitFeaturedAndRest,
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

describe("pickFeatured", () => {
  it("prioriza tu nota alta, luego la global, luego la más reciente", () => {
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

describe("splitFeaturedAndRest", () => {
  it("las destacadas NO se repiten en el resto", () => {
    const works = Array.from({ length: 8 }, (_, i) =>
      work({ itemId: String(i), year: 2000 + i })
    );

    const { featured, rest } = splitFeaturedAndRest(works);

    expect(featured).toHaveLength(5);
    expect(rest).toHaveLength(3);
    const featuredIds = new Set(featured.map((w) => w.itemId));
    expect(rest.every((w) => !featuredIds.has(w.itemId))).toBe(true);
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

describe("deriveRoleSections", () => {
  it("rol secundario con >=3 obras -> secciones", () => {
    const works = [
      ...Array.from({ length: 4 }, (_, i) => work({ itemId: `d${i}`, roles: ["director"] })),
      ...Array.from({ length: 3 }, (_, i) => work({ itemId: `c${i}`, roles: ["cast"] })),
    ];

    const sections = deriveRoleSections(works);

    expect(sections.map((s) => [s.role, s.works.length])).toEqual([
      ["director", 4],
      ["cast", 3],
    ]);
  });

  it("rol secundario con >=20% del total -> secciones aunque sean 2 obras", () => {
    const works = [
      ...Array.from({ length: 8 }, (_, i) => work({ itemId: `d${i}`, roles: ["director"] })),
      work({ itemId: "c0", roles: ["cast"] }),
      work({ itemId: "c1", roles: ["cast"] }),
    ];

    expect(deriveRoleSections(works)).toHaveLength(2);
  });

  it("un cameo suelto NO genera sección -> lista plana ([])", () => {
    const works = [
      ...Array.from({ length: 10 }, (_, i) => work({ itemId: `d${i}`, roles: ["director"] })),
      work({ itemId: "c0", roles: ["cast"] }),
    ];

    expect(deriveRoleSections(works)).toEqual([]);
  });

  it("un solo rol -> lista plana", () => {
    expect(deriveRoleSections([work({ itemId: "1", roles: ["cast"] })])).toEqual([]);
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
