import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { SagaPlacement } from "./types";
import { esColocable } from "./placement";
import type { SequencePayload } from "./sequence-draft";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Quién es la DUEÑA de la ventana de una obra (fase 4).
//
// Hasta la fase 3 la pregunta no existía: solo se podía curar la ventana de una
// entrada de la propia saga, así que la fila iba bajo esa saga y punto. Desde
// que el editor del padre puede curar la ventana de una obra de su hija hay dos
// pantallas que escriben la MISMA fila, y hace falta una regla — sin ella cada
// una crearía la suya y el unique parcial (saga_id, item_type, item_id) no
// impediría nada, porque los `saga_id` serían distintos.
//
// La regla: la ventana pertenece a la OBRA, no al contexto desde el que se
// cura. Su fila vive bajo la saga dueña de la membresía.

export type OwnerRow = {
  sagaId: string;
  itemType: ItemType;
  itemId: string;
  placement: SagaPlacement | null;
  isPrimary: boolean;
};

export type OwnerBlock = {
  childSagaId: string;
  placementInParent: SagaPlacement | null;
};

/**
 * Dueña de la ventana de una obra a partir de sus membresías: manda
 * `is_primary`; sin ninguna principal, la saga que se está curando si está
 * entre ellas; y si tampoco, la de id menor — determinista en vez de depender
 * del orden en que Postgres devuelva las filas.
 *
 * Total a propósito (no lanza): con la lista vacía devuelve `curatedSagaId`,
 * que es el único valor sensato y el que hace que un dato inesperado degrade en
 * vez de tumbar el guardado entero.
 *
 * Solo ve las membresías que el llamante le pasa, y `loadWindowOwners` solo
 * carga las del padre y sus hijas DIRECTAS. Eso no es una limitación, es la
 * garantía que hace falta: si una obra tuviera su membresía principal en una
 * saga ajena a este subárbol, esta función no la vería y no devolvería un
 * `saga_id` fuera del alcance que el RPC acepta.
 */
export function windowOwnerFor(
  memberships: Array<{ sagaId: string; isPrimary: boolean }>,
  curatedSagaId: string,
): string {
  const primary = memberships.find((m) => m.isPrimary);
  if (primary) return primary.sagaId;
  if (memberships.some((m) => m.sagaId === curatedSagaId)) return curatedSagaId;
  const sorted = [...memberships].sort((a, b) => a.sagaId.localeCompare(b.sagaId));
  return sorted[0]?.sagaId ?? curatedSagaId;
}

/**
 * Sujetos que PUEDEN tener ventana desde el editor de `curatedSagaId`, con la
 * saga bajo la que vive su fila. Clave en el mismo formato que `DraftEntry.key`
 * (`i:<tipo>:<uuid>` / `s:<uuid>`).
 *
 * Solo lo colocable (placement `libre` o `anclado`): una obra con hueco fijo YA tiene
 * sitio, y darle además una ventana es la contradicción que los dos ejes (`placement` y
 * `optional`) existen para evitar. Y hay una razón operativa además de la conceptual: la
 * saga dueña hidrata a `null` la ventana de lo que no es colocable
 * (get-saga-sequence.ts), así que una ventana sobre algo `fijo` la borraría el
 * primer guardado de esa saga — se perdería en silencio.
 *
 * Basta con que UNA de las membresías de la obra sea colocable: es la que le da
 * derecho a ventana. La dueña la decide `is_primary`, no esa membresía.
 */
export function buildWindowOwners(
  rows: OwnerRow[],
  blocks: OwnerBlock[],
  curatedSagaId: string,
): Map<string, string> {
  const byKey = new Map<string, OwnerRow[]>();
  for (const r of rows) {
    const key = `i:${r.itemType}:${r.itemId}`;
    byKey.set(key, [...(byKey.get(key) ?? []), r]);
  }

  const out = new Map<string, string>();
  for (const [key, list] of byKey) {
    if (!list.some((r) => esColocable(r.placement))) continue;
    out.set(key, windowOwnerFor(list.map((r) => ({ sagaId: r.sagaId, isPrimary: r.isPrimary })), curatedSagaId));
  }
  // Un BLOQUE `libre` es sujeto igual que una obra, y su fila vive bajo el
  // padre: `sagas.placement_in_parent` es colocación EN el padre, así que es el
  // padre quien la cura. Es el caso de *Nacidos de la Bruma. Era 2* en
  // producción (sujeto bloque, saga_id = Cosmere).
  for (const b of blocks) {
    if (!esColocable(b.placementInParent)) continue;
    out.set(`s:${b.childSagaId}`, curatedSagaId);
  }
  return out;
}

/**
 * Superpone en `owners` los sujetos COLOCABLES (`libre` o `anclado`) que este
 * payload va a escribir, sin pisar lo que ya se sabe.
 *
 * `loadWindowOwners` lee el estado ANTERIOR al guardado, así que por sí solo
 * acusaría de `windowNotFree` a un sujeto que este mismo borrador acaba de
 * colocar en «Cuando quieras» o «Anclado»: en BD todavía tiene su placement
 * viejo. Es el `foreignBlock` falso de la fase 2a otra vez, ahora del lado
 * del servidor.
 *
 * El `if (!owners.has)` conserva la dueña resuelta contra BD (la que decide
 * `is_primary` con doble membresía) y solo añade los sujetos que esta saga
 * está creando ahora, cuya fila vive por definición bajo ella.
 *
 * Pura y síncrona a propósito, separada de `saveSequence`: es la única forma
 * de que un test unitario la ejercite sin levantar Supabase — el server
 * action es async y no se puede probar en aislamiento.
 */
export function overlayDraftWindowOwners(
  owners: Map<string, string>,
  payload: Pick<SequencePayload, "entries" | "blocks">,
  sagaId: string,
): Map<string, string> {
  for (const e of payload.entries) {
    if (!esColocable(e.placement)) continue;
    const key = `i:${e.item_type}:${e.item_id}`;
    if (!owners.has(key)) owners.set(key, sagaId);
  }
  for (const b of payload.blocks) {
    if (!esColocable(b.placement_in_parent)) continue;
    const key = `s:${b.child_saga_id}`;
    if (!owners.has(key)) owners.set(key, sagaId);
  }
  return owners;
}

/** La parte de Supabase: padre + hijas DIRECTAS. Nada más hondo — el editor del
 *  padre solo despliega el cajón de sus hijas directas, así que reclamar
 *  responsabilidad sobre la ventana de un nieto sería borrar filas que esta
 *  pantalla no enseña. */
export async function loadWindowOwners(
  supabase: SupabaseServerClient,
  sagaId: string,
): Promise<Map<string, string>> {
  const { data: childRows } = await supabase
    .from("sagas")
    .select("id, placement_in_parent")
    .eq("parent_saga_id", sagaId);
  const children = (childRows ?? []) as Array<{ id: string; placement_in_parent: SagaPlacement | null }>;

  const { data: itemRows } = await supabase
    .from("saga_items")
    .select("saga_id, item_type, item_id, placement, is_primary")
    .in("saga_id", [sagaId, ...children.map((c) => c.id)]);
  const rows = ((itemRows ?? []) as Array<{
    saga_id: string;
    item_type: ItemType;
    item_id: string;
    placement: SagaPlacement | null;
    is_primary: boolean;
  }>).map(
    (r): OwnerRow => ({
      sagaId: r.saga_id,
      itemType: r.item_type,
      itemId: r.item_id,
      placement: r.placement,
      isPrimary: r.is_primary,
    }),
  );

  return buildWindowOwners(
    rows,
    children.map((c) => ({ childSagaId: c.id, placementInParent: c.placement_in_parent })),
    sagaId,
  );
}
