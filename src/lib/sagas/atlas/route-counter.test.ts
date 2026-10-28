import { describe, expect, it } from "vitest";
import type { DetailMember } from "../types";
import type { RawRouteEntry } from "../route-types";
import { routeCounter } from "./route-counter";

const member = (id: string, status: DetailMember["status"] = null): DetailMember => ({
  itemType: "book",
  itemId: id,
  title: id,
  coverUrl: null,
  href: `/libro/${id}`,
  position: null,
  role: null,
  placement: null,
  optional: false,
  status,
  groupSagaId: null,
  ownerSagaId: "root",
  year: null,
  skipped: false,
});

// Obra suelta `a` (completada) + bloque `guardia` con una obra `g1` sin leer.
const detail: Parameters<typeof routeCounter>[0] = {
  groups: [
    { sagaId: null, name: null, accent: "beige", members: [member("a", "completed")], positionInParent: null, placementInParent: null },
    { sagaId: "guardia", name: "La Guardia", accent: "verde", members: [member("g1")], positionInParent: null, placementInParent: null },
  ],
  childRefs: [
    { id: "guardia", name: "La Guardia", accentColor: "verde", positionInParent: null, placementInParent: null, optionalInParent: false },
  ],
  windows: {},
  orderSagas: [
    { id: "root", name: "Root", parentSagaId: null, positionInParent: null, placementInParent: null },
    { id: "guardia", name: "La Guardia", parentSagaId: "root", positionInParent: null, placementInParent: null },
  ],
  orderMemberships: [
    { sagaId: "root", itemType: "book", itemId: "a", position: 1, placement: "fijo" },
    { sagaId: "guardia", itemType: "book", itemId: "g1", position: 1, placement: "fijo" },
  ],
};

const entries: RawRouteEntry[] = [
  { position: 1, itemType: "book", itemId: "a", childSagaId: null, note: null },
  { position: 2, itemType: null, itemId: null, childSagaId: "guardia", note: null },
];

describe("routeCounter", () => {
  it("cuenta miembros únicos de la ruta (obra suelta + bloque) y los completados", () => {
    expect(routeCounter(detail, entries)).toEqual({ completed: 1, total: 2 });
  });
});
