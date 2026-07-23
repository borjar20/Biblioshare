"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import type { ItemType } from "@/lib/catalog/types";
import { revalidateItemPage, revalidateSagaEditPage, revalidateSagaPage } from "@/lib/reactivity/revalidate";
import type { SagaItemRole } from "./types";

export type UpdateMemberState = {
  error?: "forbidden" | "notMember" | "badPosition" | "badRole" | "generic";
  ok?: true;
  /** Valores efectivamente guardados (hallazgo B-2, revisión Task 8): el cliente
   *  los usa para remontar los campos con una `key` derivada de ESTOS valores
   *  en vez de las props originales, así el reset-tras-éxito de React 19 no
   *  puede dejar el formulario mostrando (y por tanto reenviando en un
   *  segundo Guardar) un valor obsoleto. */
  saved?: { position: number | null; role: SagaItemRole | null };
};

const ROLES: SagaItemRole[] = ["precuela", "spin_off", "relato", "paralela"];
const isRole = (v: string): v is SagaItemRole => (ROLES as string[]).includes(v);

// Edita posición y rol de UNA membresía (issue #167). A diferencia de
// assignItemToSaga, esto es solo-edición: no crea sagas ni membresías, así que
// una petición contra un ítem que no es miembro es un error, no un alta
// silenciosa (la higiene que pide #176).
//
// Doble gate a propósito: la RLS de saga_items ya exige collaborator+, y aun
// así se re-comprueba aquí. Los dos, nunca solo uno (route-actions.ts:42-46).
export async function updateSagaMember(
  sagaId: string,
  // Saga cuya página /editar tiene delante el curador (hallazgo B-2 de la
  // revisión de Task 8): NO tiene por qué ser `sagaId` (la dueña real de la
  // fila, que puede ser una subsaga distinta) — es la raíz de la ruta
  // /saga/<este id>/editar.
  //
  // Hoy es REDUNDANTE para revalidar: en Next 16 `revalidatePath` enciende un
  // flag global (`pathWasRevalidated`) que no registra QUÉ ruta, así que
  // cualquiera de los otros dos revalidate ya fuerza el re-render de la página
  // actual. Se conserva porque es el ÚNICO que apunta a ESTA ruta el día que
  // Next aplique el cambio que sus propios docs anuncian (revalidatePath.md:
  // "will be updated in the future to apply only to the specific path"); ese
  // día, sin esto, el camino de error de B-2 se reabre.
  editorSagaId: string,
  itemType: ItemType,
  itemId: string,
  _prevState: UpdateMemberState,
  formData: FormData,
): Promise<UpdateMemberState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!hasMinRole(await getCurrentUserRole(supabase), "collaborator")) {
    return { error: "forbidden" };
  }

  // Posición: vacío = sin hueco fijo (null explícito, no "no tocar"). A
  // diferencia de assignItemToSaga, una entrada inválida NO cae a null en
  // silencio: devuelve error. Ese silencio es la deuda que arrastra el
  // formulario de alta y no se replica aquí.
  const positionRaw = String(formData.get("position") ?? "").trim();
  let position: number | null = null;
  if (positionRaw) {
    const parsed = Number(positionRaw);
    if (!Number.isInteger(parsed) || parsed <= 0) return { error: "badPosition" };
    position = parsed;
  }

  const roleRaw = String(formData.get("role") ?? "").trim();
  let role: SagaItemRole | null = null;
  if (roleRaw) {
    if (!isRole(roleRaw)) return { error: "badRole" };
    role = roleRaw;
  }

  // La membresía tiene que existir ya: este action no da de alta.
  const { data: existing } = await supabase
    .from("saga_items")
    .select("id")
    .eq("saga_id", sagaId)
    .eq("item_type", itemType)
    .eq("item_id", itemId)
    .maybeSingle();
  if (!existing) return { error: "notMember" };

  const { error } = await supabase
    .from("saga_items")
    .update({ position, role })
    .eq("saga_id", sagaId)
    .eq("item_type", itemType)
    .eq("item_id", itemId);
  if (error) return { error: "generic" };

  revalidateItemPage(itemType, itemId);
  revalidateSagaPage(sagaId);
  revalidateSagaEditPage(editorSagaId);
  return { ok: true, saved: { position, role } };
}
