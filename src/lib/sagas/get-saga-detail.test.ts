import { describe, expect, it } from "vitest";
import { freeBlockWindow, freeItemWindow, resolveSagaGraph, resolveWindows } from "./get-saga-detail";
import type { RawWindowRow } from "./get-saga-sequence";
import type { MemberGroup } from "./group-members";
import type { SagaGraph, SagaGraphNode } from "./map-types";
import type { DetailMember, ResolvedWindow } from "./types";

// Mismo helper que get-saga-sequence.test.ts: una fila cruda de
// saga_placement_windows con todas las columnas a null salvo las que se pasen.
const w = (fields: Partial<RawWindowRow>): RawWindowRow => ({
  item_type: null, item_id: null, child_saga_id: null,
  after_item_type: null, after_item_id: null, after_child_saga_id: null,
  before_item_type: null, before_item_id: null, before_child_saga_id: null,
  created_at: "2026-01-01T00:00:00.000Z",
  ...fields,
});

it("resuelve una ventana con las dos anclas: la frase entera", () => {
  const titles = new Map([
    ["i:book:a", "Nacidos de la Bruma Era 1"],
    ["i:book:b", "Viento y Verdad"],
  ]);
  const windows = resolveWindows(
    [
      w({
        item_type: "book", item_id: "n2",
        after_item_type: "book", after_item_id: "a",
        before_item_type: "book", before_item_id: "b",
      }),
    ],
    titles,
  );
  expect(windows["i:book:n2"]).toEqual({
    afterTitle: "Nacidos de la Bruma Era 1",
    beforeTitle: "Viento y Verdad",
    afterKey: "i:book:a",
    beforeKey: "i:book:b",
  });
});

it("resuelve una ventana con una sola ancla («after»), apuntando a un bloque", () => {
  const titles = new Map([["s:sub-1", "El Archivo de las Tormentas"]]);
  const windows = resolveWindows(
    [w({ item_type: "book", item_id: "n2", after_child_saga_id: "sub-1" })],
    titles,
  );
  expect(windows["i:book:n2"]).toEqual({
    afterTitle: "El Archivo de las Tormentas",
    beforeTitle: null,
    afterKey: "s:sub-1",
    beforeKey: null,
  });
});

it("resuelve una ventana con una sola ancla («before»), sujeto bloque", () => {
  const titles = new Map([["i:book:b", "Viento y Verdad"]]);
  const windows = resolveWindows(
    [w({ child_saga_id: "sub-1", before_item_type: "book", before_item_id: "b" })],
    titles,
  );
  expect(windows["s:sub-1"]).toEqual({
    afterTitle: null,
    beforeTitle: "Viento y Verdad",
    afterKey: null,
    beforeKey: "i:book:b",
  });
});

it("un ancla que ya no resuelve (fuera del subárbol cargado) queda a null: no se limpia la fila entera", () => {
  const titles = new Map([["i:book:b", "Viento y Verdad"]]);
  const windows = resolveWindows(
    [
      w({
        item_type: "book", item_id: "n2",
        after_item_type: "book", after_item_id: "roto",
        before_item_type: "book", before_item_id: "b",
      }),
    ],
    titles,
  );
  expect(windows["i:book:n2"]).toEqual({
    afterTitle: null,
    beforeTitle: "Viento y Verdad",
    afterKey: null,
    beforeKey: "i:book:b",
  });
});

it("un ancla que resuelve trae clave y título; una rota, las dos a null", () => {
  // Sujeto: el bloque `sujeto`. Ancla `after`: el bloque `saga-1`, que resuelve.
  // Ancla `before`: una obra que ya no está en el subárbol.
  const out = resolveWindows(
    [
      w({
        child_saga_id: "sujeto",
        after_child_saga_id: "saga-1",
        before_item_type: "book", before_item_id: "fantasma",
        created_at: "2026-07-27T00:00:00Z",
      }),
    ],
    new Map([["s:saga-1", "Era 1"]]),
  );
  expect(out["s:sujeto"]).toEqual({
    afterTitle: "Era 1", afterKey: "s:saga-1", beforeTitle: null, beforeKey: null,
  });
});

it("si las dos anclas dejan de resolver, el sujeto no aparece en el resultado: ninguna línea", () => {
  const windows = resolveWindows(
    [
      w({
        item_type: "book", item_id: "n2",
        after_item_type: "book", after_item_id: "roto1",
        before_item_type: "book", before_item_id: "roto2",
      }),
    ],
    new Map(),
  );
  expect(Object.hasOwn(windows, "i:book:n2")).toBe(false);
});

it("una fila sin ningún sujeto reconocible (imposible en BD por el CHECK) se descarta en silencio", () => {
  const windows = resolveWindows([w({})], new Map());
  expect(Object.keys(windows)).toHaveLength(0);
});

// Desempate entre dos sagas HERMANAS con ventana sobre la MISMA obra
// compartida (revisión de Task 6): el unique de saga_placement_windows es
// POR SAGA, así que ambas filas pueden coexistir en BD. Gana la más antigua
// (mismo criterio que `byItem` en getSagaDetail), y eso tiene que valer sin
// importar en qué orden lleguen las filas — se prueba pasándolas en los dos
// órdenes y comprobando que el resultado no cambia.
it("dos sagas hermanas con ventana sobre la misma obra: gana siempre la más antigua, en cualquier orden de entrada", () => {
  const titles = new Map([
    ["i:book:a", "Ancla vieja"],
    ["i:book:b", "Ancla nueva"],
  ]);
  const older = w({
    item_type: "book", item_id: "n2",
    after_item_type: "book", after_item_id: "a",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  const newer = w({
    item_type: "book", item_id: "n2",
    after_item_type: "book", after_item_id: "b",
    created_at: "2026-02-01T00:00:00.000Z",
  });
  const expected = { afterTitle: "Ancla vieja", beforeTitle: null, afterKey: "i:book:a", beforeKey: null };

  expect(resolveWindows([older, newer], titles)["i:book:n2"]).toEqual(expected);
  // Mismas dos filas, orden invertido: el resultado tiene que ser idéntico —
  // no puede depender del orden en que Postgres las devuelva.
  expect(resolveWindows([newer, older], titles)["i:book:n2"]).toEqual(expected);
});

// La guarda «solo lo libre tiene ventana» (revisión de Task 6): ninguna
// restricción de BD la impone — un cambio de colocación no borra la fila de
// `saga_placement_windows` (ver el comentario de `windows` en `SagaDetail`),
// así que freeItemWindow/freeBlockWindow tienen que comprobar `placement`/
// `placementInParent` ellas mismas antes de mirar el mapa.
const member = (over: Partial<DetailMember>): DetailMember => ({
  itemType: "book",
  itemId: over.itemId ?? "x",
  title: over.title ?? "Título",
  coverUrl: null,
  href: "/libro/x",
  position: null,
  role: null,
  placement: null,
  optional: false,
  status: null,
  groupSagaId: null,
  ownerSagaId: "owner",
  year: null,
  ...over,
});

const group = (over: Partial<MemberGroup>): MemberGroup => ({
  sagaId: over.sagaId ?? "sub-1",
  name: "Bloque",
  accent: "beige",
  members: [],
  positionInParent: null,
  placementInParent: null,
  ...over,
});

const someWindow: ResolvedWindow = {
  afterTitle: "Antes",
  beforeTitle: "Después",
  afterKey: "i:book:antes",
  beforeKey: "i:book:despues",
};

describe("freeItemWindow", () => {
  it("entrada libre CON ventana: la devuelve", () => {
    const windows = { "i:book:x": someWindow };
    const m = member({ itemId: "x", placement: "libre" });
    expect(freeItemWindow(windows, m)).toEqual(someWindow);
  });

  it("entrada libre SIN ventana: null", () => {
    const m = member({ itemId: "x", placement: "libre" });
    expect(freeItemWindow({}, m)).toBeNull();
  });

  it("entrada NO libre con fila de ventana igualmente presente en el mapa: null (la guarda ignora la fila)", () => {
    // Caso real que motiva el hallazgo: un cambio de colocación no borra la
    // fila de saga_placement_windows, así que el mapa puede traer una ventana
    // para una entrada que ya es `fijo` (o sin clasificar). Sin la
    // comprobación de `placement`, esta prueba fallaría en silencio.
    const windows = { "i:book:x": someWindow };
    expect(freeItemWindow(windows, member({ itemId: "x", placement: "fijo" }))).toBeNull();
    expect(freeItemWindow(windows, member({ itemId: "x", placement: null }))).toBeNull();
  });
});

describe("freeBlockWindow", () => {
  it("bloque libre CON ventana: la devuelve", () => {
    const windows = { "s:sub-1": someWindow };
    const g = group({ sagaId: "sub-1", placementInParent: "libre" });
    expect(freeBlockWindow(windows, g)).toEqual(someWindow);
  });

  it("bloque libre SIN ventana: null", () => {
    const g = group({ sagaId: "sub-1", placementInParent: "libre" });
    expect(freeBlockWindow({}, g)).toBeNull();
  });

  it("bloque NO libre con fila de ventana igualmente presente en el mapa: null (la guarda ignora la fila)", () => {
    const windows = { "s:sub-1": someWindow };
    expect(freeBlockWindow(windows, group({ sagaId: "sub-1", placementInParent: "fijo" }))).toBeNull();
    expect(freeBlockWindow(windows, group({ sagaId: "sub-1", placementInParent: null }))).toBeNull();
  });

  it("grupo nexo (sagaId null): null aunque el mapa traiga algo para 's:null'", () => {
    const g = group({ sagaId: null, placementInParent: "libre" });
    expect(freeBlockWindow({}, g)).toBeNull();
  });
});

// Arreglo tras la revisión de Task 4-bis: el interruptor `show_map` mandaba
// solo en `hasGraph`, no en `graph` — así que `/saga/[id]/mapa/page.tsx`
// (que comprueba `!graph`, nunca `hasGraph`) y el panel de grafo resaltado de
// una ruta curada en `saga-map-tab.tsx` (`... && graph`) se lo saltaban los
// dos, verificado en vivo con el interruptor apagado. `resolveSagaGraph` es
// la regla aislada y pura: "con el interruptor apagado no hay mapa", sin
// Supabase de por medio. Cubre exactamente lo que antes solo se veía
// mirando el navegador.
const node = (over: Partial<SagaGraphNode> = {}): SagaGraphNode => ({
  id: over.id ?? "n1",
  kind: "item",
  x: 0,
  y: 0,
  level: "principal",
  orderNo: 1,
  label: "Nodo",
  accent: "beige",
  status: null,
  role: null,
  coverUrl: null,
  covers: [],
  href: "/libro/n1",
  memberCount: null,
  groupSagaId: null,
  groupName: null,
  step: null,
  tandem: null,
  ...over,
});

const emptyGraph: SagaGraph = { nodes: [], edges: [] };
const graphWithNodes: SagaGraph = { nodes: [node()], edges: [] };

describe("resolveSagaGraph", () => {
  it("interruptor apagado, aunque haya nodos curados: null — el interruptor manda en el origen", () => {
    // Este es el caso exacto de los dos bypasses: nodos curados presentes
    // (`graphWithNodes`, no vacío) pero `showMap=false`. Antes del arreglo,
    // el `graph` que salía de getSagaDetail conservaba estos nodos igualmente
    // y solo `hasGraph` lo escondía — así que un consumidor que mirara
    // `graph` directamente (las dos vías rotas) lo seguía pintando.
    expect(resolveSagaGraph(false, graphWithNodes)).toBeNull();
  });

  it("interruptor encendido con nodos curados: el grafo tal cual, sin envolver ni copiar", () => {
    expect(resolveSagaGraph(true, graphWithNodes)).toBe(graphWithNodes);
  });

  it("interruptor encendido pero sin nada curado que dibujar (grafo vacío): null — el interruptor no puede compensar la falta de curación", () => {
    expect(resolveSagaGraph(true, emptyGraph)).toBeNull();
  });

  it("interruptor apagado y grafo vacío: null por las dos razones a la vez, sigue siendo null", () => {
    expect(resolveSagaGraph(false, emptyGraph)).toBeNull();
  });
});
