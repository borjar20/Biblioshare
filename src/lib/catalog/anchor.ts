import { itemHref, personHref, sagaHref } from "./item-href";
import type { ItemType } from "./types";

// Ancla polimórfica de un pensamiento (Fase 3, «Pensamiento»): un pensamiento
// cuelga de una obra de catálogo (book/movie/series), de una saga o de una
// persona — nunca de un pase. La resolución batch de título/imagen por tipo
// vive en feed.ts (Task 3.3); aquí solo el tipo y el href.
export type AnchorType = ItemType | "saga" | "person";

export type AnchorRef = {
  type: AnchorType;
  id: string;
  title: string;
  imageUrl: string | null;
  subtitle: string | null;
};

export function anchorHref(type: AnchorType, id: string): string {
  if (type === "saga") return sagaHref(id);
  if (type === "person") return personHref(id);
  return itemHref(type, id);
}
