import { describe, expect, it } from "vitest";
import type { SagaGraph, SagaGraphNode } from "./map-types";
import type { DetailMember } from "./types";
import type { MemberGroup } from "./group-members";
import type { SagaRoute } from "./route-types";
import type { SagaDetail } from "./get-saga-detail";
import { deriveTimeline } from "./derive-timeline";
import { resolveActiveRoute } from "./resolve-active-route";
import {
  curatedRouteSections,
  expandRouteKeys,
  getShelfSections,
  publicationSections,
  shelfRoutesFor,
} from "./shelf-sections";

function node(id: string, label: string): SagaGraphNode {
  return {
    id, kind: "item", x: 0, y: 0, level: "principal", orderNo: null, label,
    accent: "terracota", status: null, role: null, coverUrl: null, covers: [],
    href: `/libro/${id}`, memberCount: null, groupSagaId: null, groupName: null,
    step: null, tandem: null, windowReason: null, optional: false, skipped: false,
    ownerSagaId: "root",
  };
}

function member(itemId: string, title: string, year: number | null): DetailMember {
  return {
    itemType: "book", itemId, title, coverUrl: null, href: `/libro/${itemId}`,
    position: null, role: null, placement: null, optional: false,
    status: null, groupSagaId: null, ownerSagaId: "root", year, skipped: false,
  };
}

describe("publicationSections", () => {
  it("devuelve una sección con las obras por año de publicación y numeradas", () => {
    const graph: SagaGraph = {
      nodes: [node("i:book:b", "Dos"), node("i:book:a", "Uno"), node("i:book:c", "Sin año")],
      edges: [],
    };
    const members = [member("b", "Dos", 1970), member("a", "Uno", 1965), member("c", "Sin año", null)];

    const [section, ...rest] = publicationSections(graph, members);

    expect(rest).toHaveLength(0);
    expect(section.groupSagaId).toBeNull();
    expect(section.rows.map((r) => (r.kind === "entry" ? [r.no, r.node.label] : null))).toEqual([
      [1, "Uno"],
      [2, "Dos"],
      [3, "Sin año"],
    ]);
  });

  it("sin nodos devuelve una lista vacía", () => {
    expect(publicationSections({ nodes: [], edges: [] }, [])).toEqual([]);
  });

  it("omite un miembro sin nodo en el grafo en lugar de inventarlo", () => {
    const graph: SagaGraph = { nodes: [node("i:book:a", "Uno")], edges: [] };
    const [section] = publicationSections(graph, [member("a", "Uno", 1965), member("z", "Huérfano", 1990)]);
    expect(section.rows).toHaveLength(1);
  });
});

describe("curatedRouteSections", () => {
  // Itinerario cuyo ÚNICO paso es un bloque-subsaga (el «la-guardia» del Universo
  // QA). `deriveSagaMap` ignora las claves `s:<uuid>`, así que sin expandir el
  // bloque la balda salía sin obras (modo `empty`).
  const sub = (itemId: string, title: string, position: number): DetailMember => ({
    ...member(itemId, title, null),
    position,
    placement: "fijo",
    groupSagaId: "sub",
    ownerSagaId: "sub",
  });
  // Insertadas al revés de su `position` para que el orden lo ponga la curación.
  const groups: MemberGroup[] = [
    { sagaId: "sub", name: "La Guardia", accent: "verde", members: [sub("b", "Segunda", 2), sub("a", "Primera", 1)], positionInParent: 1, placementInParent: "fijo" },
  ];
  const detail = {
    groups,
    windows: {},
    orderSagas: [
      { id: "root", name: "Universo", parentSagaId: null, positionInParent: null, placementInParent: null },
      { id: "sub", name: "La Guardia", parentSagaId: "root", positionInParent: 1, placementInParent: "fijo" as const },
    ],
    orderMemberships: [
      { sagaId: "sub", itemType: "book" as const, itemId: "b", position: 2, placement: "fijo" as const },
      { sagaId: "sub", itemType: "book" as const, itemId: "a", position: 1, placement: "fijo" as const },
    ],
  };

  it("un itinerario de un solo bloque da las obras del bloque en su orden curado", () => {
    const sections = curatedRouteSections(detail, ["s:sub"], { authenticated: true, showOptional: true });
    const labels = sections.flatMap((sec) => sec.rows.map((r) => (r.kind === "entry" ? r.node.label : null)));
    expect(labels).toEqual(["Primera", "Segunda"]);
  });

  it("expandRouteKeys respeta el orden del itinerario y no repite una obra ya nombrada", () => {
    const order = (id: string) => (id === "sub" ? ["book:a", "book:b"] : []);
    expect(expandRouteKeys(["i:book:b", "s:sub", "i:movie:z"], order)).toEqual(["i:book:b", "i:book:a", "i:movie:z"]);
  });
});

// I1 (revisión final de la rama): con el mapa apagado (show_map=false, la
// mayoría de sagas en producción) la balda ignoraba el orden de lectura.
describe("shelfRoutesFor", () => {
  const pub: SagaRoute = { slug: "publicacion", name: "Publicación", summary: null, synthetic: true, isReadingOrder: false };
  const curada: SagaRoute = { id: "r1", slug: "cronologico", name: "Cronológico", summary: null, synthetic: false, isReadingOrder: false };
  const lectura: SagaRoute = { slug: "lectura", name: "Orden de lectura", summary: null, synthetic: true, isReadingOrder: false };
  const shelfGraph: SagaGraph = { nodes: [node("i:book:a", "Uno")], edges: [] };

  it("mapa apagado y orden curado: antepone «lectura» y es la ruta por defecto", () => {
    const routes = shelfRoutesFor({ routes: [curada, pub], hasGraph: false, shelfGraph }, "Orden de lectura");
    expect(routes.map((r) => r.slug)).toEqual(["lectura", "cronologico", "publicacion"]);
    expect(routes[0]).toEqual(lectura);
    expect(resolveActiveRoute({ routes, routeChoice: null }, {})).toBe("lectura");
  });

  it("la adoptada sigue mandando sobre la «lectura» añadida", () => {
    const routes = shelfRoutesFor({ routes: [curada, pub], hasGraph: false, shelfGraph }, "Orden de lectura");
    expect(resolveActiveRoute({ routes, routeChoice: "cronologico" }, {})).toBe("cronologico");
    expect(resolveActiveRoute({ routes, routeChoice: "lectura" }, {})).toBe("lectura");
  });

  it("con grafo visible no cambia nada", () => {
    const routes = [lectura, curada, pub];
    expect(shelfRoutesFor({ routes, hasGraph: true, shelfGraph }, "X")).toBe(routes);
  });

  it("sin orden curado (shelfGraph vacío) no cambia nada", () => {
    const routes = [pub];
    expect(shelfRoutesFor({ routes, hasGraph: false, shelfGraph: { nodes: [], edges: [] } }, "X")).toBe(routes);
  });

  it("con un itinerario designado como orden de lectura no añade otra «lectura»", () => {
    const designada = { ...curada, name: "Orden de lectura", isReadingOrder: true };
    const routes = [designada, pub];
    expect(shelfRoutesFor({ routes, hasGraph: false, shelfGraph }, "Orden de lectura")).toBe(routes);
  });
});

describe("getShelfSections", () => {
  const n1 = { ...node("i:book:a", "Uno"), orderNo: 0 };
  const n2 = { ...node("i:book:b", "Dos"), orderNo: 1 };
  const shelfGraph: SagaGraph = { nodes: [n1, n2], edges: [] };
  const detail = {
    isAuthenticated: false,
    showOptionalReadings: true,
    graph: null,
    hasGraph: false,
    shelfGraph,
    groups: [
      { sagaId: "root", name: "Raíz", accent: "terracota", members: [member("a", "Uno", 1990), member("b", "Dos", 1980)], positionInParent: null, placementInParent: null },
    ],
    routes: [],
  } as unknown as SagaDetail;
  // Ninguna de estas ramas consulta la BD: si alguna lo hiciera, el test
  // reventaría con este cliente vacío.
  const supabase = {} as never;
  const labels = (sections: Awaited<ReturnType<typeof getShelfSections>>) =>
    sections.flatMap((sec) => sec.rows.map((r) => (r.kind === "entry" ? r.node.label : null)));

  it("«lectura» con el mapa apagado (graph null) sale del shelfGraph", async () => {
    const sections = await getShelfSections(supabase, detail, "lectura");
    expect(sections).toEqual(deriveTimeline(shelfGraph, { authenticated: false, showOptional: true }));
    expect(labels(sections)).toEqual(["Uno", "Dos"]);
  });

  it("un slug desconocido degrada al orden de lectura", async () => {
    const sections = await getShelfSections(supabase, detail, "borrada");
    expect(labels(sections)).toEqual(["Uno", "Dos"]);
  });

  it("«publicacion» ordena por año", async () => {
    const sections = await getShelfSections(supabase, detail, "publicacion");
    expect(labels(sections)).toEqual(["Dos", "Uno"]);
  });
});
