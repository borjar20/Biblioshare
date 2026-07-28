import { describe, expect, it } from "vitest";
import {
  orderWindowsFromRows,
  placeByWindow,
  type OrderUnit,
  type OrderWindow,
  type RawOrderWindowRow,
} from "./place-by-window";

// Helpers. `u` construye una unidad; `claves` extrae las claves para comparar
// listas cortas y legibles; `libre` es el caso normal (el sujeto SÍ es libre) —
// la guarda de placement se prueba aparte.
const u = (key: string, blockId: string | null = null): OrderUnit => ({ key, blockId });
const claves = (units: OrderUnit[]) => units.map((x) => x.key);
const libre = () => true;

// El Cosmere real (consultado en producción el 2026-07-28), con claves legibles
// en vez de uuids. Cuatro ventanas, tres formas distintas de sujeto:
//   - `s:era2`          bloque libre CON huecos
//   - `i:book:aliento`  obra libre que es el único miembro de un bloque libre
//   - `i:book:esquirla` obra libre dentro de un bloque COLOCADO
//   - `i:book:hombre`   obra libre dentro de un bloque libre con hermanas
const COSMERE: OrderUnit[] = [
  u("i:book:elantris", "elantris"),
  u("i:book:imperio", "era1"),
  u("i:book:pozo", "era1"),
  u("i:book:heroe", "era1"),
  u("i:book:camino", "archivo"),
  u("i:book:palabras", "archivo"),
  u("i:book:juramentada", "archivo"),
  u("i:book:ritmo", "archivo"),
  u("i:book:viento", "archivo"),
  u("i:book:esquirla", "archivo"),
  u("i:book:aleacion", "era2"),
  u("i:book:sombras", "era2"),
  u("i:book:brazales", "era2"),
  u("i:book:metal", "era2"),
  u("i:book:aliento", "aliento"),
  u("i:book:hombre", "novelas"),
  u("i:book:islas", "novelas"),
  u("i:book:trenza", "novelas"),
  u("i:book:yumi", "novelas"),
  u("i:book:arcanum", null),
];

const VENTANAS_COSMERE: Record<string, OrderWindow> = {
  "i:book:esquirla": { afterKey: "i:book:juramentada", beforeKey: "i:book:ritmo" },
  "s:era2": { afterKey: "s:era1", beforeKey: "i:book:viento" },
  "i:book:aliento": { afterKey: "s:era1", beforeKey: "i:book:juramentada" },
  "i:book:hombre": { afterKey: "i:book:ritmo", beforeKey: "i:book:viento" },
};

describe("placeByWindow", () => {
  it("un bloque libre retrocede al principio del bloque que partiría", () => {
    // «antes de b2» caería entre b1 y b2, partiendo el bloque `B`. Como el
    // `a partir de` (fin de `A`) lo permite, retrocede al principio de `B`.
    const units = [
      u("i:book:a1", "A"),
      u("i:book:b1", "B"),
      u("i:book:b2", "B"),
      u("i:book:l1", "L"),
      u("i:book:l2", "L"),
    ];
    const out = placeByWindow(units, { "s:L": { afterKey: "s:A", beforeKey: "i:book:b2" } }, libre);
    expect(claves(out)).toEqual(["i:book:a1", "i:book:l1", "i:book:l2", "i:book:b1", "i:book:b2"]);
  });

  it("una obra que no puede retroceder corta el bloque", () => {
    // Las dos anclas viven DENTRO de `B`: retroceder al principio de `B`
    // incumpliría el «a partir de b1», así que se acepta el corte.
    const units = [u("i:book:b1", "B"), u("i:book:b2", "B"), u("i:book:z", "Z")];
    const out = placeByWindow(units, { "i:book:z": { afterKey: "i:book:b1", beforeKey: "i:book:b2" } }, libre);
    expect(claves(out)).toEqual(["i:book:b1", "i:book:z", "i:book:b2"]);
  });

  it("un sujeto BLOQUE retrocede aunque eso incumpla el `a partir de`", () => {
    // Un bloque solo puede aterrizar en límites entre bloques (spec §5), así
    // que cuando ningún límite cumple las dos anclas gana el `antes de`.
    const units = [u("i:book:b1", "B"), u("i:book:b2", "B"), u("i:book:l1", "L")];
    const out = placeByWindow(units, { "s:L": { afterKey: "i:book:b1", beforeKey: "i:book:b2" } }, libre);
    expect(claves(out)).toEqual(["i:book:l1", "i:book:b1", "i:book:b2"]);
  });

  it("solo `a partir de`: se coloca detrás del ancla y avanza al final del bloque que partiría", () => {
    const units = [u("i:book:b1", "B"), u("i:book:b2", "B"), u("i:book:z", "Z")];
    const out = placeByWindow(units, { "i:book:z": { afterKey: "i:book:b1", beforeKey: null } }, libre);
    expect(claves(out)).toEqual(["i:book:b1", "i:book:b2", "i:book:z"]);
  });

  it("sin ninguna ventana la secuencia sale intacta", () => {
    expect(claves(placeByWindow(COSMERE, {}, libre))).toEqual(claves(COSMERE));
  });

  it("un sujeto que ya no es `libre` se ignora, aunque quede su fila de ventana", () => {
    // Fila rancia: ningún CHECK de BD impide que sobreviva.
    const out = placeByWindow(COSMERE, VENTANAS_COSMERE, () => false);
    expect(claves(out)).toEqual(claves(COSMERE));
  });

  it("un ancla que no está en la secuencia se ignora y manda la otra", () => {
    const units = [u("i:book:b1", "B"), u("i:book:b2", "B"), u("i:book:z", "Z")];
    // El `antes de` apunta fuera de la secuencia: queda el `a partir de b1`.
    const out = placeByWindow(units, { "i:book:z": { afterKey: "i:book:b1", beforeKey: "i:book:fantasma" } }, libre);
    expect(claves(out)).toEqual(["i:book:b1", "i:book:b2", "i:book:z"]);
  });

  it("si ninguna ancla está en la secuencia, el sujeto no se mueve", () => {
    const units = [u("i:book:z", "Z"), u("i:book:b1", "B")];
    const out = placeByWindow(units, { "i:book:z": { afterKey: "i:book:x", beforeKey: "i:book:y" } }, libre);
    expect(claves(out)).toEqual(["i:book:z", "i:book:b1"]);
  });

  it("un sujeto anclado a sí mismo no se mueve", () => {
    const units = [u("i:book:b1", "B"), u("i:book:z", "Z")];
    const out = placeByWindow(units, { "i:book:z": { afterKey: "i:book:z", beforeKey: null } }, libre);
    expect(claves(out)).toEqual(["i:book:b1", "i:book:z"]);
  });

  it("dos sujetos que caen en el mismo punto conservan el orden que ya tenían", () => {
    const units = [
      u("i:book:a1", "A"),
      u("i:book:b1", "B"),
      u("i:book:p", "P"),
      u("i:book:q", "Q"),
    ];
    const out = placeByWindow(
      units,
      {
        "i:book:p": { afterKey: null, beforeKey: "i:book:b1" },
        "i:book:q": { afterKey: null, beforeKey: "i:book:b1" },
      },
      libre,
    );
    expect(claves(out)).toEqual(["i:book:a1", "i:book:p", "i:book:q", "i:book:b1"]);
  });

  it("un sujeto anclado a otro sujeto libre ve al primero ya movido", () => {
    const units = [u("i:book:a1", "A"), u("i:book:b1", "B"), u("i:book:p", "P"), u("i:book:q", "Q")];
    const out = placeByWindow(
      units,
      {
        "i:book:p": { afterKey: null, beforeKey: "i:book:b1" },
        "i:book:q": { afterKey: null, beforeKey: "i:book:p" },
      },
      libre,
    );
    expect(claves(out)).toEqual(["i:book:a1", "i:book:q", "i:book:p", "i:book:b1"]);
  });

  it("un ciclo no cuelga: cada sujeto se mueve exactamente una vez", () => {
    const units = [u("i:book:a1", "A"), u("i:book:x", "X"), u("i:book:y", "Y")];
    const out = placeByWindow(
      units,
      {
        "i:book:x": { afterKey: null, beforeKey: "i:book:y" },
        "i:book:y": { afterKey: null, beforeKey: "i:book:x" },
      },
      libre,
    );
    // Determinista y sin colgarse; no se exige que satisfaga las dos ventanas.
    expect(claves(out)).toEqual(["i:book:a1", "i:book:y", "i:book:x"]);
  });

  it("el Cosmere entero sale como dice el spec", () => {
    expect(claves(placeByWindow(COSMERE, VENTANAS_COSMERE, libre))).toEqual([
      "i:book:elantris",
      "i:book:imperio",
      "i:book:pozo",
      "i:book:heroe",
      "i:book:aleacion",
      "i:book:sombras",
      "i:book:brazales",
      "i:book:metal",
      "i:book:aliento",
      "i:book:camino",
      "i:book:palabras",
      "i:book:juramentada",
      "i:book:esquirla",
      "i:book:ritmo",
      "i:book:hombre",
      "i:book:viento",
      "i:book:islas",
      "i:book:trenza",
      "i:book:yumi",
      "i:book:arcanum",
    ]);
  });
});

describe("orderWindowsFromRows", () => {
  const fila = (over: Partial<RawOrderWindowRow>): RawOrderWindowRow => ({
    item_type: null,
    item_id: null,
    child_saga_id: null,
    after_item_type: null,
    after_item_id: null,
    after_child_saga_id: null,
    before_item_type: null,
    before_item_id: null,
    before_child_saga_id: null,
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  });

  it("traduce sujeto y anclas, obra o bloque, a claves de entrada", () => {
    const out = orderWindowsFromRows([
      fila({
        item_type: "book",
        item_id: "z",
        after_child_saga_id: "era1",
        before_item_type: "book",
        before_item_id: "jur",
      }),
      fila({ child_saga_id: "era2", after_child_saga_id: "era1" }),
    ]);
    expect(out).toEqual({
      "i:book:z": { afterKey: "s:era1", beforeKey: "i:book:jur" },
      "s:era2": { afterKey: "s:era1", beforeKey: null },
    });
  });

  it("con dos filas para el mismo sujeto gana la MÁS ANTIGUA, llegue en el orden que llegue", () => {
    // Los uniques de saga_placement_windows son POR SAGA, así que dos sagas
    // hermanas pueden tener cada una su fila para la misma obra compartida.
    const vieja = fila({
      item_type: "book",
      item_id: "z",
      after_child_saga_id: "era1",
      created_at: "2026-01-01T00:00:00Z",
    });
    const nueva = fila({
      item_type: "book",
      item_id: "z",
      after_child_saga_id: "era2",
      created_at: "2026-06-01T00:00:00Z",
    });
    expect(orderWindowsFromRows([nueva, vieja])).toEqual({ "i:book:z": { afterKey: "s:era1", beforeKey: null } });
    expect(orderWindowsFromRows([vieja, nueva])).toEqual({ "i:book:z": { afterKey: "s:era1", beforeKey: null } });
  });

  it("una fila sin ninguna ancla no produce ventana", () => {
    expect(orderWindowsFromRows([fila({ item_type: "book", item_id: "z" })])).toEqual({});
  });
});
