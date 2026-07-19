import type { ItemType } from "@/lib/catalog/types";

export type EditorNode = {
  id: string;
  itemType: ItemType | null;
  itemId: string | null;
  childSagaId: string | null;
  x: number;
  y: number;
  level: "principal" | "menor";
  orderNo: number | null;
  labelOverride: string | null;
};
export type EditorEdge = {
  id: string;
  fromNode: string;
  toNode: string;
  edgeType: "principal" | "opcional" | "requisito";
};
/** Al guardar: la membresía del ítem dentro del árbol queda en targetSagaId (hija directa) o null (directo/nexo). */
export type MembershipOp = { itemType: ItemType; itemId: string; targetSagaId: string | null };
export type NodeDisplay = { label: string; coverUrl: string | null };
export const displayKey = (n: Pick<EditorNode, "itemType" | "itemId" | "childSagaId">): string =>
  n.childSagaId ? `saga:${n.childSagaId}` : `item:${n.itemType}:${n.itemId}`;
