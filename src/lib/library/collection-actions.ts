"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";

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
