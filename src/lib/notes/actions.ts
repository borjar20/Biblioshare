"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import {
  revalidateProfilePages,
  revalidateItemPage,
} from "@/lib/reactivity/revalidate";
import { normalizeTags } from "./tags";

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

  const body = String(formData.get("note") ?? "").trim();
  if (!body || body.length > MAX_BODY) return { error: "empty" };

  const kind = formData.get("noteKind") === "quote" ? "quote" : "note";
  const isFavorite = formData.get("noteFavorite") === "on";
  const isSpoiler = formData.get("noteSpoiler") === "on";
  // Se guarda la intención; NADIE ajeno lo lee todavía (no hay política RLS de
  // lectura pública). Ver la spec 2026-07-21, D3.
  const isPublic = formData.get("notePublic") === "on";
  const tags = normalizeTags(String(formData.get("noteTags") ?? ""));

  // Anclaje. Un valor ilegible NO tumba el guardado: una nota sin página sigue
  // siendo una nota, y perder el texto por un número mal escrito es la peor de
  // las dos pérdidas.
  let position: Record<string, number> | null = null;
  const pageRaw = String(formData.get("notePage") ?? "").trim();
  const seasonRaw = String(formData.get("noteSeason") ?? "").trim();
  const episodeRaw = String(formData.get("noteEpisode") ?? "").trim();
  if (pageRaw) {
    const page = Number(pageRaw);
    if (Number.isInteger(page) && page >= 0) position = { page };
  } else if (seasonRaw && episodeRaw) {
    const season = Number(seasonRaw);
    const episode = Number(episodeRaw);
    if (Number.isInteger(season) && season >= 0 && Number.isInteger(episode) && episode >= 0) {
      position = { season, episode };
    }
  }

  const { error } = await supabase.from("notes").insert({
    user_id: user.id,
    item_type: itemType,
    item_id: itemId,
    kind,
    body,
    position,
    is_favorite: isFavorite,
    is_spoiler: isSpoiler,
    is_public: isPublic,
    meta: { tags },
  });

  if (error) return { error: "generic" };

  revalidateItemPage(itemType, itemId);
  revalidateProfilePages();
  return {};
}

// Marca / desmarca una nota como favorita (RLS acota al dueño). itemType/
// itemId son solo para revalidar la ficha desde donde se pinta la lista
// ("Mis notas y citas", Tarea 8) — sin esto, la tarjeta cambiaría en BD pero
// no en pantalla hasta recargar a mano (misma clase de bug que #36/#37/#39/#66).
export async function toggleNoteFavorite(
  noteId: string,
  next: boolean,
  itemType: ItemType,
  itemId: string,
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

  revalidateItemPage(itemType, itemId);
  revalidateProfilePages();
}

export async function deleteNote(
  noteId: string,
  itemType: ItemType,
  itemId: string,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase.from("notes").delete().eq("id", noteId).eq("user_id", user.id);

  revalidateItemPage(itemType, itemId);
  revalidateProfilePages();
}
