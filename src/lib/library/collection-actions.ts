"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import {
  listCollections,
  getCollectionsForItem,
  type CollectionCard,
} from "@/lib/library/collections";

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthenticated");
  return { supabase, userId: user.id };
}

export async function createCollection(name: string): Promise<{ id: string } | { error: string }> {
  const clean = name.trim();
  if (!clean || clean.length > 80) return { error: "invalid_name" };
  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase
    .from("collections")
    .insert({ user_id: userId, name: clean })
    .select("id")
    .single();
  if (error || !data) return { error: "create_failed" };
  revalidatePath("/coleccion");
  return { id: data.id };
}

export async function renameCollection(id: string, name: string): Promise<{ error?: string }> {
  const clean = name.trim();
  if (!clean || clean.length > 80) return { error: "invalid_name" };
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("collections")
    .update({ name: clean, updated_at: new Date().toISOString() })
    .eq("id", id); // RLS restringe al dueño
  if (error) return { error: "rename_failed" };
  revalidatePath("/coleccion");
  revalidatePath(`/coleccion/c/${id}`);
  return {};
}

// Patrón de `renameCollection`: mismo gateo (RLS + `requireUser`), mismo par
// validación-cliente/error-servidor. `char_length(description) <= 500` es la
// restricción de la tabla (`20260718_collections.sql`); se valida antes de
// llegar a la BD para no gastar un roundtrip en un texto que se va a rechazar
// igual. Vaciar el campo (textarea en blanco) es válido: guarda `null`, no
// una cadena vacía, para que el resto del código siga tratando "sin
// descripción" como ya lo hacía (`detail.description &&` en CollectionDetail).
export async function updateCollectionDescription(
  id: string,
  text: string,
): Promise<{ error?: string }> {
  const clean = text.trim();
  if (clean.length > 500) return { error: "invalid_description" };
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("collections")
    .update({ description: clean || null, updated_at: new Date().toISOString() })
    .eq("id", id); // RLS restringe al dueño
  if (error) return { error: "description_failed" };
  revalidatePath("/coleccion");
  revalidatePath(`/coleccion/c/${id}`);
  return {};
}

export async function deleteCollection(id: string): Promise<{ error?: string }> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("collections").delete().eq("id", id);
  if (error) return { error: "delete_failed" };
  revalidatePath("/coleccion");
  return {};
}

// La hoja D marca/desmarca varias: aquí solo se AÑADEN las marcadas nuevas
// (upsert idempotente por la PK compuesta). El desmarcado se maneja en S2 con
// setItemCollections; en S1 basta con añadir.
export async function addItemToCollections(
  itemType: ItemType,
  itemId: string,
  collectionIds: string[],
): Promise<{ error?: string }> {
  if (collectionIds.length === 0) return {};
  const { supabase } = await requireUser();
  const rows = collectionIds.map((collection_id) => ({ collection_id, item_type: itemType, item_id: itemId }));
  const { error } = await supabase
    .from("collection_items")
    .upsert(rows, { onConflict: "collection_id,item_type,item_id", ignoreDuplicates: true });
  if (error) return { error: "add_failed" };
  // Tocar updated_at de las colecciones afectadas para el orden «Recientes».
  await supabase.from("collections").update({ updated_at: new Date().toISOString() }).in("id", collectionIds);
  revalidatePath("/coleccion");
  return {};
}

// La hoja D en modo "Hecho" (S2, Task 3): deja el ítem EXACTAMENTE en las
// colecciones marcadas — calcula altas/bajas contra el estado actual en vez
// de vaciar-y-reinsertar, para no perder `position`/`added_at` de lo que ya
// estaba. RLS gatea al dueño en ambas tablas.
export async function setItemCollections(
  itemType: ItemType,
  itemId: string,
  collectionIds: string[],
): Promise<{ error?: string }> {
  const { supabase, userId } = await requireUser();
  let current: Set<string>;
  try {
    current = await getCollectionsForItem(supabase, userId, itemType, itemId);
  } catch {
    return { error: "set_failed" };
  }
  const next = new Set(collectionIds);
  const toAdd = collectionIds.filter((id) => !current.has(id));
  const toRemove = [...current].filter((id) => !next.has(id));

  if (toAdd.length > 0) {
    const rows = toAdd.map((collection_id) => ({ collection_id, item_type: itemType, item_id: itemId }));
    const { error } = await supabase
      .from("collection_items")
      .upsert(rows, { onConflict: "collection_id,item_type,item_id", ignoreDuplicates: true });
    if (error) return { error: "set_failed" };
  }

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("collection_items")
      .delete()
      .in("collection_id", toRemove)
      .eq("item_type", itemType)
      .eq("item_id", itemId);
    if (error) return { error: "set_failed" };
  }

  const touched = [...toAdd, ...toRemove];
  if (touched.length > 0) {
    await supabase.from("collections").update({ updated_at: new Date().toISOString() }).in("id", touched);
  }
  revalidatePath("/coleccion");
  return {};
}

export type SheetCollection = CollectionCard & { checked: boolean };

// Datos de la hoja «Añadir a colección», pedidos por el CLIENTE al abrirla
// (no precargados desde el server component de la ficha/grid): son solo
// necesarios si el usuario de verdad la abre, y así el mismo componente sirve
// a los dos disparadores (ficha y `LibraryItemCard`, este último ya cliente)
// sin duplicar el fetch en cada page.tsx. Mismo patrón que `searchSagas`
// (lectura vía server action, sin `revalidatePath`).
export async function getCollectionsForSheet(
  itemType: ItemType,
  itemId: string,
): Promise<{ collections: SheetCollection[] } | { error: string }> {
  const { supabase, userId } = await requireUser();
  try {
    const [cards, checkedIds] = await Promise.all([
      listCollections(supabase, userId),
      getCollectionsForItem(supabase, userId, itemType, itemId),
    ]);
    return {
      collections: cards.map((c) => ({ ...c, checked: checkedIds.has(c.id) })),
    };
  } catch {
    return { error: "load_failed" };
  }
}
