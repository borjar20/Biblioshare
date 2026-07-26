import { describe, expect, it } from "vitest";
import {
  addEntry, moveSlot, pairWith, removeEntry, sendTo, setOptional, setRole, toPayload, unpair,
  type DraftEntry, type SequenceDraft,
} from "./sequence-draft";

const work = (id: string, title = id): DraftEntry => ({
  key: `i:book:${id}`, kind: "item", itemType: "book", itemId: id, childSagaId: null,
  title, coverUrl: null, accentColor: null, count: null, optional: false, role: null, isNew: false,
});
const block = (id: string): DraftEntry => ({
  key: `s:${id}`, kind: "block", itemType: null, itemId: null, childSagaId: id,
  title: id, coverUrl: null, accentColor: "verde", count: 8, optional: false, role: null, isNew: false,
});
const draft = (slots: DraftEntry[][], free: DraftEntry[] = [], unclassified: DraftEntry[] = []): SequenceDraft =>
  ({ slots, free, unclassified, removed: [] });

describe("moveSlot", () => {
  it("intercambia el hueco con su vecino y no toca los demás", () => {
    const d = moveSlot(draft([[work("a")], [work("b")], [work("c")]]), 0, 1);
    expect(d.slots.map((s) => s[0].itemId)).toEqual(["b", "a", "c"]);
  });

  it("es un no-op en los extremos, sin lanzar", () => {
    const d = draft([[work("a")], [work("b")]]);
    expect(moveSlot(d, 0, -1).slots).toEqual(d.slots);
    expect(moveSlot(d, 1, 1).slots).toEqual(d.slots);
  });
});

describe("pairWith / unpair", () => {
  it("emparejar mete la obra en el hueco destino y elimina su hueco", () => {
    const d = pairWith(draft([[work("a")], [work("b")], [work("c")]]), "i:book:c", 0);
    expect(d.slots).toHaveLength(2);
    expect(d.slots[0].map((e) => e.itemId)).toEqual(["a", "c"]);
    expect(d.slots[1][0].itemId).toBe("b");
  });

  it("deshacer un tándem devuelve huecos consecutivos en el sitio del empate", () => {
    const d = unpair(draft([[work("a"), work("c")], [work("b")]]), 0);
    expect(d.slots.map((s) => s.map((e) => e.itemId))).toEqual([["a"], ["c"], ["b"]]);
  });

  it("emparejar desde un hueco ANTERIOR al destino no pierde la entrada", () => {
    // Al sacar `a` del hueco 0 los índices se corren, así que resolver el
    // destino por índice a ciegas apuntaría al hueco equivocado.
    const d = pairWith(draft([[work("a")], [work("b")], [work("c")]]), "i:book:a", 2);
    expect(d.slots.map((s) => s.map((e) => e.itemId))).toEqual([["b"], ["c", "a"]]);
  });
});

describe("sendTo", () => {
  it("mover a «Cuando quieras» saca la fila de la secuencia y cierra el hueco", () => {
    const d = sendTo(draft([[work("a")], [work("b")]]), "i:book:a", "free");
    expect(d.slots.map((s) => s[0].itemId)).toEqual(["b"]);
    expect(d.free.map((e) => e.itemId)).toEqual(["a"]);
  });

  it("mover a la secuencia añade un hueco AL FINAL", () => {
    const d = sendTo(draft([[work("a")]], [], [work("z")]), "i:book:z", "sequence");
    expect(d.slots.map((s) => s[0].itemId)).toEqual(["a", "z"]);
    expect(d.unclassified).toHaveLength(0);
  });

  it("sacar de un tándem al resto del hueco NO lo destruye", () => {
    const d = sendTo(draft([[work("a"), work("c")]]), "i:book:c", "free");
    expect(d.slots.map((s) => s.map((e) => e.itemId))).toEqual([["a"]]);
    expect(d.free.map((e) => e.itemId)).toEqual(["c"]);
  });

  it("mandar a la secuencia una fila que YA está en ella no la mueve ni rompe su tándem", () => {
    // La hoja de móvil pinta la zona actual como pastilla seleccionada: tocarla
    // parece un no-op y tiene que serlo. Sin esto, la fila saltaba al último
    // hueco y el tándem se deshacía.
    const d = draft([[work("a"), work("b")], [work("c")]]);
    expect(sendTo(d, "i:book:b", "sequence")).toEqual(d);
  });
});

describe("removeEntry", () => {
  it("una fila existente se apunta en `removed`", () => {
    const d = removeEntry(draft([[work("a")], [work("b")]]), "i:book:a");
    expect(d.slots).toHaveLength(1);
    expect(d.removed).toEqual(["i:book:a"]);
  });

  it("una fila recién añadida y no guardada NO se apunta en `removed`", () => {
    const fresh = { ...work("n"), isNew: true };
    const d = removeEntry(addEntry(draft([[work("a")]]), fresh), "i:book:n");
    expect(d.removed).toEqual([]);
    expect(d.slots).toHaveLength(1);
  });
});

describe("toPayload", () => {
  it("numera desde 1 admitiendo empates: un tándem NO salta el número siguiente", () => {
    const d = draft([[work("a")], [work("b")], [work("c"), work("d")], [work("e")]]);
    const positions = toPayload(d).entries.map((e) => [e.item_id, e.position]);
    expect(positions).toEqual([["a", 1], ["b", 2], ["c", 3], ["d", 3], ["e", 4]]);
  });

  it("la zona determina el placement, y fuera de la secuencia no hay número", () => {
    const p = toPayload(draft([[work("a")]], [work("f")], [work("u")]));
    expect(p.entries).toEqual([
      { item_type: "book", item_id: "a", position: 1, placement: "fijo", optional: false, role: null },
      { item_type: "book", item_id: "f", position: null, placement: "libre", optional: false, role: null },
      { item_type: "book", item_id: "u", position: null, placement: null, optional: false, role: null },
    ]);
  });

  it("los bloques van en `blocks`, nunca en `entries`, y sin rol", () => {
    const p = toPayload(draft([[block("g")], [work("a")]]));
    expect(p.entries.map((e) => e.item_id)).toEqual(["a"]);
    expect(p.blocks).toEqual([
      { child_saga_id: "g", position_in_parent: 1, placement_in_parent: "fijo", optional_in_parent: false },
    ]);
  });

  it("`removed` viaja tal cual, separado por tipo", () => {
    const d = removeEntry(removeEntry(draft([[work("a")], [block("g")]]), "i:book:a"), "s:g");
    expect(toPayload(d).removed).toEqual([{ item_type: "book", item_id: "a" }]);
    expect(toPayload(d).removedBlocks).toEqual([]);
  });
});

describe("setOptional / setRole", () => {
  it("cambian solo la fila apuntada, en cualquier zona", () => {
    const d = setRole(setOptional(draft([[work("a")]], [work("f")]), "i:book:f", true), "i:book:a", "spin_off");
    expect(d.free[0].optional).toBe(true);
    expect(d.slots[0][0].role).toBe("spin_off");
    expect(d.free[0].role).toBeNull();
  });

  it("un bloque nunca guarda rol: setRole lo ignora", () => {
    const d = setRole(draft([[block("g")]]), "s:g", "spin_off");
    expect(d.slots[0][0].role).toBeNull();
  });
});
