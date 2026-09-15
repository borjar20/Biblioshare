"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { revalidateReadingLog } from "@/lib/reactivity/revalidate";
import { notifyMentions } from "@/lib/social/notify-mentions";
import { diffNewMentions } from "@/lib/social/mentions";
import { parseDroppedReason } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function today(): string {
  return new Date().toISOString().slice(0, 10);
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
  error?: "invalidDate" | "invalidRating" | "invalidReason" | "generic";
};

// Nota SIEMPRE entera 1-10 (misma regla que parseRating, pero aquí el valor
// llega ya como number desde el cliente, no como FormDataEntryValue).
function isValidRating(rating: number): boolean {
  return Number.isInteger(rating) && rating >= 1 && rating <= 10;
}

// Compartido por closePass y updatePass: mismos campos (finishedOn, rating,
// review, isPublic), la única diferencia entre las dos acciones es el gesto
// que las dispara (cerrar un pase abierto vs. editar uno ya cerrado).
async function savePassFields(
  supabase: SupabaseServerClient,
  passId: string,
  userId: string,
  formData: FormData
): Promise<ClosePassState & { review?: string | null; isPublic?: boolean }> {
  let finishedOn: string | null | undefined = parseFinishedOn(formData.get("finishedOn"));
  if (finishedOn === undefined) return { error: "invalidDate" };

  const rating = parseRating(formData.get("rating"));
  if (rating === undefined) return { error: "invalidRating" };

  const droppedReason = parseDroppedReason(formData.get("droppedReason"));
  if (droppedReason === undefined) return { error: "invalidReason" };
  // La nota solo tiene sentido junto a "otro" — se descarta server-side
  // aunque el cliente la mande, no nos fiamos del formulario.
  const droppedReasonNote =
    droppedReason === "otro"
      ? String(formData.get("droppedReasonNote") ?? "").trim() || null
      : null;

  const review = String(formData.get("review") ?? "").trim();
  // is_public tiene default false en la columna: hay que escribirlo siempre
  // explícitamente, nunca confiar en el default.
  const isPublic = formData.get("isPublic") === "on";

  // Cerrar con una fecha ANTERIOR al inicio no es un error del usuario: es el
  // camino normal de «añado hoy una obra que leí hace años». Lo que pasa es que
  // `started_on` no lo escribe nadie a mano —lo pone la máquina al pasar a en
  // curso (apply-transition) o lo trae el importador—, así que en ese caso vale
  // el día del alta, no el día en que se empezó. Se pone a NULL: «no se sabe
  // cuándo empezó», que es la verdad. El día del alta no se pierde, sigue en
  // `created_at`.
  //
  // Sin esto, producción acumuló 167 de 407 pases (41 %) con la fecha de inicio
  // POSTERIOR a la de fin (#729), y la ficha llegaba a anunciar lecturas de «1
  // día» que en realidad eran de años.
  const { data: actual } = await supabase
    .from("passes")
    .select("started_on, finished_on, status")
    .eq("id", passId)
    .eq("user_id", userId)
    .maybeSingle();
  // Editing an already completed, undated pass must not invent today's date.
  if (actual?.status === "completed" && actual.finished_on === null && !String(formData.get("finishedOn") ?? "").trim()) finishedOn = null;
  const inicioInvalido =
    finishedOn !== null && actual?.started_on != null && finishedOn < actual.started_on;

  const { error } = await supabase
    .from("passes")
    .update({
      finished_on: finishedOn,
      rating,
      review: review || null,
      is_public: isPublic,
      dropped_reason: droppedReason,
      dropped_reason_note: droppedReasonNote,
      ...(inicioInvalido ? { started_on: null } : {}),
    })
    .eq("id", passId)
    .eq("user_id", userId);

  // review/isPublic se devuelven también en éxito: closePass y updatePass los
  // necesitan para decidir si notifican menciones (alta: todas; edición:
  // solo el diff de menciones nuevas, issue #317 — ver llamadas más abajo)
  // sin tener que releer la fila recién escrita.
  return error ? { error: "generic" } : { review: review || null, isPublic };
}

async function notifyPublicReviewMentions(
  supabase: SupabaseServerClient,
  authorId: string,
  passId: string,
  review: string,
  usernames?: string[],
): Promise<void> {
  try {
    const { data: target, error } = await supabase
      .from("interaction_targets")
      .select("id")
      .eq("kind", "diary_entry")
      .eq("source_id", passId)
      .maybeSingle();
    if (error) throw error;
    if (!target) return;
    await notifyMentions(supabase, {
      authorId,
      text: review,
      interactionTargetId: target.id,
      usernames,
    });
  } catch (error) {
    console.error("notifyPublicReviewMentions failed", error);
  }
}

// openPass ya no existe: abrir un pase es una transición de estado y pasa
// por applyTransition (src/lib/passes/apply-transition.ts), nunca un insert
// directo. Las acciones de este fichero editan un pase que ya reciben por id.

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

  // Menciones en la reseña: en el alta se notifican TODAS las presentes.
  // Solo tiene sentido si hay texto y la reseña es pública (el destinatario
  // debe poder verla) -- el gate 'profile' con el propio autor como owner
  // reutiliza la visibilidad de su perfil. updatePass reutiliza el mismo
  // helper pero solo para el diff de menciones nuevas (issue #317).
  if (result.review && result.isPublic) {
    await notifyPublicReviewMentions(supabase, user.id, passId, result.review);
  }

  // Cerrar el pase no avisa: el aviso de «terminó» lo emite createPost cuando
  // updateStatus autopostea el hito (manage-actions.ts), y solo si el usuario no
  // desactivó `autopost_finished` (opt-out por defecto activado, ver
  // src/lib/social/autopost.ts) -- con esa preferencia apagada no hay post y por
  // tanto tampoco aviso. Ver spec 2026-08-13.

  revalidateReadingLog(itemType, itemId);
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

  // Se lee ANTES de guardar: savePassFields sobrescribe review, y el diff de
  // menciones (issue #317) necesita el texto previo para saber cuáles son
  // nuevas.
  const { data: existing } = await supabase
    .from("passes")
    .select("review")
    .eq("id", passId)
    .eq("user_id", user.id)
    .maybeSingle();

  const result = await savePassFields(supabase, passId, user.id, formData);
  if (result.error) return result;

  // A diferencia de closePass, editar SÍ notifica -- pero solo las menciones
  // que son nuevas respecto al texto anterior: quien ya estaba mencionado
  // antes de la edición no vuelve a recibir aviso (issue #317).
  if (result.review && result.isPublic) {
    const newMentions = diffNewMentions(existing?.review ?? "", result.review);
    if (newMentions.length > 0) {
      await notifyPublicReviewMentions(supabase, user.id, passId, result.review, newMentions);
    }
  }

  revalidateReadingLog(itemType, itemId);
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
    .from("passes")
    .delete()
    .eq("id", passId)
    .eq("user_id", user.id);

  if (error) throw error;
  revalidateReadingLog(itemType, itemId);
}

// Puntuar el pase MIENTRAS sigue abierto (panel "Progreso" de la pestaña
// Registro, Tarea 12): no podemos reutilizar updatePass/savePassFields para
// esto — esa función siempre escribe finished_on (vacío → hoy), así que
// cerraría el pase de tapadillo. Si eso pasara, updateStatus ya no
// encontraría un pase abierto la próxima vez que el usuario marque
// "completado" y abriría uno nuevo (pase duplicado, sesiones huérfanas en el
// viejo). Esta acción solo toca la nota.
export async function ratePass(
  passId: string,
  itemType: ItemType,
  itemId: string,
  rating: number
): Promise<void> {
  // Esta acción es un endpoint POST público: no podemos fiarnos de que el
  // `rating` recibido venga del <RatingDots> del cliente. Mismo rango que
  // parseRating (entero 1-10); si no cumple, no escribimos nada y salimos.
  if (!isValidRating(rating)) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("passes")
    .update({ rating })
    .eq("id", passId)
    .eq("user_id", user.id);

  if (error) throw error;
  revalidateReadingLog(itemType, itemId);
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
    .from("passes")
    .update({ edition_id: editionId })
    .eq("id", passId)
    .eq("user_id", user.id);

  if (error) throw error;
  revalidateReadingLog(itemType, itemId);
}
