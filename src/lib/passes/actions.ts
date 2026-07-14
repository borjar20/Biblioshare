"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { itemHref } from "@/lib/catalog/item-href";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Mismo patrón que las demás acciones de biblioteca: detalle, perfil y
// estante de inicio renderizan estado de pases.
function revalidateItemViews(itemType: ItemType, itemId: string) {
  revalidatePath(itemHref(itemType, itemId));
  revalidatePath("/u/[username]", "page");
  revalidatePath("/");
}

// Nota SIEMPRE entera 1-10 (media estrella a cinco estrellas); la escala de
// estrellas es solo presentación. `undefined` = valor recibido inválido,
// distinto de "sin puntuar" (`null`). Una server action es un endpoint POST
// público: no puede fiarse de lo que le manden.
function parseRating(raw: FormDataEntryValue | null): number | null | undefined {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const rating = Number(value);
  if (!Number.isInteger(rating) || rating < 1 || rating > 10) return undefined;
  return rating;
}

// Vacío = hoy (comportamiento por defecto al cerrar un pase). Si viene algo,
// tiene que ser una fecha ISO válida y no futura. `undefined` = inválida.
function parseFinishedOn(raw: FormDataEntryValue | null): string | undefined {
  const value = String(raw ?? "").trim();
  if (!value) return today();
  if (!ISO_DATE.test(value) || value > today()) return undefined;
  return value;
}

export type ClosePassState = {
  error?: "invalidDate" | "invalidRating" | "generic";
};

// Compartido por closePass y updatePass: mismos campos (finishedOn, rating,
// review, isPublic), la única diferencia entre las dos acciones es el gesto
// que las dispara (cerrar un pase abierto vs. editar uno ya cerrado).
async function savePassFields(
  supabase: SupabaseServerClient,
  passId: string,
  userId: string,
  formData: FormData
): Promise<ClosePassState> {
  const finishedOn = parseFinishedOn(formData.get("finishedOn"));
  if (finishedOn === undefined) return { error: "invalidDate" };

  const rating = parseRating(formData.get("rating"));
  if (rating === undefined) return { error: "invalidRating" };

  const review = String(formData.get("review") ?? "").trim();
  // is_public tiene default false en la columna: hay que escribirlo siempre
  // explícitamente, nunca confiar en el default.
  const isPublic = formData.get("isPublic") === "on";

  const { error } = await supabase
    .from("diary_entries")
    .update({
      finished_on: finishedOn,
      rating,
      review: review || null,
      is_public: isPublic,
    })
    .eq("id", passId)
    .eq("user_id", userId);

  return error ? { error: "generic" } : {};
}

// El usuario nunca abre un pase a mano en el flujo normal: lo abre el cambio
// de estado del ítem (updateStatus en manage-actions.ts). Esta acción existe
// para los gestos que necesitan abrir uno directamente (p. ej. "releer" desde
// el diario). Solo puede haber un pase abierto por entrada — lo garantiza el
// índice único parcial diary_entries_one_open_pass en BD, no la app: los
// cambios de estado pueden llegar en paralelo desde dos pestañas. Si el
// insert choca con él (23505), ya había un pase abierto: es justo lo que
// queríamos, no un error que deba explotar.
export async function openPass(
  entryId: string,
  editionId: string | null
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.from("diary_entries").insert({
    library_entry_id: entryId,
    user_id: user.id,
    started_on: today(),
    finished_on: null,
    is_public: false,
    edition_id: editionId,
  });

  if (error && error.code !== "23505") throw error;
}

// Cierra el pase abierto: "¿Qué te ha parecido?" tras terminar de leer/ver.
export async function closePass(
  passId: string,
  itemType: ItemType,
  itemId: string,
  _prevState: ClosePassState,
  formData: FormData
): Promise<ClosePassState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const result = await savePassFields(supabase, passId, user.id, formData);
  if (result.error) return result;

  revalidateItemViews(itemType, itemId);
  return {};
}

// Edita un pase ya cerrado desde el diario (misma validación que closePass).
export async function updatePass(
  passId: string,
  itemType: ItemType,
  itemId: string,
  _prevState: ClosePassState,
  formData: FormData
): Promise<ClosePassState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const result = await savePassFields(supabase, passId, user.id, formData);
  if (result.error) return result;

  revalidateItemViews(itemType, itemId);
  return {};
}

export async function deletePass(
  passId: string,
  itemType: ItemType,
  itemId: string
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Las sesiones del pase (progress_sessions.pass_id) se borran en cascada
  // por la FK: on delete cascade en 20260714_passes.sql.
  const { error } = await supabase
    .from("diary_entries")
    .delete()
    .eq("id", passId)
    .eq("user_id", user.id);

  if (error) throw error;
  revalidateItemViews(itemType, itemId);
}

export async function setPassEdition(
  passId: string,
  itemType: ItemType,
  itemId: string,
  editionId: string | null
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("diary_entries")
    .update({ edition_id: editionId })
    .eq("id", passId)
    .eq("user_id", user.id);

  if (error) throw error;
  revalidateItemViews(itemType, itemId);
}
