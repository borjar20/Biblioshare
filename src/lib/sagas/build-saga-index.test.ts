import { describe, expect, it } from "vitest";
import { buildSagaIndex, type SagaIndexSagaRow, type SagaIndexMembershipRow } from "./build-saga-index";

const saga = (
  id: string,
  name: string,
  parent: string | null = null,
  accent: string | null = null,
  showMap = false,
): SagaIndexSagaRow => ({
  id,
  name,
  parent_saga_id: parent,
  accent_color: accent,
  cover_url: null,
  optional_in_parent: false,
  show_map: showMap,
});

const member = (
  saga_id: string,
  item_type: string,
  item_id: string,
  optional = false,
): SagaIndexMembershipRow => ({ saga_id, item_type, item_id, optional });

describe("buildSagaIndex", () => {
  it("solo las raíces tienen tarjeta, en orden alfabético", () => {
    const cards = buildSagaIndex(
      [saga("u", "Zeta"), saga("v", "Alfa"), saga("c", "Hija", "u")],
      [],
    );
    expect(cards.map((c) => c.name)).toEqual(["Alfa", "Zeta"]);
    expect(cards[1].children.map((ch) => ch.name)).toEqual(["Hija"]);
  });

  it("titleCount agrega el árbol entero y deduplica la doble membresía", () => {
    const cards = buildSagaIndex(
      [saga("u", "Universo"), saga("c", "Hija", "u")],
      [
        member("u", "movie", "m1"),
        member("c", "movie", "m2"),
        // m1 también es miembro directo de la hija: cuenta UNA vez
        member("c", "movie", "m1"),
      ],
    );
    expect(cards[0].titleCount).toBe(2);
  });

  it("acento de chip: persistido gana; sin persistir rota la secuencia", () => {
    const cards = buildSagaIndex(
      [saga("u", "Universo"), saga("a", "A", "u", "purpura"), saga("b", "B", "u")],
      [],
    );
    expect(cards[0].children[0].accent).toBe("purpura");
    expect(cards[0].children[1].accent).toBe("verde");
  });

  it("children ordenados alfabéticamente aunque el input entre desordenado", () => {
    const cards = buildSagaIndex(
      [saga("u", "Universo"), saga("b", "B", "u"), saga("a", "A", "u")],
      [],
    );
    expect(cards[0].children.map((c) => c.name)).toEqual(["A", "B"]);
    expect(cards[0].children[0].accent).toBe("terracota");
    expect(cards[0].children[1].accent).toBe("verde");
  });

  it("query filtra por nombre de la raíz o de cualquier descendiente", () => {
    const rows = [saga("u", "UCM"), saga("c", "Iron Man", "u"), saga("x", "Dune")];
    expect(buildSagaIndex(rows, [], "iron").map((c) => c.name)).toEqual(["UCM"]);
    expect(buildSagaIndex(rows, [], "dune").map((c) => c.name)).toEqual(["Dune"]);
    expect(buildSagaIndex(rows, [], "zzz")).toEqual([]);
  });

  it("huérfana (padre inexistente) se trata como raíz; un ciclo no cuelga", () => {
    expect(buildSagaIndex([saga("h", "Huérfana", "no-existe")], []).map((c) => c.name)).toEqual(["Huérfana"]);
    expect(buildSagaIndex([saga("a", "A", "b"), saga("b", "B", "a")], [])).toEqual([]);
  });

  it("typeBreakdown cuenta obras distintas del subárbol por tipo", () => {
    const cards = buildSagaIndex(
      [saga("u", "Universo"), saga("c", "Hija", "u")],
      [member("u", "book", "b1"), member("u", "movie", "m1"), member("c", "book", "b2")],
    );
    expect(cards[0].typeBreakdown).toEqual({ book: 2, movie: 1, series: 0 });
  });

  it("hasGraph exige show_map Y al menos un título en el subárbol", () => {
    const conMapa = buildSagaIndex([saga("u", "U", null, null, true)], [member("u", "book", "b1")]);
    expect(conMapa[0].hasGraph).toBe(true);

    const sinTitulos = buildSagaIndex([saga("u", "U", null, null, true)], []);
    expect(sinTitulos[0].hasGraph).toBe(false);

    const sinInterruptor = buildSagaIndex([saga("u", "U", null, null, false)], [member("u", "book", "b1")]);
    expect(sinInterruptor[0].hasGraph).toBe(false);
  });

  it("routeCount cuenta las rutas curadas de esa saga (extras.routes)", () => {
    const cards = buildSagaIndex([saga("u", "U")], [], "", {
      isAuthenticated: false,
      routes: [
        { saga_id: "u", slug: "orden-recomendado", name: "Orden recomendado" },
        { saga_id: "u", slug: "rincewind", name: "Rincewind" },
        { saga_id: "otra", slug: "x", name: "X" },
      ],
      passes: [],
      routeChoices: [],
      followedIds: new Set(),
    });
    expect(cards[0].routeCount).toBe(2);
  });

  it("progress es null sin autenticar, y cuenta completed/total con passes", () => {
    const sagas = [saga("u", "U"), saga("c", "Hija", "u")];
    const memberships = [member("u", "book", "b1"), member("c", "book", "b2"), member("c", "book", "b3", true)];

    const anon = buildSagaIndex(sagas, memberships);
    expect(anon[0].progress).toBeNull();

    const auth = buildSagaIndex(sagas, memberships, "", {
      isAuthenticated: true,
      routes: [],
      passes: [
        { item_type: "book", item_id: "b1", status: "completed" },
        { item_type: "book", item_id: "b2", status: "in_progress" },
      ],
      routeChoices: [],
      followedIds: new Set(),
    });
    // b3 es optional: no cuenta en el denominador. Denominador = {b1,b2} = 2.
    expect(auth[0].progress).toEqual({ completed: 1, total: 2, pct: 50, readingLabel: null });
  });

  it("ownedCount cuenta el subárbol completo (incluye optional), 0 sin autenticar", () => {
    const sagas = [saga("u", "U"), saga("c", "Hija", "u")];
    const memberships = [member("u", "book", "b1"), member("c", "book", "b2", true)];

    const anon = buildSagaIndex(sagas, memberships);
    expect(anon[0].ownedCount).toBe(0);

    const auth = buildSagaIndex(sagas, memberships, "", {
      isAuthenticated: true,
      routes: [],
      passes: [
        { item_type: "book", item_id: "b1", status: "planned" },
        { item_type: "book", item_id: "b2", status: "planned" },
      ],
      routeChoices: [],
      followedIds: new Set(),
    });
    expect(auth[0].ownedCount).toBe(2);
  });

  it("readingLabel: ruta adoptada resuelta por nombre, sintética excluida", () => {
    const base = {
      isAuthenticated: true,
      routes: [{ saga_id: "u", slug: "orden-recomendado", name: "Orden recomendado" }],
      passes: [],
      followedIds: new Set<string>(),
    };
    const conRuta = buildSagaIndex([saga("u", "U")], [], "", {
      ...base,
      routeChoices: [{ saga_id: "u", route_slug: "orden-recomendado" }],
    });
    expect(conRuta[0].progress?.readingLabel).toBe("Orden recomendado");

    const sintetica = buildSagaIndex([saga("u", "U")], [], "", {
      ...base,
      routeChoices: [{ saga_id: "u", route_slug: "lectura" }],
    });
    expect(sintetica[0].progress?.readingLabel).toBeNull();
  });

  it("cada chip de subsaga trae su propio recuento de títulos", () => {
    const cards = buildSagaIndex(
      [saga("u", "Universo"), saga("a", "A", "u"), saga("b", "B", "u"), saga("n", "Nieta", "a")],
      [
        member("u", "book", "raiz"),
        member("a", "book", "a1"),
        // la nieta cuenta dentro de A (subárbol), no solo los miembros directos
        member("n", "book", "n1"),
        member("b", "book", "b1"),
      ],
    );
    expect(cards[0].children.map((c) => [c.name, c.titleCount])).toEqual([
      ["A", 2],
      ["B", 1],
    ]);
  });

  it("creator es el autor dominante del subárbol, sin depender de la sesión", () => {
    const cards = buildSagaIndex(
      [saga("u", "Universo"), saga("c", "Hija", "u")],
      [member("u", "book", "b1"), member("u", "book", "b2"), member("c", "book", "b3")],
      "",
      {
        isAuthenticated: false,
        routes: [],
        passes: [],
        routeChoices: [],
        followedIds: new Set(),
        credits: [
          { item_type: "book", item_id: "b1", name: "Sanderson" },
          { item_type: "book", item_id: "b2", name: "Sanderson" },
          { item_type: "book", item_id: "b3", name: "Otro" },
          // crédito de una obra que no es de esta saga: se ignora
          { item_type: "book", item_id: "zzz", name: "Intruso" },
        ],
      },
    );
    expect(cards[0].creator).toBe("Sanderson");
  });

  it("creator es null sin créditos, y el empate se rompe alfabéticamente", () => {
    const sinCreditos = buildSagaIndex([saga("u", "U")], [member("u", "book", "b1")]);
    expect(sinCreditos[0].creator).toBeNull();

    const empate = buildSagaIndex([saga("u", "U")], [member("u", "book", "b1"), member("u", "book", "b2")], "", {
      isAuthenticated: false,
      routes: [],
      passes: [],
      routeChoices: [],
      followedIds: new Set(),
      credits: [
        { item_type: "book", item_id: "b2", name: "Zafón" },
        { item_type: "book", item_id: "b1", name: "Allende" },
      ],
    });
    expect(empate[0].creator).toBe("Allende");
  });

  it("isFollowed refleja extras.followedIds", () => {
    const cards = buildSagaIndex([saga("u", "U"), saga("v", "V")], [], "", {
      isAuthenticated: true,
      routes: [],
      passes: [],
      routeChoices: [],
      followedIds: new Set(["u"]),
    });
    expect(cards.find((c) => c.id === "u")?.isFollowed).toBe(true);
    expect(cards.find((c) => c.id === "v")?.isFollowed).toBe(false);
  });
});
