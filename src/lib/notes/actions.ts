"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import {
  revalidateProfilePages,
  revalidateItemPage,
} from "@/lib/reactivity/revalidate";

export type AddNoteState = {
  error?: "empty" | "generic";
};

const VALID_TYPES: ItemType[] = ["book", "movie", "series"];
const MAX_BODY = 5000;

// Añadir una nota o cita desde la ficha (sin sesión). El pase/sesión quedan
// null: una película no tiene sesión y una nota suelta tampoco la necesita.
export async function addNote(
  itemType: ItemType,
  itemId: string,
  _prevState: AddNoteState,
  formData: FormData,
): Promise<AddNoteState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!VALID_TYPES.includes(itemType)) return { error: "generic" };

  const body = String(formData.get("body") ?? "").trim();
  if (!body || body.length > MAX_BODY) return { error: "empty" };

  const kind = formData.get("kind") === "quote" ? "quote" : "note";
  const isFavorite = formData.get("isFavorite") === "on";

  const pageRaw = String(formData.get("page") ?? "").trim();
  let position: { page: number } | null = null;
  if (pageRaw) {
    const page = Number(pageRaw);
    if (Number.isInteger(page) && page >= 0) position = { page };
  }

  const { error } = await supabase.from("notes").insert({
    user_id: user.id,
    item_type: itemType,
    item_id: itemId,
    kind,
    body,
    position,
    is_favorite: isFavorite,
  });

  if (error) return { error: "generic" };

  revalidateItemPage(itemType, itemId);
  revalidateProfilePages();
  return {};
}

// Marca / desmarca una nota como favorita (RLS acota al dueño).
export async function toggleNoteFavorite(
  noteId: string,
  next: boolean,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase
    .from("notes")
    .update({ is_favorite: next })
    .eq("id", noteId)
    .eq("user_id", user.id);

  revalidateProfilePages();
}

export async function deleteNote(noteId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase.from("notes").delete().eq("id", noteId).eq("user_id", user.id);

  revalidateProfilePages();
}
