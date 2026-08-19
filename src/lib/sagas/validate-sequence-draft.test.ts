import { describe, expect, it } from "vitest";
import { validateSequenceDraft } from "./validate-sequence-draft";
import type { SequencePayload } from "./sequence-draft";

const base: SequencePayload = {
  entries: [], blocks: [], removed: [], removedBlocks: [], windows: [], windowSubjects: [], tandems: [],
};
// `windowOwners` (fase 4) responde a la vez a «¿puede este sujeto tener
// ventana?» y «¿bajo qué saga vive su fila?». El sujeto por defecto del helper
// `window()` de abajo es `i:book:f`, así que va aquí; las pruebas que esperan
// que se rechace lo sobrescriben con un mapa vacío.
const ctx = {
  childIds: new Set(["hija-1"]),
  anchorKeys: new Set<string>(),
  windowOwners: new Map([["i:book:f", "saga"]]),
};
const item = (id: string, position: number | null, placement: SequencePayload["entries"][number]["placement"]) =>
  ({ item_type: "book" as const, item_id: id, position, placement, optional: false, role: null });

it("un payload correcto no da errores", () => {
  const r = validateSequenceDraft({ ...base, entries: [item("a", 1, "fijo"), item("b", 2, "fijo")] }, ctx);
  expect(r.errors).toEqual([]);
  expect(r.unclassified).toBe(0);
});

it("acepta un empate: dos obras en el hueco 3 y la siguiente en el 4", () => {
  const entries = [item("a", 1, "fijo"), item("b", 2, "fijo"), item("c", 3, "fijo"), item("d", 3, "fijo"), item("e", 4, "fijo")];
  expect(validateSequenceDraft({ ...base, entries }, ctx).errors).toEqual([]);
});

it("rechaza un hueco saltado", () => {
  const entries = [item("a", 1, "fijo"), item("c", 3, "fijo")];
  expect(validateSequenceDraft({ ...base, entries }, ctx).errors).toContain("positions");
});

it("rechaza `fijo` sin número y `libre` con número — el invariante del CHECK", () => {
  expect(validateSequenceDraft({ ...base, entries: [item("a", null, "fijo")] }, ctx).errors).toContain("placement");
  expect(validateSequenceDraft({ ...base, entries: [item("a", 1, "libre")] }, ctx).errors).toContain("placement");
});

it("rechaza un bloque que no es hija DIRECTA de esta saga", () => {
  const blocks = [{ child_saga_id: "ajena", position_in_parent: 1, placement_in_parent: "fijo" as const, optional_in_parent: false }];
  expect(validateSequenceDraft({ ...base, blocks }, ctx).errors).toContain("foreignBlock");
});

it("rechaza la misma obra dos veces", () => {
  const entries = [item("a", 1, "fijo"), item("a", 2, "fijo")];
  expect(validateSequenceDraft({ ...base, entries }, ctx).errors).toContain("duplicate");
});

it("cuenta las sin clasificar como AVISO, sin bloquear", () => {
  const entries = [item("a", 1, "fijo"), item("u", null, null), item("v", null, null)];
  const r = validateSequenceDraft({ ...base, entries }, ctx);
  expect(r.errors).toEqual([]);
  expect(r.unclassified).toBe(2);
});

it("los huecos de obras y bloques comparten numeración", () => {
  const entries = [item("a", 1, "fijo")];
  const blocks = [{ child_saga_id: "hija-1", position_in_parent: 2, placement_in_parent: "fijo" as const, optional_in_parent: false }];
  expect(validateSequenceDraft({ ...base, entries, blocks }, ctx).errors).toEqual([]);
});

it("un bloque que rompe la consecutividad falla, aunque las obras estén bien", () => {
  // Contraparte negativa de la prueba de arriba: sin esta, un bug que sacara
  // los bloques del cálculo de posiciones pasaría desapercibido.
  const entries = [item("a", 1, "fijo")];
  const blocks = [{ child_saga_id: "hija-1", position_in_parent: 3, placement_in_parent: "fijo" as const, optional_in_parent: false }];
  expect(validateSequenceDraft({ ...base, entries, blocks }, ctx).errors).toContain("positions");
});

it("los bloques sin clasificar también cuentan como aviso", () => {
  const blocks = [{ child_saga_id: "hija-1", position_in_parent: null, placement_in_parent: null, optional_in_parent: false }];
  const r = validateSequenceDraft({ ...base, blocks }, ctx);
  expect(r.errors).toEqual([]);
  expect(r.unclassified).toBe(1);
});

const window = (overrides: Partial<SequencePayload["windows"][number]> = {}): SequencePayload["windows"][number] => ({
  saga_id: "saga",
  item_type: "book", item_id: "f", child_saga_id: null,
  after_item_type: null, after_item_id: null, after_child_saga_id: null,
  motivo: null,
  before_item_type: null, before_item_id: null, before_child_saga_id: null,
  ...overrides,
});

it("rechaza la ventana de un sujeto que no puede tenerla (no es `libre`)", () => {
  // Desde la fase 4 «puede tener ventana» lo decide `windowOwners` —resuelto
  // contra BD en servidor, contra el borrador vivo en cliente— y no el
  // placement que venga en el propio payload.
  const entries = [item("f", 1, "fijo"), item("a", null, "libre")];
  const windows = [window({ after_item_id: "a", after_item_type: "book" })];
  const r = validateSequenceDraft(
    { ...base, entries, windows },
    { ...ctx, anchorKeys: new Set(["i:book:a"]), windowOwners: new Map() },
  );
  expect(r.errors).toEqual(["windowNotFree"]);
});

it("acepta la ventana de una entrada que sí es `libre`", () => {
  const entries = [item("f", null, "libre"), item("a", null, "libre")];
  const windows = [window({ after_item_id: "a", after_item_type: "book" })];
  const r = validateSequenceDraft({ ...base, entries, windows }, { ...ctx, anchorKeys: new Set(["i:book:a"]) });
  expect(r.errors).toEqual([]);
});

it("rechaza una ventana sin ninguna ancla", () => {
  const entries = [item("f", null, "libre")];
  const windows = [window()];
  const r = validateSequenceDraft({ ...base, entries, windows }, ctx);
  expect(r.errors).toEqual(["windowNoAnchor"]);
});

it("acepta una ventana con al menos un ancla", () => {
  const entries = [item("f", null, "libre"), item("a", null, "libre")];
  const windows = [window({ after_item_id: "a", after_item_type: "book" })];
  const r = validateSequenceDraft({ ...base, entries, windows }, { ...ctx, anchorKeys: new Set(["i:book:a"]) });
  expect(r.errors).toEqual([]);
});

it("rechaza un ancla `after` que apunta a su propio sujeto", () => {
  const entries = [item("f", null, "libre")];
  const windows = [window({ after_item_id: "f", after_item_type: "book" })];
  const r = validateSequenceDraft({ ...base, entries, windows }, { ...ctx, anchorKeys: new Set(["i:book:f"]) });
  expect(r.errors).toEqual(["windowSelfAnchor"]);
});

it("rechaza un ancla `before` que apunta a su propio sujeto", () => {
  // Contraparte de la prueba de arriba por el otro lado: `windowSelfAnchor` se
  // comprueba dos veces en el código, una por rama, y solo la de `after`
  // estaba cubierta — desactivar la de `before` dejaba la suite en verde.
  const entries = [item("f", null, "libre")];
  const windows = [window({ before_item_id: "f", before_item_type: "book" })];
  const r = validateSequenceDraft({ ...base, entries, windows }, { ...ctx, anchorKeys: new Set(["i:book:f"]) });
  expect(r.errors).toEqual(["windowSelfAnchor"]);
});

it("acepta un ancla que apunta a otra entrada", () => {
  const entries = [item("f", null, "libre")];
  const windows = [window({ after_item_id: "a", after_item_type: "book" })];
  const r = validateSequenceDraft({ ...base, entries, windows }, { ...ctx, anchorKeys: new Set(["i:book:a"]) });
  expect(r.errors).toEqual([]);
});

it("rechaza un ancla `after` fuera del subárbol", () => {
  const entries = [item("f", null, "libre")];
  const windows = [window({ after_item_id: "x", after_item_type: "book" })];
  const r = validateSequenceDraft({ ...base, entries, windows }, { ...ctx, anchorKeys: new Set() });
  expect(r.errors).toEqual(["windowForeignAnchor"]);
});

it("rechaza un ancla `before` fuera del subárbol", () => {
  // Contraparte de la prueba de arriba: `windowForeignAnchor` también se
  // comprueba dos veces, una por rama, y solo `after` estaba cubierta.
  const entries = [item("f", null, "libre")];
  const windows = [window({ before_item_id: "x", before_item_type: "book" })];
  const r = validateSequenceDraft({ ...base, entries, windows }, { ...ctx, anchorKeys: new Set() });
  expect(r.errors).toEqual(["windowForeignAnchor"]);
});

it("acepta un ancla dentro del subárbol", () => {
  const entries = [item("f", null, "libre")];
  const windows = [window({ after_item_id: "x", after_item_type: "book" })];
  const r = validateSequenceDraft({ ...base, entries, windows }, { ...ctx, anchorKeys: new Set(["i:book:x"]) });
  expect(r.errors).toEqual([]);
});

describe("ventanas con dueña (fase 4)", () => {
  const win = (sagaId: string, itemId: string) => ({
    saga_id: sagaId, item_type: "book" as const, item_id: itemId, child_saga_id: null,
    after_item_type: "book" as const, after_item_id: "ancla", after_child_saga_id: null,
    before_item_type: null, before_item_id: null, before_child_saga_id: null,
    motivo: null,
  });
  const ownerCtx = {
    childIds: new Set<string>(),
    anchorKeys: new Set(["i:book:ancla"]),
    windowOwners: new Map([["i:book:x", "hija"]]),
  };

  it("un sujeto que no puede tener ventana se rechaza", () => {
    expect(validateSequenceDraft({ ...base, windows: [win("hija", "z")] }, ownerCtx).errors).toEqual([
      "windowNotFree",
    ]);
  });

  it("el sujeto correcto bajo la saga correcta pasa", () => {
    expect(validateSequenceDraft({ ...base, windows: [win("hija", "x")] }, ownerCtx).errors).toEqual([]);
  });

  it("el sujeto correcto bajo OTRA saga se rechaza: la fila iría al sitio equivocado", () => {
    expect(validateSequenceDraft({ ...base, windows: [win("padre", "x")] }, ownerCtx).errors).toEqual([
      "windowWrongOwner",
    ]);
  });
});

describe("anchored sin ventana", () => {
  it("marca `anchoredNoWindow` si una entrada anclada no tiene ventana", () => {
    const p: SequencePayload = {
      ...base,
      entries: [{ item_type: "book", item_id: "hulk", position: null, placement: "anclado", optional: false, role: null }],
    };
    expect(validateSequenceDraft(p, ctx).errors).toContain("anchoredNoWindow");
  });

  it("no marca error si la entrada anclada trae su ventana", () => {
    const p: SequencePayload = {
      ...base,
      entries: [{ item_type: "book", item_id: "hulk", position: null, placement: "anclado", optional: false, role: null }],
      windows: [{
        saga_id: "UCM", item_type: "book", item_id: "hulk", child_saga_id: null,
        after_item_type: "book", after_item_id: "im1", after_child_saga_id: null,
        before_item_type: null, before_item_id: null, before_child_saga_id: null, motivo: null,
      }],
    };
    expect(validateSequenceDraft(p, { ...ctx, anchorKeys: new Set(["i:book:im1"]) }).errors).not.toContain("anchoredNoWindow");
  });
});

describe("tándems (fase 2)", () => {
  const entry = (id: string, position: number | null) => ({
    item_type: "book" as const, item_id: id, position, placement: (position === null ? null : "fijo") as null | "fijo",
    optional: false, role: null,
  });

  it("acepta metadatos sobre un hueco que de verdad comparten dos obras", () => {
    const p: SequencePayload = { ...base, entries: [entry("a", 1), entry("b", 1)], tandems: [{ position: 1, modo: "simultaneo", nota: null }] };
    expect(validateSequenceDraft(p, ctx).errors).toEqual([]);
  });

  it("rechaza metadatos en un hueco con una sola obra", () => {
    const p: SequencePayload = { ...base, entries: [entry("a", 1)], tandems: [{ position: 1, modo: "simultaneo", nota: null }] };
    expect(validateSequenceDraft(p, ctx).errors).toContain("tandemNotShared");
  });

  it("un hueco compartido entre una obra y un BLOQUE también cuenta", () => {
    const p: SequencePayload = {
      ...base,
      entries: [entry("a", 1)],
      blocks: [{ child_saga_id: "hija", position_in_parent: 1, placement_in_parent: "fijo", optional_in_parent: false }],
      tandems: [{ position: 1, modo: null, nota: "van juntos" }],
    };
    expect(validateSequenceDraft(p, { ...ctx, childIds: new Set(["hija"]) }).errors).toEqual([]);
  });

  it("rechaza una nota de más de 200 caracteres, el mismo tope que el CHECK", () => {
    const p: SequencePayload = { ...base, entries: [entry("a", 1), entry("b", 1)], tandems: [{ position: 1, modo: null, nota: "x".repeat(201) }] };
    expect(validateSequenceDraft(p, ctx).errors).toContain("tandemNoteTooLong");
  });
});
