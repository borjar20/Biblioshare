import type { createClient } from "@/lib/supabase/server";
import type { MembershipOp } from "./editor-types";
import type { SagaItemRole } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Cambios de membresía del editor (spec §3.5): el selector «Subsaga» mueve la
// fila de saga_items DENTRO del árbol (root + hijas directas), sin tocar
// membresías ajenas. Re-promoción de is_primary (DEFER F1): si la fila borrada
// era primary, la nueva membresía hereda primary; si el ítem no tiene primary
// en NINGUNA saga, la nueva la toma. Esto aplica tanto si el destino requiere
// un insert nuevo COMO si el ítem ya estaba en el destino (`promoteTarget`):
// caso real (manage-saga-actions.ts:108-111) — fila en root sin primary
// (cache-as-you-go) + fila curada en una hija CON primary; al mover a root se
// borra la hija primary, así que la fila YA existente en root debe heredarla,
// o el ítem se queda sin primary para siempre sin que salte ningún error.

export type TreeMembershipRow = {
  saga_id: string;
  position: number | null;
  role: SagaItemRole | null;
  is_primary: boolean;
};

export type MembershipPlan = {
  deleteFrom: string[];
  insert: { saga_id: string; position: number | null; role: SagaItemRole | null; is_primary: boolean } | null;
  /** true = la fila YA existente en el destino debe pasar a is_primary=true (UPDATE, no INSERT). */
  promoteTarget: boolean;
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
  const wasPrimaryInTree = others.some((r) => r.is_primary);

  if (inTarget) {
    return {
      deleteFrom,
      insert: null,
      promoteTarget: !inTarget.is_primary && (wasPrimaryInTree || !hasPrimaryAnywhere),
    };
  }

  const carried = others.find((r) => r.position !== null);
  // El role se arrastra por separado del position: una fila puede tener rol sin
  // número (justo el caso de una precuela), así que buscarlo en la misma fila
  // que trae el position lo perdería.
  const carriedRole = others.find((r) => r.role !== null);
  return {
    deleteFrom,
    insert: {
      saga_id: targetTableSagaId,
      position: carried?.position ?? null,
      role: carriedRole?.role ?? null,
      is_primary: wasPrimaryInTree || !hasPrimaryAnywhere,
    },
    promoteTarget: false,
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
      .select("saga_id, position, role, is_primary")
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
        role: plan.insert.role,
        is_primary: plan.insert.is_primary,
      });
      if (error) return "insert-failed";
    }
    if (plan.promoteTarget) {
      // Re-promoción (DEFER F1): la fila del destino hereda la primary de la
      // hermana borrada (o toma la primary si el ítem no tenía ninguna). El
      // delete previo ya liberó el índice parcial.
      const { error } = await supabase
        .from("saga_items")
        .update({ is_primary: true })
        .eq("saga_id", targetTableSagaId)
        .eq("item_type", op.itemType)
        .eq("item_id", op.itemId);
      if (error) return "promote-failed";
    }
  }
  return null;
}
