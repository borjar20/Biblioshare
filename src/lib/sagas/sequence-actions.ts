"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import { revalidateSagaEditPage, revalidateSagaPage } from "@/lib/reactivity/revalidate";
import { validateSequenceDraft } from "./validate-sequence-draft";
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

  const { errors } = validateSequenceDraft(payload, { childIds: new Set(childIds) });
  if (errors.length > 0) return { error: errors[0] };

  const { error } = await supabase.rpc("save_saga_sequence", {
    p_saga_id: sagaId,
    p_entries: payload.entries,
    p_blocks: payload.blocks,
    p_removed: payload.removed,
  });
  if (error) return { error: "generic" };

  revalidateSagaPage(sagaId);
  revalidateSagaEditPage(sagaId);
  return {};
}
