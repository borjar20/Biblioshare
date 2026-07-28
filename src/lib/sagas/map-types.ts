import type { SagaAccentToken } from "./accents";
import type { MemberStatus, SagaItemRole, TandemMode, WindowReason } from "./types";

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
  /** Metadatos del HUECO compartido al que pertenece el nodo (`saga_tandems`,
   *  fase 2). Denormalizado: los N nodos del mismo hueco llevan el MISMO valor,
   *  y `deriveTimeline` lo lee del primero al fundir la fila — así no necesita
   *  conocer la `position` (que el nodo no lleva) ni volver a consultar nada.
   *  `null` si el nodo no comparte hueco, o si el curador no declaró nada. */
  tandem: { mode: TandemMode | null; note: string | null } | null;
  /** Motivo de la ventana de la que este nodo es SUJETO
   *  (`saga_placement_windows.motivo`, fase 3). `null` si el nodo no es sujeto
   *  de ninguna ventana, o si el curador no lo declaró. Se resuelve en
   *  `deriveSagaMap`, que es donde ya se sabe QUÉ nodo es el sujeto:
   *  `deriveTimeline` no vuelve a mirar la tabla ni a resolver la clave, igual
   *  que no re-resuelve las anclas. Dos resoluciones del mismo dato acaban
   *  discrepando (#91/#185/#203). */
  windowReason: WindowReason | null;
};

export type SagaGraphEdge = {
  id: string;
  source: string;
  target: string;
  /** `itinerario` = salto que dibuja el itinerario activo entre dos pasos
   *  seguidos que el mapa no unía por sí solo. Solo existe con una ruta curada
   *  activa; las otras tres salen de la curación y están siempre. */
  type: "principal" | "opcional" | "requisito" | "itinerario";
  accent: SagaAccentToken;
};

export type SagaGraph = { nodes: SagaGraphNode[]; edges: SagaGraphEdge[] };
