import type { SagaAccentToken } from "./accents";
import type { MemberStatus, SagaItemRole } from "./types";

// Tipos del grafo, movidos aquí desde graph-data.ts (fase 3, Task 1): tanto
// `buildSagaGraph` (grafo curado a mano, hoy) como `deriveSagaMap` (grafo
// derivado, mañana) producen exactamente este mismo `SagaGraph` — la vista 2D,
// el timeline móvil y el mini-preview del CTA lo consumen tal cual y no deben
// enterarse de qué función lo produjo.

export type SagaGraphNode = {
  id: string;
  kind: "item" | "saga";
  x: number;
  y: number;
  level: "principal" | "menor";
  orderNo: number | null;
  label: string;
  accent: SagaAccentToken;
  status: MemberStatus;
  /** Rol narrativo del ítem (issue #167). Siempre null en los nodos-saga: una
   *  subsaga no es una precuela, lo son sus obras. */
  role: SagaItemRole | null;
  coverUrl: string | null;
  covers: string[];
  href: string;
  memberCount: number | null;
  groupSagaId: string | null;
  groupName: string | null;
  /** Paso del itinerario activo que corresponde a este nodo, 1..N. `null` si el
   *  itinerario no pasa por aquí, o si no hay itinerario activo. El mapa y el
   *  itinerario son dos capas: el itinerario manda sobre lo que dice, y el mapa
   *  sobre lo que el itinerario calla. */
  step: number | null;
};

export type SagaGraphEdge = {
  id: string;
  source: string;
  target: string;
  type: "principal" | "opcional" | "requisito";
  accent: SagaAccentToken;
};

export type SagaGraph = { nodes: SagaGraphNode[]; edges: SagaGraphEdge[] };
