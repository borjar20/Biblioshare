import { ListChallengeBoard } from "@/components/clubs/list-challenge/list-challenge-board";
import type { ActivityKindDefinition } from "./types";

// EPIC-05 Bloque H3 -- reto por lista de ítems. Una lista curada (libros, pelis
// y series pueden convivir en la misma lista) y una rejilla comparativa de quién
// ha completado qué dentro de la ventana del reto. Sin tablas nuevas: el
// progreso se deriva de los pases de diario (ver src/lib/clubs/activities/
// list-challenge.ts y la migración 20260713_list_challenge.sql).
//
// itemCuration "curators": la lista ES el enunciado del reto -- solo el creador
// de la actividad y moderator+ la tocan (espejo de la política RLS
// "club_activity_items insert participant or curator").
export const listChallengeKind: ActivityKindDefinition = {
  kind: "list_challenge",
  allowedItemTypes: "all",
  maxItems: null,
  itemCuration: "curators",
  usesItemPool: true,
  DetailExtension: ListChallengeBoard,
};
