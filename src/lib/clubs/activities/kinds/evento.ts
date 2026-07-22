import type { ActivityKindDefinition } from "./types";

// Evento (spec 2026-07-22): una fecha señalada del club -- "sale en cine X".
// Es el primer kind NO participativo del motor: no se propone (nace 'active'
// por RPC), no se une nadie, no progresa y no tiene página propia. Por eso
// todos los campos del pool quedan en su valor nulo y hasDetailView es false.
//
// `itemCuration` es irrelevante aquí (no hay pool que curar), pero el tipo lo
// exige: se pone "curators" por coherencia con quién manda en un evento.
export const eventoKind: ActivityKindDefinition = {
  kind: "evento",
  allowedItemTypes: [],
  maxItems: 0,
  itemCuration: "curators",
  usesItemPool: false,
  hasDetailView: false,
};
