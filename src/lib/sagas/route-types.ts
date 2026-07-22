import type { ItemType } from "@/lib/catalog/types";
import type { SagaAccentToken } from "./accents";
import type { DetailMember } from "./types";

// Itinerarios de lectura (spec 2026-07-22). Una ruta es una secuencia curada
// de obras y bloques-subsaga dentro de una saga.

export type RawRouteEntry = {
  position: number;
  itemType: ItemType | null;
  itemId: string | null;
  childSagaId: string | null;
  note: string | null;
};

export type ResolvedStep =
  | { kind: "item"; member: DetailMember; note: string | null }
  | {
      kind: "block";
      sagaId: string;
      name: string;
      accent: SagaAccentToken;
      members: DetailMember[];
      note: string | null;
    };

export type ResolvedRoute = { steps: ResolvedStep[]; total: number; completed: number };

export type RouteLookup = {
  /** "tipo:id" → miembro resuelto. Mismo mapa que usa buildSagaGraph. */
  members: Map<string, DetailMember>;
  childNames: Map<string, string>;
  childAccent: Map<string, SagaAccentToken>;
  /** Orden principal de una subsaga: createMainOrder(...)(sagaId). */
  mainOrderOf: (sagaId: string) => string[];
};

/** Una ruta lista para pintar: metadatos + pasos resueltos. */
export type SagaRoute = {
  slug: string;
  name: string;
  summary: string | null;
  /** Las sintéticas (`lectura`, `publicacion`) no se pueden editar ni borrar. */
  synthetic: boolean;
};
