import { describe, expect, it, vi } from "vitest";
import { buildWindowOwners, windowOwnerFor, type OwnerBlock, type OwnerRow } from "./window-owners";

// Mock de server-only, mismo patrón que get-saga-sequence.test.ts: este módulo
// lo importa por `loadWindowOwners`, y sin el mock el import rompe en Vitest.
vi.mock("server-only", () => ({}));

const PADRE = "11111111-1111-1111-1111-111111111111";
const HIJA = "22222222-2222-2222-2222-222222222222";
const HERMANA = "33333333-3333-3333-3333-333333333333";

describe("windowOwnerFor", () => {
  it("manda is_primary", () => {
    expect(windowOwnerFor([{ sagaId: HIJA, isPrimary: false }, { sagaId: PADRE, isPrimary: true }], PADRE)).toBe(PADRE);
    expect(windowOwnerFor([{ sagaId: HIJA, isPrimary: true }, { sagaId: PADRE, isPrimary: false }], PADRE)).toBe(HIJA);
  });

  it("sin ninguna principal, gana la saga que se está curando si está entre ellas", () => {
    expect(windowOwnerFor([{ sagaId: HERMANA, isPrimary: false }, { sagaId: PADRE, isPrimary: false }], PADRE)).toBe(PADRE);
  });

  it("sin principal y sin la curada, desempata por id — determinista, no por orden de llegada", () => {
    const a = windowOwnerFor([{ sagaId: HERMANA, isPrimary: false }, { sagaId: HIJA, isPrimary: false }], PADRE);
    const b = windowOwnerFor([{ sagaId: HIJA, isPrimary: false }, { sagaId: HERMANA, isPrimary: false }], PADRE);
    expect(a).toBe(HIJA);
    expect(a).toBe(b);
  });

  it("sin membresías devuelve la curada: función total, nunca lanza", () => {
    expect(windowOwnerFor([], PADRE)).toBe(PADRE);
  });
});

describe("buildWindowOwners", () => {
  const row = (sagaId: string, itemId: string, placement: OwnerRow["placement"], isPrimary = true): OwnerRow => ({
    sagaId, itemType: "book", itemId, placement, isPrimary,
  });

  it("solo lo `libre` es sujeto: una obra con hueco fijo YA tiene sitio", () => {
    const owners = buildWindowOwners([row(PADRE, "a", "fijo"), row(PADRE, "b", "libre")], [], PADRE);
    expect([...owners.keys()]).toEqual(["i:book:b"]);
    expect(owners.get("i:book:b")).toBe(PADRE);
  });

  it("una obra `libre` de la HIJA es sujeto, y su fila vive bajo la hija", () => {
    expect(buildWindowOwners([row(HIJA, "c", "libre")], [], PADRE).get("i:book:c")).toBe(HIJA);
  });

  it("sin clasificar tampoco es sujeto", () => {
    expect(buildWindowOwners([row(PADRE, "a", null)], [], PADRE).size).toBe(0);
  });

  it("doble membresía: basta con que UNA sea libre, y la dueña la decide is_primary", () => {
    const owners = buildWindowOwners(
      [row(PADRE, "d", "fijo", false), row(HIJA, "d", "libre", true)],
      [],
      PADRE,
    );
    expect(owners.get("i:book:d")).toBe(HIJA);
  });

  it("un BLOQUE libre es sujeto, y su fila vive bajo el padre que lo coloca", () => {
    const blocks: OwnerBlock[] = [
      { childSagaId: HIJA, placementInParent: "libre" },
      { childSagaId: HERMANA, placementInParent: "fijo" },
    ];
    const owners = buildWindowOwners([], blocks, PADRE);
    expect([...owners.keys()]).toEqual([`s:${HIJA}`]);
    expect(owners.get(`s:${HIJA}`)).toBe(PADRE);
  });
});
