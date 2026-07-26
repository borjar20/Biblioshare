import { expect, it } from "vitest";
import { validateSequenceDraft } from "./validate-sequence-draft";
import type { SequencePayload } from "./sequence-draft";

const base: SequencePayload = { entries: [], blocks: [], removed: [], removedBlocks: [], windows: [] };
const ctx = { childIds: new Set(["hija-1"]) };
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
  item_type: "book", item_id: "f", child_saga_id: null,
  after_item_type: null, after_item_id: null, after_child_saga_id: null,
  before_item_type: null, before_item_id: null, before_child_saga_id: null,
  ...overrides,
});

it("rechaza la ventana de una entrada que no es `libre` en el propio payload", () => {
  const entries = [item("f", 1, "fijo"), item("a", null, "libre")];
  const windows = [window({ after_item_id: "a", after_item_type: "book" })];
  const r = validateSequenceDraft({ ...base, entries, windows }, { ...ctx, anchorKeys: new Set(["i:book:a"]) });
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

it("rechaza un ancla que apunta a su propio sujeto", () => {
  const entries = [item("f", null, "libre")];
  const windows = [window({ after_item_id: "f", after_item_type: "book" })];
  const r = validateSequenceDraft({ ...base, entries, windows }, { ...ctx, anchorKeys: new Set(["i:book:f"]) });
  expect(r.errors).toEqual(["windowSelfAnchor"]);
});

it("acepta un ancla que apunta a otra entrada", () => {
  const entries = [item("f", null, "libre")];
  const windows = [window({ after_item_id: "a", after_item_type: "book" })];
  const r = validateSequenceDraft({ ...base, entries, windows }, { ...ctx, anchorKeys: new Set(["i:book:a"]) });
  expect(r.errors).toEqual([]);
});

it("rechaza un ancla fuera del subárbol", () => {
  const entries = [item("f", null, "libre")];
  const windows = [window({ after_item_id: "x", after_item_type: "book" })];
  const r = validateSequenceDraft({ ...base, entries, windows }, { ...ctx, anchorKeys: new Set() });
  expect(r.errors).toEqual(["windowForeignAnchor"]);
});

it("acepta un ancla dentro del subárbol", () => {
  const entries = [item("f", null, "libre")];
  const windows = [window({ after_item_id: "x", after_item_type: "book" })];
  const r = validateSequenceDraft({ ...base, entries, windows }, { ...ctx, anchorKeys: new Set(["i:book:x"]) });
  expect(r.errors).toEqual([]);
});
