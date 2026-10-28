import { isSagaAccentToken } from "../accents";
import type { SagaDetail } from "../get-saga-detail";
import { resolveRoute } from "../resolve-route";
import type { RawRouteEntry } from "../route-types";
import { mainOrderFor } from "../shelf-sections";

/** «Llevas X de Y» de un itinerario curado: el mismo `resolveRoute` que pintaba
 *  la cabecera de RouteView, con el mismo lookup. Cuenta miembros únicos. */
export function routeCounter(
  detail: Pick<SagaDetail, "groups" | "childRefs" | "windows" | "orderSagas" | "orderMemberships">,
  entries: RawRouteEntry[],
): { completed: number; total: number } {
  const members = new Map(detail.groups.flatMap((g) => g.members).map((m) => [`${m.itemType}:${m.itemId}`, m]));
  const groupAccent = new Map(detail.groups.flatMap((g) => (g.sagaId ? [[g.sagaId, g.accent] as const] : [])));
  const childNames = new Map(detail.childRefs.map((c) => [c.id, c.name] as const));
  const childAccent = new Map(
    detail.childRefs.map((c) => [c.id, groupAccent.get(c.id) ?? (isSagaAccentToken(c.accentColor) ? c.accentColor : "beige")] as const),
  );
  const { completed, total } = resolveRoute(entries, { members, childNames, childAccent, mainOrderOf: mainOrderFor(detail) });
  return { completed, total };
}
