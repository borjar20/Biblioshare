"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import { revalidateSagaEditPage, revalidateSagaPage } from "@/lib/reactivity/revalidate";
import { validateSequenceDraft } from "./validate-sequence-draft";
import { getAnchorOptions } from "./get-anchor-options";
import { loadWindowOwners } from "./window-owners";
import type { SequencePayload } from "./sequence-draft";

// Doble gate a propósito, no triple: la RPC es SECURITY DEFINER, así que sus
// escrituras corren con los privilegios del dueño y SALTAN la RLS de
// saga_items — esa política no protege nada aquí. Los gates reales son el de
// este server action (da un error legible en la UI) y el de la RPC (la
// garantía de verdad). Los dos, nunca solo uno (mismo criterio que
// saveRoute en route-actions.ts).
export async function saveSequence(
  sagaId: string,
  payload: SequencePayload,
  childIds: string[],
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!hasMinRole(await getCurrentUserRole(supabase), "collaborator")) return { error: "forbidden" };

  // Anclas y dueños válidos: los dos se resuelven CONTRA BD, no se cree al
  // cliente. Las anclas son TODO el subárbol (getAnchorOptions), no solo
  // `childIds` — una ventana puede apuntar a una obra de un nieto, y un ancla
  // fuera del subárbol dispararía un 23503 en `save_saga_sequence` que abortaría
  // la transacción entera, no solo la ventana. Solo cuando hay ventanas que
  // validar — `validateSequenceDraft` no toca ninguno de los dos fuera del bucle
  // sobre `payload.windows`, así que el guardado normal (sin ninguna ventana) no
  // paga ni el recorrido del subárbol ni la consulta de dueños.
  const anchorKeys = new Set<string>();
  let windowOwners = new Map<string, string>();
  if (payload.windows.length > 0) {
    const [anchors, owners] = await Promise.all([
      getAnchorOptions(supabase, sagaId),
      loadWindowOwners(supabase, sagaId),
    ]);
    for (const a of anchors) {
      anchorKeys.add(a.kind === "item" ? `i:${a.itemType}:${a.itemId}` : `s:${a.childSagaId}`);
    }
    windowOwners = owners;

    // `loadWindowOwners` lee el estado ANTERIOR al guardado, así que por sí solo
    // acusaría de `windowNotFree` a la entrada que este mismo borrador acaba de
    // mandar a «Cuando quieras»: en BD todavía es `fijo`. Es el `foreignBlock`
    // falso de la fase 2a otra vez, ahora del lado del servidor.
    //
    // Se superpone lo que el payload VA a escribir, sin pisar lo que BD ya sabe:
    // el `if (!has)` conserva la dueña resuelta contra BD (la que decide
    // `is_primary` con doble membresía) y solo añade los sujetos que esta saga
    // está creando ahora, cuya fila vive por definición bajo ella.
    for (const e of payload.entries) {
      if (e.placement !== "libre") continue;
      const key = `i:${e.item_type}:${e.item_id}`;
      if (!windowOwners.has(key)) windowOwners.set(key, sagaId);
    }
    for (const b of payload.blocks) {
      if (b.placement_in_parent !== "libre") continue;
      const key = `s:${b.child_saga_id}`;
      if (!windowOwners.has(key)) windowOwners.set(key, sagaId);
    }
  }
  const { errors } = validateSequenceDraft(payload, {
    childIds: new Set(childIds),
    anchorKeys,
    windowOwners,
  });
  if (errors.length > 0) return { error: errors[0] };

  // `p_window_subjects` NO se valida aquí contra `windowOwners`: el alcance de
  // lo que puede borrar lo acota el propio RPC (solo `p_saga_id` y sus hijas
  // directas), y dentro de ese alcance un collaborator ya puede borrar
  // cualquier ventana por la interfaz normal. Validarlo además obligaría a
  // pagar la consulta de dueños en TODO guardado, incluidos los que no tocan
  // ninguna ventana.
  const { error } = await supabase.rpc("save_saga_sequence", {
    p_saga_id: sagaId,
    p_entries: payload.entries,
    p_blocks: payload.blocks,
    p_removed: payload.removed,
    p_windows: payload.windows,
    p_window_subjects: payload.windowSubjects,
  });
  if (error) return { error: "generic" };

  revalidateSagaPage(sagaId);
  revalidateSagaEditPage(sagaId);
  return {};
}
