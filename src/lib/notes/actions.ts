"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { getActivePass } from "@/lib/passes/get-passes";
import {
  revalidateProfilePages,
  revalidateItemPage,
} from "@/lib/reactivity/revalidate";
import { normalizeTags } from "./tags";

export type AddNoteState = {
  error?: "empty" | "generic";
  /** Id de la nota recién creada. Lo usa SessionNotebook para enlazarla a la
   *  sesión al guardar (session_id se pone después, no aquí). */
  id?: string;
};

const VALID_TYPES: ItemType[] = ["book", "movie", "series"];
const MAX_BODY = 5000;

// Añadir una nota o cita desde la ficha (sin sesión). `session_id` queda
// siempre null: esta ruta no cuelga de ninguna sesión de progreso, ni
// siquiera para un libro o una serie con pase activo. `pass_id` en cambio SÍ
// se resuelve abajo: si la obra tiene un pase activo, la nota se ancla a él
// (igual que hace addSession) para que un futuro cuaderno agrupado por pase
// pueda atribuirla; si no hay pase activo (obra sin seguir), queda null.
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
  // `[...body].length`, no `body.length`: el CHECK de Postgres (y el de
  // addSession, que escribe la misma columna desde la otra ruta) cuenta code
  // points, no unidades UTF-16 — ver el comentario largo en sessions/actions.ts.
  if (!body || [...body].length > MAX_BODY) return { error: "empty" };

  const pass = await getActivePass(supabase, itemType, itemId, user.id);

  const kind = formData.get("noteKind") === "quote" ? "quote" : "note";
  const isFavorite = formData.get("noteFavorite") === "on";
  const isSpoiler = formData.get("noteSpoiler") === "on";
  // Se guarda la intención; NADIE ajeno lo lee todavía (no hay política RLS de
  // lectura pública). Ver la spec 2026-07-21, D3.
  const isPublic = formData.get("notePublic") === "on";
  const tags = normalizeTags(String(formData.get("noteTags") ?? ""));

  // Anclaje. Un valor ilegible NO tumba el guardado: una nota sin página sigue
  // siendo una nota, y perder el texto por un número mal escrito es la peor de
  // las dos pérdidas. Acotado por tipo (igual que addSession): `notePage`
  // solo cuenta para libro, `noteSeason`/`noteEpisode` solo para serie — un
  // POST fabricado no debe poder colar un anclaje que no encaja con el medio.
  let position: Record<string, number> | null = null;
  const pageRaw = itemType === "book" ? String(formData.get("notePage") ?? "").trim() : "";
  const seasonRaw = itemType === "series" ? String(formData.get("noteSeason") ?? "").trim() : "";
  const episodeRaw = itemType === "series" ? String(formData.get("noteEpisode") ?? "").trim() : "";
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

  const { data, error } = await supabase
    .from("notes")
    .insert({
      user_id: user.id,
      item_type: itemType,
      item_id: itemId,
      pass_id: pass?.id ?? null,
      session_id: null,
      kind,
      body,
      position,
      is_favorite: isFavorite,
      is_spoiler: isSpoiler,
      is_public: isPublic,
      meta: { tags },
    })
    .select("id")
    .single();

  if (error || !data) return { error: "generic" };

  // SessionNotebook llama esta acción varias veces MIENTRAS la hoja de
  // sesión sigue abierta (una por nota) — revalidar aquí dispara un refresh
  // de Next.js que, si llega mientras el usuario ya está escribiendo la
  // SIGUIENTE nota, le pisa el texto (carrera confirmada por e2e:
  // notas-captura.spec.ts, "varias notas..."). addSession ya revalida todo
  // (revalidateReadingLog cubre lo mismo que las dos líneas de abajo) al
  // guardar la sesión, así que saltarlo aquí no deja nada sin refrescar en
  // el camino normal — solo en el caso de abandonar la hoja sin guardar
  // (D5 de la spec 2026-07-29), donde una carga completa más tarde ya trae
  // la nota de todos modos.
  if (formData.get("skipRevalidate") !== "on") {
    revalidateItemPage(itemType, itemId);
    revalidateProfilePages();
  }
  return { id: data.id };
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
