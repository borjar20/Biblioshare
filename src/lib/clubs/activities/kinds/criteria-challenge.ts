import { CriteriaChallengeFields } from "@/components/clubs/criteria-challenge/criteria-challenge-fields";
import { CriteriaChallengeBoard } from "@/components/clubs/criteria-challenge/criteria-challenge-board";
import type { ActivityKindDefinition } from "./types";

// EPIC-05 Bloque H4 -- el "reto comparativo" original: un criterio (modo + tipo + meta +
// género + saga) en vez de una lista fija, con clasificación (modo competitivo) o meta
// colectiva sumada (modo cooperativo). Primer consumidor real de config jsonb (SD-8).
//
// Sin pool de ítems: el reto no enumera qué hay que consumir, lo describe -- por eso
// usesItemPool es false y la ficha no pinta ni "Ítems" ni las opiniones por ítem.
export const criteriaChallengeKind: ActivityKindDefinition = {
  kind: "criteria_challenge",
  allowedItemTypes: "all",
  maxItems: null,
  itemCuration: "participants",
  usesItemPool: false,
  hasDetailView: true,
  ConfigFields: CriteriaChallengeFields,
  DetailExtension: CriteriaChallengeBoard,
};
