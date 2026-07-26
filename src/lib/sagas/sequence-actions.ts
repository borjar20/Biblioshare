"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import { revalidateSagaEditPage, revalidateSagaPage } from "@/lib/reactivity/revalidate";
import { validateSequenceDraft } from "./validate-sequence-draft";
import { getAnchorOptions } from "./get-anchor-options";
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

  // Anclas válidas: TODO el subárbol (getAnchorOptions), no solo `childIds` —
  // una ventana puede apuntar a una obra de un nieto. Es la última red antes
  // del RPC: un ancla que apuntara a algo fuera del subárbol dispararía un
  // 23503 en `save_saga_sequence` y abortaría la transacción entera, no solo
  // la ventana.
  const anchors = await getAnchorOptions(supabase, sagaId);
  const anchorKeys = new Set(
    anchors.map((a) => (a.kind === "item" ? `i:${a.itemType}:${a.itemId}` : `s:${a.childSagaId}`)),
  );
  const { errors } = validateSequenceDraft(payload, { childIds: new Set(childIds), anchorKeys });
  if (errors.length > 0) return { error: errors[0] };

  const { error } = await supabase.rpc("save_saga_sequence", {
    p_saga_id: sagaId,
    p_entries: payload.entries,
    p_blocks: payload.blocks,
    p_removed: payload.removed,
    p_windows: payload.windows,
  });
  if (error) return { error: "generic" };

  revalidateSagaPage(sagaId);
  revalidateSagaEditPage(sagaId);
  return {};
}
