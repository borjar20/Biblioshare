"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import { revalidateSagaPage } from "@/lib/reactivity/revalidate";
import { SAGA_ACCENT, type SagaAccentToken } from "./accents";
import { applyMembershipOps } from "./apply-membership-ops";
import type { EditorEdge, EditorNode, MembershipOp } from "./editor-types";
import { validateGraphDraft } from "./validate-graph-draft";

// Server actions del editor del grafo (spec §3). Gate collaborator+ en todas
// (además del gate interno de la RPC y de la RLS): patrón manage-saga-actions.

async function requireCollaborator() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!hasMinRole(await getCurrentUserRole(supabase), "collaborator")) {
    return { supabase: null } as const;
  }
  return { supabase } as const;
}

export async function saveSagaGraph(
  sagaId: string,
  nodes: EditorNode[],
  edges: EditorEdge[],
  ops: MembershipOp[],
): Promise<{ error?: string }> {
  const { supabase } = await requireCollaborator();
  if (!supabase) return { error: "forbidden" };

  const draftErrors = validateGraphDraft(nodes, edges);
  if (draftErrors.length > 0) return { error: "invalid-draft" };

  const { data: children } = await supabase.from("sagas").select("id").eq("parent_saga_id", sagaId);
  const childIds = new Set((children ?? []).map((c) => c.id));

  const opsError = await applyMembershipOps(supabase, sagaId, childIds, ops);
  if (opsError) return { error: opsError };

  const { error } = await supabase.rpc("save_saga_graph", {
    p_saga_id: sagaId,
    p_nodes: nodes.map((n) => ({
      id: n.id,
      item_type: n.itemType,
      item_id: n.itemId,
      child_saga_id: n.childSagaId,
      x: n.x,
      y: n.y,
      level: n.level,
      order_no: n.orderNo,
      label_override: n.labelOverride,
    })),
    p_edges: edges.map((e) => ({ from_node: e.fromNode, to_node: e.toNode, edge_type: e.edgeType })),
  });
  if (error) return { error: "save-failed" };

  revalidateSagaPage(sagaId);
  return {};
}

export async function createChildSaga(
  parentSagaId: string,
  name: string,
): Promise<{ id: string; name: string } | { error: string }> {
  const { supabase } = await requireCollaborator();
  if (!supabase) return { error: "forbidden" };
  const trimmed = name.trim();
  if (!trimmed) return { error: "nameRequired" };

  const { data, error } = await supabase
    .from("sagas")
    .insert({ name: trimmed, source: "manual", parent_saga_id: parentSagaId })
    .select("id, name")
    .single();
  if (error || !data) return { error: "generic" };
  revalidateSagaPage(parentSagaId);
  return data;
}

export async function nestExistingSaga(parentSagaId: string, childSagaId: string): Promise<{ error?: string }> {
  const { supabase } = await requireCollaborator();
  if (!supabase) return { error: "forbidden" };
  if (parentSagaId === childSagaId) return { error: "cycle" };

  // El trigger sagas_parent_no_cycle rechaza ciclos: capturamos su excepción.
  const { error } = await supabase.from("sagas").update({ parent_saga_id: parentSagaId }).eq("id", childSagaId);
  if (error) return { error: error.message.includes("cycle") ? "cycle" : "generic" };
  revalidateSagaPage(parentSagaId);
  revalidateSagaPage(childSagaId);
  return {};
}

export async function updateSagaAccent(
  sagaId: string,
  accent: SagaAccentToken | null,
): Promise<{ error?: string }> {
  const { supabase } = await requireCollaborator();
  if (!supabase) return { error: "forbidden" };
  if (accent !== null && (!(accent in SAGA_ACCENT) || accent === "beige")) return { error: "invalid-accent" };

  const { error } = await supabase.from("sagas").update({ accent_color: accent }).eq("id", sagaId);
  if (error) return { error: "generic" };
  revalidateSagaPage(sagaId);
  return {};
}
