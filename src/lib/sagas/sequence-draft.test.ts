import { describe, expect, it } from "vitest";
import {
  addEntry, clearAnchor, draftWindowOwners, moveSlot, pairWith, removeEntry, sendTo, setAnchor,
  setOptional, setRole, setTandemMeta, setWindowReason, toPayload, unpair,
  type DraftAnchor, type DraftEntry, type NestedSubject, type SequenceDraft,
} from "./sequence-draft";

// `ownerSagaId` por defecto «saga» (fase 4): la dueña de la fila de ventana.
// En las pruebas que no hablan de dueños es ruido de fondo, así que vive en el
// helper y no en cada literal.
const work = (id: string, title = id): DraftEntry => ({
  key: `i:book:${id}`, kind: "item", itemType: "book", itemId: id, childSagaId: null,
  title, coverUrl: null, accentColor: null, count: null, optional: false, role: null, window: null,
  ownerSagaId: "saga", isNew: false,
});
const block = (id: string): DraftEntry => ({
  key: `s:${id}`, kind: "block", itemType: null, itemId: null, childSagaId: id,
  title: id, coverUrl: null, accentColor: "verde", count: 8, optional: false, role: null, window: null,
  ownerSagaId: "saga", isNew: false,
});
// Recibe los huecos como arrays de entradas —la ergonomía que tenía antes de
// que un hueco fuera un objeto (fase 2)— y los envuelve. Así los tests que ya
// existían solo cambian donde INSPECCIONAN un hueco, no donde lo construyen.
const draft = (
  slots: DraftEntry[][],
  free: DraftEntry[] = [],
  unclassified: DraftEntry[] = [],
  nested: SequenceDraft["nested"] = [],
  anchored: DraftEntry[] = [],
): SequenceDraft => ({
  slots: slots.map((entries) => ({ entries, mode: null, note: null })),
  free,
  anchored,
  unclassified,
  removed: [],
  nested,
});

describe("moveSlot", () => {
  it("intercambia el hueco con su vecino y no toca los demás", () => {
    const d = moveSlot(draft([[work("a")], [work("b")], [work("c")]]), 0, 1);
    expect(d.slots.map((s) => s.entries[0].itemId)).toEqual(["b", "a", "c"]);
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
    expect(d.slots[0].entries.map((e) => e.itemId)).toEqual(["a", "c"]);
    expect(d.slots[1].entries[0].itemId).toBe("b");
  });

  it("deshacer un tándem devuelve huecos consecutivos en el sitio del empate", () => {
    const d = unpair(draft([[work("a"), work("c")], [work("b")]]), 0);
    expect(d.slots.map((s) => s.entries.map((e) => e.itemId))).toEqual([["a"], ["c"], ["b"]]);
  });

  it("emparejar desde un hueco ANTERIOR al destino no pierde la entrada", () => {
    // Al sacar `a` del hueco 0 los índices se corren, así que resolver el
    // destino por índice a ciegas apuntaría al hueco equivocado.
    const d = pairWith(draft([[work("a")], [work("b")], [work("c")]]), "i:book:a", 2);
    expect(d.slots.map((s) => s.entries.map((e) => e.itemId))).toEqual([["b"], ["c", "a"]]);
  });

  it("emparejar una fila con su propio hueco es un no-op", () => {
    const d = draft([[work("a"), work("b")], [work("c")]]);
    expect(pairWith(d, "i:book:b", 0)).toEqual(d);
  });
});

describe("sendTo", () => {
  it("mover a «Cuando quieras» saca la fila de la secuencia y cierra el hueco", () => {
    const d = sendTo(draft([[work("a")], [work("b")]]), "i:book:a", "free");
    expect(d.slots.map((s) => s.entries[0].itemId)).toEqual(["b"]);
    expect(d.free.map((e) => e.itemId)).toEqual(["a"]);
  });

  it("mover a la secuencia añade un hueco AL FINAL", () => {
    const d = sendTo(draft([[work("a")]], [], [work("z")]), "i:book:z", "sequence");
    expect(d.slots.map((s) => s.entries[0].itemId)).toEqual(["a", "z"]);
    expect(d.unclassified).toHaveLength(0);
  });

  it("sacar de un tándem al resto del hueco NO lo destruye", () => {
    const d = sendTo(draft([[work("a"), work("c")]]), "i:book:c", "free");
    expect(d.slots.map((s) => s.entries.map((e) => e.itemId))).toEqual([["a"]]);
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
    const positions = toPayload(d, "saga").entries.map((e) => [e.item_id, e.position]);
    expect(positions).toEqual([["a", 1], ["b", 2], ["c", 3], ["d", 3], ["e", 4]]);
  });

  it("la zona determina el placement, y fuera de la secuencia no hay número", () => {
    const p = toPayload(draft([[work("a")]], [work("f")], [work("u")]), "saga");
    expect(p.entries).toEqual([
      { item_type: "book", item_id: "a", position: 1, placement: "fijo", optional: false, role: null },
      { item_type: "book", item_id: "f", position: null, placement: "libre", optional: false, role: null },
      { item_type: "book", item_id: "u", position: null, placement: null, optional: false, role: null },
    ]);
  });

  it("los bloques van en `blocks`, nunca en `entries`, y sin rol", () => {
    const p = toPayload(draft([[block("g")], [work("a")]]), "saga");
    expect(p.entries.map((e) => e.item_id)).toEqual(["a"]);
    expect(p.blocks).toEqual([
      { child_saga_id: "g", position_in_parent: 1, placement_in_parent: "fijo", optional_in_parent: false },
    ]);
  });

  it("`removed` viaja tal cual, separado por tipo", () => {
    const d = removeEntry(removeEntry(draft([[work("a")], [block("g")]]), "i:book:a"), "s:g");
    expect(toPayload(d, "saga").removed).toEqual([{ item_type: "book", item_id: "a" }]);
    expect(toPayload(d, "saga").removedBlocks).toEqual([]);
  });
});

describe("setOptional / setRole", () => {
  it("cambian solo la fila apuntada, en cualquier zona", () => {
    const d = setRole(setOptional(draft([[work("a")]], [work("f")]), "i:book:f", true), "i:book:a", "spin_off");
    expect(d.free[0].optional).toBe(true);
    expect(d.slots[0].entries[0].role).toBe("spin_off");
    expect(d.free[0].role).toBeNull();
  });

  it("un bloque nunca guarda rol: setRole lo ignora", () => {
    const d = setRole(draft([[block("g")]]), "s:g", "spin_off");
    expect(d.slots[0].entries[0].role).toBeNull();
  });
});

const anchor = (title: string): DraftAnchor => ({
  kind: "block", itemType: null, itemId: null, childSagaId: `saga-${title}`, title,
});

describe("ventanas", () => {
  it("poner un ancla la deja en la entrada", () => {
    const d = setAnchor(draft([], [work("f")]), "i:book:f", "after", anchor("Era 1"));
    expect(d.free[0].window).toEqual({ after: anchor("Era 1"), before: null, reason: null });
  });

  it("quitar la última ancla deja la ventana en null, no en un objeto vacío", () => {
    // Una ventana sin anclas no existe: el CHECK de BD la rechaza, así que el
    // borrador tampoco puede tenerla.
    const conAncla = setAnchor(draft([], [work("f")]), "i:book:f", "after", anchor("Era 1"));
    expect(clearAnchor(conAncla, "i:book:f", "after").free[0].window).toBeNull();
  });

  it("sacar la fila de «Cuando quieras» se lleva su ventana por delante", () => {
    // Es la coherencia que ningún CHECK entre tablas puede imponer.
    const conAncla = setAnchor(draft([], [work("f")]), "i:book:f", "after", anchor("Era 1"));
    const movida = sendTo(conAncla, "i:book:f", "sequence");
    expect(movida.slots[0].entries[0].window).toBeNull();
  });

  it("una entrada fuera de la zona libre no admite ancla", () => {
    const d = draft([[work("a")]]);
    expect(setAnchor(d, "i:book:a", "after", anchor("Era 1"))).toEqual(d);
  });

  it("emparejar una fila de «Cuando quieras» con un hueco fijo se lleva su ventana por delante", () => {
    // `pairWith` es OTRA vía de salida de `free` hacia `slots`, distinta de
    // `sendTo`. Sin esta limpieza la entrada llegaba a `d.slots` con `window`
    // no nulo, rompiendo la invariante «solo `free` tiene ventana».
    const conAncla = setAnchor(draft([[work("a")]], [work("f")]), "i:book:f", "after", anchor("Era 1"));
    const emparejada = pairWith(conAncla, "i:book:f", 0);
    expect(emparejada.slots[0].entries.map((e) => e.itemId)).toEqual(["a", "f"]);
    expect(emparejada.slots[0].entries[1].window).toBeNull();
  });

  it("toPayload lleva las ventanas, y solo las de la zona libre", () => {
    const d = setAnchor(draft([[work("a")]], [work("f")]), "i:book:f", "before", anchor("Viento"));
    const p = toPayload(d, "saga");
    expect(p.windows).toEqual([
      {
        // `saga_id` desde la fase 4: la fila viaja con su saga DUEÑA, ya no la
        // pone el RPC a partir de `p_saga_id`.
        saga_id: "saga",
        item_type: "book", item_id: "f", child_saga_id: null,
        after_item_type: null, after_item_id: null, after_child_saga_id: null,
        before_item_type: null, before_item_id: null, before_child_saga_id: "saga-Viento",
        motivo: null,
      },
    ]);
  });

  it("addEntry limpia la ventana de una entrada que viene con ella", () => {
    const entryWithWindow: DraftEntry = {
      ...work("nuevo"),
      window: { after: anchor("Era 1"), before: null, reason: null },
    };
    const d = addEntry(draft([[work("a")]]), entryWithWindow);
    expect(d.slots).toHaveLength(2);
    expect(d.slots[1].entries[0].window).toBeNull();
    expect(d.slots[1].entries[0].itemId).toBe("nuevo");
  });
});

describe("ventanas de sujetos anidados (fase 4)", () => {
  const nestedSubject: NestedSubject = {
    key: "i:book:x", ownerSagaId: "hija", childSagaId: "hija",
    itemType: "book", itemId: "x", title: "Anidada", coverUrl: null, window: null,
  };
  const anchor: DraftAnchor = {
    kind: "item", itemType: "book", itemId: "y", childSagaId: null, title: "Ancla",
  };

  it("setAnchor alcanza a un sujeto anidado", () => {
    const next = setAnchor(draft([], [], [], [nestedSubject]), "i:book:x", "after", anchor);
    expect(next.nested[0].window).toEqual({ after: anchor, before: null, reason: null });
  });

  it("clearAnchor deja la ventana anidada a null cuando quita la última ancla", () => {
    const d = draft([], [], [], [{ ...nestedSubject, window: { after: anchor, before: null, reason: null } }]);
    expect(clearAnchor(d, "i:book:x", "after").nested[0].window).toBeNull();
  });

  it("una clave que no está ni en `free` ni en `nested` es un no-op", () => {
    const d = draft([], [], [], [nestedSubject]);
    expect(setAnchor(d, "i:book:fantasma", "after", anchor)).toEqual(d);
  });

  it("draftWindowOwners junta la zona libre y los anidados, con su dueña", () => {
    const free = { ...work("a"), ownerSagaId: "padre" };
    const d = draft([], [free], [], [nestedSubject]);
    expect(draftWindowOwners(d)).toEqual(new Map([["i:book:a", "padre"], ["i:book:x", "hija"]]));
  });
});

describe("toPayload: ventanas y sujetos (fase 4)", () => {
  const anch: DraftAnchor = {
    kind: "item", itemType: "book", itemId: "y", childSagaId: null, title: "Ancla",
  };
  const free = { ...work("a"), ownerSagaId: "padre", window: { after: anch, before: null, reason: null } };
  const nested: NestedSubject = {
    key: "i:book:x", ownerSagaId: "hija", childSagaId: "hija",
    itemType: "book", itemId: "x", title: "Anidada", coverUrl: null,
    window: { after: anch, before: null, reason: null },
  };

  it("cada fila de ventana lleva la saga DUEÑA, no la que se cura", () => {
    const p = toPayload(draft([], [free], [], [nested]), "padre");
    expect(p.windows.map((w) => [w.item_id, w.saga_id])).toEqual([["a", "padre"], ["x", "hija"]]);
  });

  it("los sujetos incluyen TODAS las zonas, las bajas y los anidados", () => {
    const fijo = { ...work("f"), ownerSagaId: "padre" };
    const sin = { ...work("s"), ownerSagaId: "padre" };
    const p = toPayload(
      {
        slots: [{ entries: [fijo], mode: null, note: null }],
        free: [free],
        anchored: [],
        unclassified: [sin],
        removed: ["i:book:borrada"],
        nested: [nested],
      },
      "padre",
    );
    expect(p.windowSubjects).toEqual([
      { saga_id: "padre", item_type: "book", item_id: "f", child_saga_id: null },
      { saga_id: "padre", item_type: "book", item_id: "a", child_saga_id: null },
      { saga_id: "padre", item_type: "book", item_id: "s", child_saga_id: null },
      { saga_id: "padre", item_type: "book", item_id: "borrada", child_saga_id: null },
      { saga_id: "hija", item_type: "book", item_id: "x", child_saga_id: null },
    ]);
  });

  it("una entrada que sale de «Cuando quieras» sigue siendo sujeto: es lo que borra su ventana", () => {
    // Sin ventana en `windows` pero SÍ en `windowSubjects`: el RPC borra la fila
    // y no reinserta nada. Es la coherencia que ningún CHECK entre tablas puede
    // dar, y la razón de que el borrado sea por sujeto y no por omisión.
    const movida = { ...work("a"), ownerSagaId: "padre", window: null };
    const p = toPayload(draft([[movida]]), "padre");
    expect(p.windows).toEqual([]);
    expect(p.windowSubjects).toEqual([{ saga_id: "padre", item_type: "book", item_id: "a", child_saga_id: null }]);
  });

  it("un BLOQUE es sujeto con child_saga_id, no con item_id", () => {
    const blk = { ...block("hija"), ownerSagaId: "padre" };
    const p = toPayload(draft([], [blk]), "padre");
    expect(p.windowSubjects).toEqual([{ saga_id: "padre", item_type: null, item_id: null, child_saga_id: "hija" }]);
  });

  it("una baja de BLOQUE se apunta como sujeto de bloque", () => {
    const p = toPayload(
      { slots: [], free: [], anchored: [], unclassified: [], removed: ["s:hija"], nested: [] },
      "padre",
    );
    expect(p.windowSubjects).toEqual([{ saga_id: "padre", item_type: null, item_id: null, child_saga_id: "hija" }]);
  });
});

// Regresión encontrada al inyectar fallos sobre los e2e de la fase 4: una obra
// con fila en ESTA saga y `libre` en una hija (con `is_primary` en la hija)
// tiene su ventana bajo la hija, pero el cajón NO la lista —`getSagaSequence`
// excluye de `nested` lo que ya es entrada propia—, así que nadie la reemite.
// Si esta pantalla la reclamara como sujeto bajo la hija, el RPC la borraría y
// no repondría nada: pérdida silenciosa, justo la que la fase 4 viene a cerrar.
describe("un sujeto solo se reclama bajo la saga cuya ventana esta pantalla enseña", () => {
  it("fuera de «Cuando quieras», el sujeto va bajo la saga PROPIA aunque su dueña sea otra", () => {
    const ajena = { ...work("a"), ownerSagaId: "hija" };
    const p = toPayload(draft([[ajena]], [], [{ ...work("u"), ownerSagaId: "hija" }]), "padre");
    expect(p.windowSubjects.map((s) => s.saga_id)).toEqual(["padre", "padre"]);
  });

  it("en «Cuando quieras» sí va bajo la dueña: ahí la pantalla la enseña y la reemite", () => {
    const libre = { ...work("f"), ownerSagaId: "hija" };
    const p = toPayload(draft([], [libre]), "padre");
    expect(p.windowSubjects).toEqual([
      { saga_id: "hija", item_type: "book", item_id: "f", child_saga_id: null },
    ]);
  });
});

describe("zona anchored", () => {
  const anchorItem: DraftAnchor = {
    kind: "item", itemType: "book", itemId: "im1", childSagaId: null, title: "IM1",
  };

  it("sendTo a `anchored` mueve la fila y conserva su ventana", () => {
    const conVentana = { ...work("hulk"), window: { after: anchorItem, before: null, reason: null } };
    const d = draft([], [], [], [], [conVentana]);
    const moved = sendTo(d, "i:book:hulk", "free");
    // Sale de anchored, entra en free (free también conserva ventana).
    expect(moved.anchored).toHaveLength(0);
    expect(moved.free).toHaveLength(1);
    expect(moved.free[0].window).not.toBeNull();
  });

  it("setAnchor funciona sobre una fila de `anchored`", () => {
    const d = draft([], [], [], [], [work("hulk")]);
    const next = setAnchor(d, "i:book:hulk", "after", anchorItem);
    expect(next.anchored[0].window?.after?.itemId).toBe("im1");
  });

  it("toPayload emite placement `anclado` y su fila de ventana", () => {
    const conVentana = { ...work("hulk"), window: { after: anchorItem, before: null, reason: null } };
    const d = draft([], [], [], [], [conVentana]);
    const p = toPayload(d, "UCM");
    expect(p.entries).toContainEqual(
      expect.objectContaining({ item_id: "hulk", placement: "anclado", position: null }),
    );
    expect(p.windows).toHaveLength(1);
    expect(p.windows[0]).toMatchObject({ saga_id: "saga", item_id: "hulk", after_item_id: "im1" });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Fase 2: los metadatos del HUECO (`saga_tandems`). Lo que se prueba aquí no
// es que se guarden, sino que VIAJAN CON SU HUECO: `moveSlot`, `pairWith`,
// `unpair` y `extract` cambian los índices —y `extract` puede borrar un hueco
// entero—, así que cualquier estructura paralela indexada por posición se
// desincroniza al primer reordenamiento, en silencio.
// ─────────────────────────────────────────────────────────────────────────
const tandemDraft = () => draft([[work("a"), work("b")]]);
const tandemDraftPlusOne = () => draft([[work("a"), work("b")], [work("c")]]);
const draftWith2Slots = () => draft([[work("a"), work("b")], [work("c"), work("d")]]);

describe("metadatos del hueco (fase 2)", () => {
  it("setTandemMeta guarda modo y nota en el hueco", () => {
    const d = setTandemMeta(draftWith2Slots(), 0, { mode: "simultaneo", note: "Dos caras del mismo asedio" });
    expect(d.slots[0].mode).toBe("simultaneo");
    expect(d.slots[0].note).toBe("Dos caras del mismo asedio");
    expect(d.slots[1].mode).toBeNull();
  });

  it("un hueco de una sola obra ignora los metadatos, como setRole ignora el rol de un bloque", () => {
    const d = setTandemMeta(draft([[work("a")]]), 0, { mode: "simultaneo", note: "no" });
    expect(d.slots[0].mode).toBeNull();
    expect(d.slots[0].note).toBeNull();
  });

  it("mover un hueco se lleva SUS metadatos, no los del vecino", () => {
    const d = setTandemMeta(draftWith2Slots(), 0, { mode: "indistinto", note: "cualquiera de los dos" });
    const moved = moveSlot(d, 0, 1);
    expect(moved.slots[1].mode).toBe("indistinto");
    expect(moved.slots[1].note).toBe("cualquiera de los dos");
    expect(moved.slots[0].mode).toBeNull();
  });

  it("deshacer el tándem (unpair) descarta los metadatos: ya no hay hueco compartido", () => {
    const d = setTandemMeta(tandemDraft(), 0, { mode: "simultaneo", note: "a la vez" });
    const split = unpair(d, 0);
    expect(split.slots).toHaveLength(2);
    expect(split.slots.every((s) => s.mode === null && s.note === null)).toBe(true);
  });

  it("sacar una obra deja al hueco con una sola: los metadatos se van con el tándem", () => {
    const d = setTandemMeta(tandemDraft(), 0, { mode: "simultaneo", note: "a la vez" });
    const out = sendTo(d, "i:book:b", "free");
    expect(out.slots[0].entries).toHaveLength(1);
    expect(out.slots[0].mode).toBeNull();
    expect(out.slots[0].note).toBeNull();
  });

  it("emparejar CON un tándem que ya declaró modo no lo borra", () => {
    const d = setTandemMeta(draft([[work("a"), work("b")], [work("c")]]), 0, { mode: "simultaneo", note: null });
    const paired = pairWith(d, "i:book:c", 0);
    expect(paired.slots[0].entries).toHaveLength(3);
    expect(paired.slots[0].mode).toBe("simultaneo");
  });

  it("toPayload emite el tándem con el número del HUECO", () => {
    const d = setTandemMeta(tandemDraft(), 0, { mode: "simultaneo", note: "a la vez" });
    expect(toPayload(d, "saga-1").tandems).toEqual([{ position: 1, modo: "simultaneo", nota: "a la vez" }]);
  });

  it("toPayload omite un hueco en tándem sin nada declarado", () => {
    expect(toPayload(tandemDraft(), "saga-1").tandems).toEqual([]);
  });

  it("toPayload recorta la nota y omite la que solo tiene espacios", () => {
    const d = setTandemMeta(tandemDraft(), 0, { mode: null, note: "   " });
    expect(toPayload(d, "saga-1").tandems).toEqual([]);
    const d2 = setTandemMeta(tandemDraft(), 0, { mode: null, note: "  con espacios  " });
    expect(toPayload(d2, "saga-1").tandems).toEqual([{ position: 1, modo: null, nota: "con espacios" }]);
  });

  it("el tándem comparte número y el hueco siguiente vale n+1, nunca n+2", () => {
    const d = setTandemMeta(tandemDraftPlusOne(), 0, { mode: "simultaneo", note: null });
    const p = toPayload(d, "saga-1");
    expect(p.tandems[0].position).toBe(1);
    expect(p.entries.filter((e) => e.position === 1)).toHaveLength(2);
    expect(p.entries.filter((e) => e.position === 2)).toHaveLength(1);
  });
});

// ── Fase 3: el motivo de la ventana ──────────────────────────────────────────
describe("setWindowReason", () => {
  const ancla = (title: string): DraftAnchor => ({
    kind: "block", itemType: null, itemId: null, childSagaId: `saga-${title}`, title,
  });
  const conVentana = () => setAnchor(draft([], [work("f")]), "i:book:f", "after", ancla("Era 1"));

  it("declara el motivo de una entrada libre que YA tiene ventana", () => {
    const d = setWindowReason(conVentana(), "i:book:f", "spoiler");
    expect(d.free[0].window).toEqual({ after: ancla("Era 1"), before: null, reason: "spoiler" });
  });

  it("es un no-op si el sujeto no tiene ventana: sin tramo no hay motivo del que hablar", () => {
    const d = draft([], [work("f")]);
    expect(setWindowReason(d, "i:book:f", "contexto").free[0].window).toBeNull();
  });

  it("vuelve a «sin declarar» con null, sin tocar las anclas", () => {
    const d = setWindowReason(setWindowReason(conVentana(), "i:book:f", "spoiler"), "i:book:f", null);
    expect(d.free[0].window).toEqual({ after: ancla("Era 1"), before: null, reason: null });
  });

  it("el motivo muere con la última ancla", () => {
    // Ningún CHECK puede imponerlo: `saga_placement_windows_needs_anchor`
    // rechaza la fila sin anclas, pero nadie borra la que ya existe.
    const d = setWindowReason(conVentana(), "i:book:f", "spoiler");
    expect(clearAnchor(d, "i:book:f", "after").free[0].window).toBeNull();
  });

  it("sacar la fila de «Cuando quieras» también se lleva el motivo", () => {
    const d = setWindowReason(conVentana(), "i:book:f", "spoiler");
    expect(sendTo(d, "i:book:f", "sequence").slots[0].entries[0].window).toBeNull();
  });

  it("una entrada fuera de la zona libre no admite motivo", () => {
    const d = draft([[work("a")]]);
    expect(setWindowReason(d, "i:book:a", "spoiler")).toEqual(d);
  });

  it("también vale para un sujeto anidado", () => {
    const anclaItem: DraftAnchor = {
      kind: "item", itemType: "book", itemId: "y", childSagaId: null, title: "Ancla",
    };
    const nested: NestedSubject = {
      key: "i:book:x", ownerSagaId: "hija", childSagaId: "hija",
      itemType: "book", itemId: "x", title: "Anidada", coverUrl: null,
      window: { after: anclaItem, before: null, reason: null },
    };
    const d = setWindowReason(draft([], [], [], [nested]), "i:book:x", "contexto");
    expect(d.nested[0].window?.reason).toBe("contexto");
  });
});

describe("toPayload · motivo", () => {
  const ancla = (title: string): DraftAnchor => ({
    kind: "block", itemType: null, itemId: null, childSagaId: `saga-${title}`, title,
  });
  const conVentana = () => setAnchor(draft([], [work("f")]), "i:book:f", "after", ancla("Era 1"));

  it("manda el motivo con su fila de ventana", () => {
    const d = setWindowReason(conVentana(), "i:book:f", "spoiler");
    expect(toPayload(d, "saga").windows[0].motivo).toBe("spoiler");
  });

  it("una ventana sin motivo declarado manda null, no omite la clave", () => {
    // Omitirla dejaría al RPC leyendo `w->>'motivo'` de una clave ausente. Da
    // NULL igual, pero entonces la forma del payload no sería la de la tabla.
    expect(toPayload(conVentana(), "saga").windows[0]).toHaveProperty("motivo", null);
  });
});
