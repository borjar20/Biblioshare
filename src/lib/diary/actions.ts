"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { itemHref } from "@/lib/catalog/item-href";
import { getDiaryEntries } from "./get-diary-entries";
import type { DiaryEntry } from "./types";

function revalidateItemViews(itemType: ItemType, itemId: string) {
  revalidatePath(itemHref(itemType, itemId));
  revalidatePath("/u/[username]", "page");
  revalidatePath("/");
}

export async function listDiaryEntries(
  libraryEntryId: string
): Promise<DiaryEntry[]> {
  const supabase = await createClient();
  return getDiaryEntries(supabase, libraryEntryId);
}

export type AddDiaryEntryState = {
  error?: "invalidRating" | "generic";
};

export async function addDiaryEntry(
  libraryEntryId: string,
  itemType: ItemType,
  itemId: string,
  _prevState: AddDiaryEntryState,
  formData: FormData
): Promise<AddDiaryEntryState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // La entrada debe ser del propio usuario (mismo check que addSession); el
  // FK compuesto (library_entry_id, user_id) ya lo garantiza en BD.
  const { data: entry, error: entryError } = await supabase
    .from("library_entries")
    .select("id")
    .eq("id", libraryEntryId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (entryError || !entry) return { error: "generic" };

  const finishedOn = String(formData.get("finishedOn") ?? "");
  const ratingRaw = String(formData.get("rating") ?? "").trim();
  const review = String(formData.get("review") ?? "").trim();

  let rating: number | null = null;
  if (ratingRaw) {
    rating = Number(ratingRaw);
    if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
      return { error: "invalidRating" };
    }
  }

  const { error } = await supabase.from("diary_entries").insert({
    library_entry_id: libraryEntryId,
    user_id: user.id,
    finished_on: finishedOn || undefined,
    rating,
    review: review || null,
    // is_public por defecto es false (pensada para las notas privadas
    // migradas de library_entries.notes, ver 20260714_passes.sql). Este
    // formulario es el mismo que antes de esa migración alimentaba
    // directamente la pestaña Comunidad sin distinción de privacidad, así
    // que un pase nuevo registrado aquí sigue siendo público por defecto —
    // sin esto, ninguna reseña nueva volvería a aparecer en Comunidad/feed
    // tras el filtro de is_public. Todavía no hay UI para marcar un pase
    // como privado; cuando exista, este valor deberá venir del formulario.
    is_public: true,
  });

  if (error) return { error: "generic" };

  revalidateItemViews(itemType, itemId);
  return {};
}

export async function deleteDiaryEntry(
  entryId: string,
  itemType: ItemType,
  itemId: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("diary_entries")
    .delete()
    .eq("id", entryId)
    .eq("user_id", user.id);

  if (error) throw error;
  revalidateItemViews(itemType, itemId);
}
