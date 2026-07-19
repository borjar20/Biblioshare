import type { createClient } from "@/lib/supabase/server";
import type { MembershipOp } from "./editor-types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Cambios de membresía del editor (spec §3.5): el selector «Subsaga» mueve la
// fila de saga_items DENTRO del árbol (root + hijas directas), sin tocar
// membresías ajenas. Re-promoción de is_primary (DEFER F1): si la fila borrada
// era primary, la nueva membresía hereda primary; si el ítem no tiene primary
// en NINGUNA saga, la nueva la toma.

export type TreeMembershipRow = {
  saga_id: string;
  position: number | null;
  is_primary: boolean;
};

export type MembershipPlan = {
  deleteFrom: string[];
  insert: { saga_id: string; position: number | null; is_primary: boolean } | null;
};

export function planMembershipOps(
  _op: MembershipOp,
  treeRows: TreeMembershipRow[],
  targetTableSagaId: string,
  hasPrimaryAnywhere: boolean,
): MembershipPlan {
  const inTarget = treeRows.find((r) => r.saga_id === targetTableSagaId);
  const others = treeRows.filter((r) => r.saga_id !== targetTableSagaId);
  const deleteFrom = others.map((r) => r.saga_id);
  if (inTarget) return { deleteFrom, insert: null };

  const carried = others.find((r) => r.position !== null);
  const wasPrimaryInTree = others.some((r) => r.is_primary);
  return {
    deleteFrom,
    insert: {
      saga_id: targetTableSagaId,
      position: carried?.position ?? null,
      is_primary: wasPrimaryInTree || !hasPrimaryAnywhere,
    },
  };
}

// Aplica una lista de ops contra la BD (llamado por saveSagaGraph con el gate
// ya pasado). Devuelve el primer error o null.
export async function applyMembershipOps(
  supabase: SupabaseServerClient,
  rootId: string,
  childIds: Set<string>,
  ops: MembershipOp[],
): Promise<string | null> {
  for (const op of ops) {
    if (op.targetSagaId !== null && !childIds.has(op.targetSagaId)) return "invalid-target";
    const targetTableSagaId = op.targetSagaId ?? rootId;
    const treeIds = [rootId, ...childIds];

    const { data: rows } = await supabase
      .from("saga_items")
      .select("saga_id, position, is_primary")
      .eq("item_type", op.itemType)
      .eq("item_id", op.itemId)
      .in("saga_id", treeIds);

    const { data: primaryAnywhere } = await supabase
      .from("saga_items")
      .select("saga_id")
      .eq("item_type", op.itemType)
      .eq("item_id", op.itemId)
      .eq("is_primary", true)
      .maybeSingle();

    const plan = planMembershipOps(op, (rows ?? []) as TreeMembershipRow[], targetTableSagaId, Boolean(primaryAnywhere));

    if (plan.deleteFrom.length > 0) {
      const { error } = await supabase
        .from("saga_items")
        .delete()
        .eq("item_type", op.itemType)
        .eq("item_id", op.itemId)
        .in("saga_id", plan.deleteFrom);
      if (error) return "delete-failed";
    }
    if (plan.insert) {
      const { error } = await supabase.from("saga_items").insert({
        saga_id: plan.insert.saga_id,
        item_type: op.itemType,
        item_id: op.itemId,
        position: plan.insert.position,
        is_primary: plan.insert.is_primary,
      });
      if (error) return "insert-failed";
    }
  }
  return null;
}
