import { describe, expect, it } from "vitest";
import {
  buildLibrarySagaCards,
  type LibEntry,
  type LibItemMeta,
  type LibMembership,
  type LibNode,
  type LibSaga,
} from "./build-library-saga-cards";

const saga = (
  id: string,
  name: string,
  parent: string | null = null,
  accent: string | null = null,
  optionalInParent = false,
): LibSaga => ({ id, parentSagaId: parent, name, accentColor: accent, optionalInParent });
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
const node = (sagaId: string, ref: { itemId?: string; childSagaId?: string }, orderNo: number | null): LibNode => ({
  sagaId,
  itemType: ref.itemId ? "book" : null,
  itemId: ref.itemId ?? null,
  childSagaId: ref.childSagaId ?? null,
  orderNo,
});

describe("buildLibrarySagaCards", () => {
  it("saga simple sin grafo: total por position y «siguiente» = primer sin terminar", () => {
    const cards = buildLibrarySagaCards(
      ["s"],
      [saga("s", "Simple")],
      [mem("s", "a", 1), mem("s", "b", 2), mem("s", "c", 3)],
      [],
      [item("a", "A"), item("b", "B"), item("c", "C")],
      [entry("a", "completed")],
      [],
      [],
    );
    expect(cards[0].progress).toMatchObject({ completed: 1, total: 3, pct: 33 });
    expect(cards[0].next).toMatchObject({ kind: "next", itemId: "b", title: "B" });
    expect(cards[0].hasGraph).toBe(false);
  });

  it("universo sin grafo: directos primero, hijas por menor position, doble membresía deduplicada", () => {
    const cards = buildLibrarySagaCards(
      ["u"],
      [saga("u", "Universo"), saga("h1", "Hija tardía", "u"), saga("h2", "Hija temprana", "u")],
      [
        mem("u", "nexo", 1),
        mem("h1", "x", 9),
        mem("h2", "y", 2),
        mem("h2", "nexo", 3), // doble membresía: cuenta una vez
      ],
      [],
      [item("nexo", "Nexo"), item("x", "X"), item("y", "Y")],
      [],
      [],
      [],
    );
    // orden: directos de u → h2 (minPos 2) → h1 (minPos 9); nexo deduplicado
    expect(cards[0].progress.total).toBe(3);
    expect(cards[0].next).toMatchObject({ kind: "next", itemId: "nexo" });
  });

  it("con grafo: solo nodos con orderNo cuentan y el nodo-saga se expande en su hueco", () => {
    const cards = buildLibrarySagaCards(
      ["u"],
      [saga("u", "Universo"), saga("h", "Hija", "u")],
      [mem("u", "a", 1), mem("h", "b", 1), mem("h", "c", 2), mem("u", "opc", 9)],
      [
        node("u", { itemId: "a" }, 1),
        node("u", { childSagaId: "h" }, 2), // nodo-saga CON orderNo (Task 1)
        node("u", { itemId: "opc" }, null), // sin hueco en el grafo, pero NO optional: sí cuenta (Task 5)
      ],
      [item("a", "A"), item("b", "B"), item("c", "C"), item("opc", "Opc")],
      [entry("a", "completed"), entry("b", "completed")],
      [],
      [],
    );
    // orden principal (portadas/«siguiente»): a, b, c — opc no tiene order_no,
    // así que no entra en la SECUENCIA. Pero el denominador (Task 5) ya no
    // sale del orden: cuenta la pertenencia, y opc es un miembro real (no
    // marcado optional en saga_items), así que sí cuenta → total 4, no 3.
    expect(cards[0].progress).toMatchObject({ completed: 2, total: 4, pct: 50 });
    expect(cards[0].next).toMatchObject({ kind: "next", itemId: "c" });
    expect(cards[0].hasGraph).toBe(true);
  });

  it("«leyendo ahora» gana a «siguiente» y elige el in_progress más reciente", () => {
    const cards = buildLibrarySagaCards(
      ["s"],
      [saga("s", "S")],
      [mem("s", "a", 1), mem("s", "b", 2), mem("s", "c", 3)],
      [],
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
      [],
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
      [],
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
      [],
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

  it("segmentos de universo: por hija + nexo beige; ciclo/profundidad no cuelga", () => {
    const cards = buildLibrarySagaCards(
      ["u"],
      [saga("u", "U"), saga("h", "H", "u", "purpura"), saga("loop", "Loop", "u")],
      [mem("u", "n", 1), mem("h", "x", 2)],
      [
        // grafo de "loop" que se referencia a sí misma vía nodo-saga: no cuelga
        node("loop", { childSagaId: "loop" }, 1),
      ],
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
      [],
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

  it("una saga sin grafo y sin ningún position cuenta todos sus miembros (caso Mundodisco)", () => {
    // Regresión de la fase: con el denominador viejo, una saga cuyos nodos no
    // tenían order_no daba 0/0 y el usuario no veía avance ninguno.
    const cards = buildLibrarySagaCards(
      ["root"],
      [saga("root", "Mundodisco"), saga("hija", "Guardias", "root")],
      [mem("hija", "a", null), mem("hija", "b", null)],
      [],
      [item("a", "A"), item("b", "B")],
      [entry("a", "completed")],
      [],
      [],
    );
    expect(cards[0].progress).toMatchObject({ completed: 1, total: 2 });
  });

  it("un bloque optional no penaliza el avance del padre", () => {
    const cards = buildLibrarySagaCards(
      ["root"],
      [saga("root", "Cosmere"), saga("secretas", "Novelas secretas", "root", null, true)],
      [mem("root", "a", 1), mem("secretas", "s1", 1)],
      [],
      [item("a", "A"), item("s1", "S1")],
      [],
      [],
      [],
    );
    expect(cards[0].progress.total).toBe(1);
  });
});
