import { describe, expect, it } from "vitest";
import { hydrateRouteDraft, type RouteEditorItem } from "./hydrate-route-draft";
import type { RawRouteEntry } from "./route-types";

const entry = (over: Partial<RawRouteEntry> & { position: number }): RawRouteEntry => ({
  itemType: null,
  itemId: null,
  childSagaId: null,
  note: null,
  ...over,
});

describe("hydrateRouteDraft", () => {
  // Hallazgo Important de la revisión final de rama: la paleta se construye
  // en page.tsx SIEMPRE con note: null (es un placeholder para pasos que aún
  // no están en el borrador, no una nota "por defecto"). Si al casar una
  // entrada guardada con su ítem de paleta se devuelve el objeto de la
  // paleta tal cual, la nota real de BD se pierde en cuanto el curador pulsa
  // Guardar sin tocar nada — pérdida de datos silenciosa.
  it("conserva la note real de la entrada guardada aunque case con la paleta", () => {
    const palette: RouteEditorItem[] = [
      { key: "i:book:a", label: "Libro A", entry: { itemType: "book", itemId: "a", childSagaId: null, note: null } },
    ];
    const entries: RawRouteEntry[] = [
      entry({ position: 1, itemType: "book", itemId: "a", note: "aquí puedes parar" }),
    ];

    const draft = hydrateRouteDraft(entries, palette);

    expect(draft).toHaveLength(1);
    expect(draft[0].entry.note).toBe("aquí puedes parar");
    // El resto de la entrada (label, itemType/itemId) sigue viniendo de la
    // paleta: solo la nota se sobreescribe con el valor real.
    expect(draft[0].label).toBe("Libro A");
  });

  it("conserva la note de un bloque-subsaga que casa con la paleta", () => {
    const palette: RouteEditorItem[] = [
      { key: "s:guardia", label: "La Guardia", entry: { itemType: null, itemId: null, childSagaId: "guardia", note: null } },
    ];
    const entries: RawRouteEntry[] = [entry({ position: 1, childSagaId: "guardia", note: "empieza aquí" })];

    const draft = hydrateRouteDraft(entries, palette);

    expect(draft[0].entry.note).toBe("empieza aquí");
  });

  it("una entrada sin nota se hidrata con note: null aunque la paleta también lo traiga null", () => {
    const palette: RouteEditorItem[] = [
      { key: "i:book:a", label: "Libro A", entry: { itemType: "book", itemId: "a", childSagaId: null, note: null } },
    ];
    const entries: RawRouteEntry[] = [entry({ position: 1, itemType: "book", itemId: "a", note: null })];

    const draft = hydrateRouteDraft(entries, palette);

    expect(draft[0].entry.note).toBeNull();
  });

  it("una entrada huérfana (ya no está en la paleta) conserva su note vía fallback", () => {
    const entries: RawRouteEntry[] = [
      entry({ position: 1, itemType: "book", itemId: "borrado", note: "nota huérfana" }),
    ];

    const draft = hydrateRouteDraft(entries, []);

    expect(draft).toHaveLength(1);
    expect(draft[0].key).toBe("i:book:borrado");
    expect(draft[0].entry.note).toBe("nota huérfana");
  });

  it("ordena por position independientemente del orden de entrada", () => {
    const entries: RawRouteEntry[] = [
      entry({ position: 2, itemType: "book", itemId: "b" }),
      entry({ position: 1, itemType: "book", itemId: "a" }),
    ];

    const draft = hydrateRouteDraft(entries, []);

    expect(draft.map((d) => d.key)).toEqual(["i:book:a", "i:book:b"]);
  });
});
