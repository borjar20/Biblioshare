import { describe, expect, it } from "vitest";
import {
  buildLibrarySagaCards,
  type LibEntry,
  type LibItemMeta,
  type LibMembership,
  type LibSaga,
} from "./build-library-saga-cards";

const saga = (
  id: string,
  name: string,
  parent: string | null = null,
  accent: string | null = null,
  optionalInParent = false,
  positionInParent: number | null = null,
  placementInParent: LibSaga["placementInParent"] = null,
  // Default true: la mayoría de estos tests ejercitan `tree`/`counted`, no el
  // interruptor de Task 4-bis — mantiene su semántica ("hasGraph = ¿hay
  // miembros?") sin tener que tocar cada llamada existente.
  showMap = true,
): LibSaga => ({
  id,
  parentSagaId: parent,
  name,
  accentColor: accent,
  optionalInParent,
  positionInParent,
  placementInParent,
  showMap,
});
const mem = (
  sagaId: string,
  itemId: string,
  position: number | null,
  optional = false,
): LibMembership => ({ sagaId, itemType: "book", itemId, position, optional });
const item = (itemId: string, title: string): LibItemMeta => ({
  itemType: "book",
  itemId,
  title,
  coverUrl: `${title}.jpg`,
  year: null,
});
const entry = (
  itemId: string,
  status: string,
  updatedAt = "2026-07-01T00:00:00Z",
  everCompleted = status === "completed",
): LibEntry => ({
  itemType: "book",
  itemId,
  status,
  everCompleted,
  updatedAt,
});

describe("buildLibrarySagaCards", () => {
  it("saga simple: total por position y «siguiente» = primer sin terminar", () => {
    const cards = buildLibrarySagaCards(
      ["s"],
      [saga("s", "Simple")],
      [mem("s", "a", 1), mem("s", "b", 2), mem("s", "c", 3)],
      [item("a", "A"), item("b", "B"), item("c", "C")],
      [entry("a", "completed")],
      [],
      [],
    );
    expect(cards[0].progress).toMatchObject({ completed: 1, total: 3, pct: 33 });
    expect(cards[0].next).toMatchObject({ kind: "next", itemId: "b", title: "B" });
    expect(cards[0].hasGraph).toBe(true);
  });

  it("universo: hijas por menor position (sin colocar) primero, directos al final, doble membresía deduplicada", () => {
    // Arreglo de la revisión final de rama (punto 1): createCuratedOrder ya
    // no pone los directos primero — van AL FINAL, detrás de las hijas,
    // igual que la ficha (group-members.ts) y el mapa derivado. "nexo" es
    // miembro directo de "u" (position 1) Y de "h2" (position 3, doble
    // membresía): con las hijas primero, la ocurrencia que sobrevive a la
    // dedup es la de "h2" (después de "y", su hueco 2), no la de "u".
    const cards = buildLibrarySagaCards(
      ["u"],
      [saga("u", "Universo"), saga("h1", "Hija tardía", "u"), saga("h2", "Hija temprana", "u")],
      [
        mem("u", "nexo", 1),
        mem("h1", "x", 9),
        mem("h2", "y", 2),
        mem("h2", "nexo", 3), // doble membresía: cuenta una vez
      ],
      [item("nexo", "Nexo"), item("x", "X"), item("y", "Y")],
      [],
      [],
      [],
    );
    // orden: h2 (minPos 2, sin colocar) → h1 (minPos 9) → directos de u; "y" abre
    expect(cards[0].progress.total).toBe(3);
    expect(cards[0].next).toMatchObject({ kind: "next", itemId: "y" });
  });

  it("el acento por defecto de un bloque sigue su colocación curada, no el hueco mínimo de sus miembros (issue #203)", () => {
    // El caso real del Cosmere: hasta la Task 4 esta card ordenaba sus
    // bloques SOLO por `minPos` (el `sort` de `children`, más abajo en el
    // fichero), mientras que la ficha (group-members.ts, childGroups) ya
    // respetaba `position_in_parent` desde la #198 — podían discrepar. Ahora
    // usan el mismo comparador.
    const cards = buildLibrarySagaCards(
      ["u"],
      [
        saga("u", "Universo"),
        saga("pronto", "Colocada primero", "u", null, false, 1),
        saga("tarde", "Colocada segundo", "u", null, false, 2),
      ],
      [mem("pronto", "z", 9), mem("tarde", "a", 1)],
      [item("z", "Z"), item("a", "A")],
      [entry("z", "completed")],
      [],
      [],
    );
    // "pronto" está colocada PRIMERO (position_in_parent=1) aunque su único
    // miembro tenga el hueco más alto (9). Con el comparador viejo (solo
    // `minPos`) "tarde" (minPos=1) iba primero y se llevaba el primer acento
    // de la rotación (terracota); con la colocación curada, "pronto" se lo
    // lleva. Solo "z" (de "pronto") está completado, así que el único
    // segmento revela qué bloque se llevó el primer acento.
    const segs = cards[0].progress.segments;
    expect(segs.map((s) => s.accent)).toEqual(["terracota"]);
  });

  it("«leyendo ahora» gana a «siguiente» y elige el in_progress más reciente", () => {
    const cards = buildLibrarySagaCards(
      ["s"],
      [saga("s", "S")],
      [mem("s", "a", 1), mem("s", "b", 2), mem("s", "c", 3)],
      [item("a", "A"), item("b", "B"), item("c", "C")],
      [
        entry("b", "in_progress", "2026-07-01T00:00:00Z"),
        entry("c", "in_progress", "2026-07-15T00:00:00Z"),
      ],
      [],
      [],
    );
    expect(cards[0].next).toMatchObject({ kind: "reading", itemId: "c" });
  });

  it("completada: media de las valoraciones propias con 1 decimal", () => {
    const cards = buildLibrarySagaCards(
      ["s"],
      [saga("s", "S")],
      [mem("s", "a", 1), mem("s", "b", 2)],
      [item("a", "A"), item("b", "B")],
      [entry("a", "completed"), entry("b", "completed")],
      [
        { itemType: "book", itemId: "a", rating: 9, finishedOn: "2026-01-01" },
        { itemType: "book", itemId: "a", rating: 7, finishedOn: "2026-06-01" }, // gana el último pase
        { itemType: "book", itemId: "b", rating: 8, finishedOn: "2026-01-01" },
      ],
      [],
    );
    expect(cards[0].next).toEqual({ kind: "completed", rating: 7.5 });
  });

  it("orden de cards: en curso (recencia desc) → no empezadas (nombre) → completadas", () => {
    const cards = buildLibrarySagaCards(
      ["done", "fresh", "old", "zeta", "alfa"],
      [saga("done", "Done"), saga("fresh", "Fresh"), saga("old", "Old"), saga("zeta", "Zeta"), saga("alfa", "Alfa")],
      [mem("done", "d", 1), mem("fresh", "f", 1), mem("old", "o", 1), mem("zeta", "z", 1), mem("alfa", "al", 1)],
      [item("d", "D"), item("f", "F"), item("o", "O"), item("z", "Z"), item("al", "AL")],
      [
        entry("d", "completed", "2026-05-01T00:00:00Z"),
        entry("f", "in_progress", "2026-07-15T00:00:00Z"),
        entry("o", "in_progress", "2026-06-01T00:00:00Z"),
      ],
      [],
      [],
    );
    expect(cards.map((c) => c.sagaId)).toEqual(["fresh", "old", "alfa", "zeta", "done"]);
  });

  it("relectura: un pase completado cuenta en el avance aunque haya otro en curso", () => {
    const cards = buildLibrarySagaCards(
      ["s"],
      [saga("s", "S")],
      [mem("s", "a", 1), mem("s", "b", 2), mem("s", "c", 3)],
      [item("a", "A"), item("b", "B"), item("c", "C")],
      [
        // a: leída antes (pase completado) y releyéndose ahora (pase activo)
        entry("a", "in_progress", "2026-07-15T00:00:00Z", true),
        entry("b", "completed"),
      ],
      [],
      [],
    );
    expect(cards[0].progress).toMatchObject({ completed: 2, total: 3, pct: 67 });
    expect(cards[0].next).toMatchObject({ kind: "reading", itemId: "a" });
  });

  it("segmentos de universo: por hija + nexo beige", () => {
    const cards = buildLibrarySagaCards(
      ["u"],
      [saga("u", "U"), saga("h", "H", "u", "purpura")],
      [mem("u", "n", 1), mem("h", "x", 2)],
      [item("n", "N"), item("x", "X")],
      [entry("n", "completed"), entry("x", "completed")],
      [],
      [],
    );
    const segs = cards[0].progress.segments;
    expect(segs.some((s) => s.accent === "purpura")).toBe(true); // hija persistida
    expect(segs.some((s) => s.accent === "beige")).toBe(true); // nexo
    expect(cards[0].progress.total).toBe(2);
  });

  it("la card anuncia la ruta adoptada, pero no si es una sintética", () => {
    const cards = buildLibrarySagaCards(
      ["curada", "sintetica"],
      [saga("curada", "Curada"), saga("sintetica", "Sintética")],
      [mem("curada", "a", 1), mem("sintetica", "b", 1)],
      [item("a", "A"), item("b", "B")],
      [],
      [],
      [],
      [
        { sagaId: "curada", routeName: "La Guardia" },
        { sagaId: "sintetica", routeName: null },
      ],
    );
    const curada = cards.find((c) => c.sagaId === "curada")!;
    const sintetica = cards.find((c) => c.sagaId === "sintetica")!;
    expect(curada.routeName).toBe("La Guardia");
    expect(sintetica.routeName).toBeNull();
  });

  it("una saga sin ningún position cuenta todos sus miembros", () => {
    const cards = buildLibrarySagaCards(
      ["root"],
      [saga("root", "Mundodisco"), saga("hija", "Guardias", "root")],
      [mem("hija", "a", null), mem("hija", "b", null)],
      [item("a", "A"), item("b", "B")],
      [entry("a", "completed")],
      [],
      [],
    );
    expect(cards[0].progress).toMatchObject({ completed: 1, total: 2 });
  });

  it("el bloque «siguiente» salta las obras optional aunque vayan primero en el orden", () => {
    // Important 2 del review de Task 5 (decisión del dueño del producto): el
    // «siguiente» propone la próxima obra que ADEMÁS cuenta (está en
    // `counted`), respetando `order` para elegir entre las que cuentan. "a" es
    // optional (fuera de `counted`) pero va primera en `order`; sin el filtro,
    // el «siguiente» proponía "a" y el lector veía una obra que nunca mueve la
    // barra — el descuadre de los issues #91/#185 que esta fase existe para
    // eliminar.
    const cards = buildLibrarySagaCards(
      ["s"],
      [saga("s", "S")],
      [mem("s", "a", 1, true), mem("s", "b", 2)],
      [item("a", "A"), item("b", "B")],
      [],
      [],
      [],
    );
    expect(cards[0].progress.total).toBe(1); // "a" es optional: no cuenta
    expect(cards[0].next).toMatchObject({ kind: "next", itemId: "b" });
  });

  it("un bloque optional no penaliza el avance del padre", () => {
    const cards = buildLibrarySagaCards(
      ["root"],
      [saga("root", "Cosmere"), saga("secretas", "Novelas secretas", "root", null, true)],
      [mem("root", "a", 1), mem("secretas", "s1", 1)],
      [item("a", "A"), item("s1", "S1")],
      [],
      [],
      [],
    );
    expect(cards[0].progress.total).toBe(1);
  });

  it("todos los miembros optional: hay portadas y obras, pero `counted` sale vacío (Important 1, 2ª ronda review Task 5)", () => {
    // Espejo exacto del caso Mundodisco (`order` vacío con `counted` lleno):
    // aquí `order` y `tree` NO están vacíos (ninguno filtra por `optional`,
    // así que las portadas y el «leyendo ahora» los siguen viendo), pero
    // `counted` sí, porque las dos obras son optional. `total === 0` ya NO
    // significa "saga sin obras": antes de este fix caía en la misma rama
    // `{kind:"empty"}` que una saga genuinamente vacía, y la card se quedaba
    // con 2 portadas, 0/0 y ningún bloque accionable.
    const cards = buildLibrarySagaCards(
      ["s"],
      [saga("s", "S")],
      [mem("s", "a", 1, true), mem("s", "b", 2, true)],
      [item("a", "A"), item("b", "B")],
      [],
      [],
      [],
    );
    expect(cards[0].covers).toHaveLength(2); // hay portadas: no es una saga vacía
    expect(cards[0].progress).toMatchObject({ completed: 0, total: 0, pct: 0 });
    expect(cards[0].next).toEqual({ kind: "allOptional" });
  });

  it("saga genuinamente sin obras: ni `order` ni `counted` ni `tree` tienen nada → sí es «empty», y hasGraph es false", () => {
    const cards = buildLibrarySagaCards(
      ["s"],
      [saga("s", "S")],
      [],
      [],
      [],
      [],
      [],
    );
    expect(cards[0].covers).toHaveLength(0);
    expect(cards[0].next).toEqual({ kind: "empty" });
    expect(cards[0].hasGraph).toBe(false);
  });

  it("Task 4-bis: saga con miembros pero con el interruptor apagado (showMap=false) → hasGraph es false", () => {
    const cards = buildLibrarySagaCards(
      ["s"],
      [saga("s", "S", null, null, false, null, null, false)],
      [mem("s", "a", 1), mem("s", "b", 2)],
      [item("a", "A"), item("b", "B")],
      [],
      [],
      [],
    );
    expect(cards[0].covers).toHaveLength(2); // hay miembros: no es "empty"
    expect(cards[0].hasGraph).toBe(false); // pero el curador no lo ha encendido
  });
});
