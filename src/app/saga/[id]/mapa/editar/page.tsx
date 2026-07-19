import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole, hasMinRole } from "@/lib/auth/roles";
import { getSagaDetail } from "@/lib/sagas/get-saga-detail";
import type { EditorEdge, EditorNode, NodeDisplay } from "@/lib/sagas/editor-types";
import { displayKey } from "@/lib/sagas/editor-types";
import { SagaGraphEditor } from "@/components/saga/editor/saga-graph-editor";

export const metadata: Metadata = { title: "Editar grafo — Biblioshare" };

// Editor del grafo (spec §3.1, frame F). Gate duro collaborator+ (patrón
// admin/page.tsx). Carga las filas CRUDAS de nodos/aristas (el borrador edita
// los campos persistidos, no la vista resuelta) + un mapa de display para
// pintar portadas/títulos, construido con los mismos datos de la ficha.
export default async function SagaGraphEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!hasMinRole(await getCurrentUserRole(supabase), "collaborator")) redirect(`/saga/${id}`);

  const detail = await getSagaDetail(supabase, id);
  if (!detail) notFound();

  const [{ data: rawNodes }, { data: rawEdges }, { data: childRows }] = await Promise.all([
    supabase
      .from("saga_nodes")
      .select("id, item_type, item_id, child_saga_id, x, y, level, order_no, label_override")
      .eq("saga_id", id)
      .order("created_at", { ascending: true }),
    supabase.from("saga_edges").select("id, from_node, to_node, edge_type").eq("saga_id", id).order("id"),
    supabase.from("sagas").select("id, name, accent_color").eq("parent_saga_id", id).order("name"),
  ]);

  const nodes: EditorNode[] = (rawNodes ?? []).map((n) => ({
    id: n.id,
    itemType: n.item_type,
    itemId: n.item_id,
    childSagaId: n.child_saga_id,
    x: n.x,
    y: n.y,
    level: n.level,
    orderNo: n.order_no,
    labelOverride: n.label_override,
  }));
  const edges: EditorEdge[] = (rawEdges ?? []).map((e) => ({
    id: e.id,
    fromNode: e.from_node,
    toNode: e.to_node,
    edgeType: e.edge_type,
  }));

  // Display: miembros de la ficha (título+portada) y sagas hijas por nombre.
  const display: Record<string, NodeDisplay> = {};
  for (const g of detail.groups) {
    for (const m of g.members) {
      display[displayKey({ itemType: m.itemType, itemId: m.itemId, childSagaId: null })] = {
        label: m.title,
        coverUrl: m.coverUrl,
      };
    }
  }
  for (const c of childRows ?? []) {
    display[displayKey({ itemType: null, itemId: null, childSagaId: c.id })] = { label: c.name, coverUrl: null };
  }
  // Membresía actual por ítem (para el selector de subsaga del inspector).
  const membership: Record<string, string | null> = {};
  for (const g of detail.groups) {
    for (const m of g.members) {
      membership[`${m.itemType}:${m.itemId}`] = g.sagaId;
    }
  }

  return (
    <SagaGraphEditor
      saga={{ id: detail.saga.id, name: detail.saga.name }}
      initialNodes={nodes}
      initialEdges={edges}
      initialDisplay={display}
      initialMembership={membership}
      childSagas={(childRows ?? []).map((c) => ({ id: c.id, name: c.name, accentColor: c.accent_color }))}
    />
  );
}
