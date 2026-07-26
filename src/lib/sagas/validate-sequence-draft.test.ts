import { describe, expect, it } from "vitest";
import { validateSequenceDraft } from "./validate-sequence-draft";
import type { SequencePayload } from "./sequence-draft";

const base: SequencePayload = { entries: [], blocks: [], removed: [], removedBlocks: [] };
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
