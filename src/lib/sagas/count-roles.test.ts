import { describe, expect, it } from "vitest";
import { countRoles } from "./count-roles";
import type { SagaGraph, SagaGraphNode } from "./map-types";

const node = (id: string, over: Partial<SagaGraphNode> = {}): SagaGraphNode => ({
  id,
  kind: "item",
  x: 0,
  y: 0,
  level: "principal",
  orderNo: null,
  label: id,
  accent: "verde",
  status: null,
  role: null,
  coverUrl: null,
  covers: [],
  href: `/libro/${id}`,
  memberCount: null,
  groupSagaId: "g1",
  groupName: "Era Uno",
  step: null,
  tandem: null,
  windowReason: null,
  optional: false,
  skipped: false,
  ownerSagaId: "owner",
  ...over,
});

const graph = (nodes: SagaGraphNode[]): SagaGraph => ({ nodes, edges: [] });

describe("countRoles", () => {
  it("cuenta las obras de cada rol presente, en el orden del vocabulario", () => {
    expect(
      countRoles(
        graph([
          node("a", { role: "relato" }),
          node("b", { role: "precuela" }),
          node("c", { role: "relato" }),
          node("d", { role: null }),
        ]),
      ),
    ).toEqual([
      { role: "precuela", count: 1 },
      { role: "relato", count: 2 },
    ]);
  });

  it("no lista los roles que no tiene ninguna obra", () => {
    // Una barra con seis chips a cero sería ruido en las sagas sin roles, que
    // hoy son casi todas: 8 filas con rol de 367 en producción.
    expect(countRoles(graph([node("a", { role: null })]))).toEqual([]);
  });

  it("cuenta también las opcionales y las saltadas", () => {
    // Esta es la regla que hace REVERSIBLE la barra de filtro: contadas sobre
    // lo visible, filtrar por «Spin-off» dejaría la barra con un solo chip y no
    // habría forma de volver — el mismo error que la fase 4 evitó al contar
    // `optionalCount` sobre el grafo.
    expect(
      countRoles(
        graph([
          node("a", { role: "spin_off", optional: true }),
          node("b", { role: "spin_off", optional: true, skipped: true }),
        ]),
      ),
    ).toEqual([{ role: "spin_off", count: 2 }]);
  });
});
