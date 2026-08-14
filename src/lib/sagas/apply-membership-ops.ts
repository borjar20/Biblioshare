import type { createClient } from "@/lib/supabase/server";
import type { MembershipOp } from "./editor-types";
import type { SagaItemRole, SagaPlacement } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Cambios de membresía del editor (spec §3.5): el selector «Subsaga» mueve la
// fila de saga_items DENTRO del árbol (root + hijas directas), sin tocar
// membresías ajenas. Re-promoción de is_primary (DEFER F1): si la fila borrada
// era primary, la nueva membresía hereda primary; si el ítem no tiene primary
// en NINGUNA saga, la nueva la toma. Esto aplica tanto si el destino requiere
// un insert nuevo COMO si el ítem ya estaba en el destino (`promoteTarget`):
// caso real (manage-saga-actions.ts:100-109) — fila en root sin primary
// (cache-as-you-go) + fila curada en una hija CON primary; al mover a root se
// borra la hija primary, así que la fila YA existente en root debe heredarla,
// o el ítem se queda sin primary para siempre sin que salte ningún error.

export type TreeMembershipRow = {
  saga_id: string;
  position: number | null;
  placement: SagaPlacement | null;
  role: SagaItemRole | null;
  is_primary: boolean;
};

export type MembershipPlan = {
  deleteFrom: string[];
  insert: {
    saga_id: string;
    position: number | null;
    placement: SagaPlacement | null;
    role: SagaItemRole | null;
    is_primary: boolean;
  } | null;
  /** true = la fila YA existente en el destino debe pasar a is_primary=true (UPDATE, no INSERT). */
  promoteTarget: boolean;
  /** #186: cuando el ítem ya tiene fila en el destino, la hermana que se borra
   *  solo rellena (UPDATE) los campos que el destino tiene a null — nunca
   *  pisa un valor ya curado. position/placement viajan juntos (igual que en
   *  `insert`, por el CHECK saga_items_placement_position): si el destino ya
   *  tiene cualquiera de los dos no-nulo, ninguno de los dos se toca. */
  patchTarget: { position: number | null; placement: SagaPlacement | null; role: SagaItemRole | null } | null;
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
    // Mismo dual-lookup que el insert de abajo (position y role viajan por
    // separado a propósito). position+placement se tratan como UN campo
    // acoplado (el CHECK exige placement='fijo' ⇔ position no nulo): solo se
    // rellenan cuando el destino tiene AMBOS a null (fila en bruto tipo
    // cache-as-you-go). Si el destino ya tiene placement='libre' curado a
    // propósito (sin número), no se le cuela un position de la hermana.
    const carried = others.find((r) => r.position !== null);
    const carriedRole = others.find((r) => r.role !== null);
    const carriedPlacement = carried
      ? (carried.placement ?? "fijo")
      : (others.find((r) => r.placement !== null)?.placement ?? null);

    const canPatchPosition = inTarget.position === null && inTarget.placement === null;
    const patchPosition = canPatchPosition ? (carried?.position ?? null) : null;
    const patchPlacement = canPatchPosition ? carriedPlacement : null;
    const patchRole = inTarget.role === null ? (carriedRole?.role ?? null) : null;

    const patchTarget =
      patchPosition !== null || patchPlacement !== null || patchRole !== null
        ? { position: patchPosition, placement: patchPlacement, role: patchRole }
        : null;

    return {
      deleteFrom,
      insert: null,
      promoteTarget: !inTarget.is_primary && (wasPrimaryInTree || !hasPrimaryAnywhere),
      patchTarget,
    };
  }

  const carried = others.find((r) => r.position !== null);
  // El role se arrastra por separado del position: una fila puede tener rol sin
  // número (justo el caso de una precuela), así que buscarlo en la misma fila
  // que trae el position lo perdería.
  const carriedRole = others.find((r) => r.role !== null);
  // placement viaja PEGADO a position (issue del CHECK saga_items_placement_position,
  // review final de la rama): toda fila de origen que cumple el CHECK con
  // position no nulo tiene necesariamente placement='fijo', así que basta con
  // llevarse el de la fila que aporta el hueco. Si ninguna trae hueco, se
  // arrastra el placement no nulo que haya (el caso 'libre' sin número), igual
  // que el role — de lo contrario el insert de abajo dejaría
  // (placement=null, position=carried) o (placement=null tras perder un
  // 'libre'), y el primero viola el CHECK.
  //
  // OJO con el `??` cuando SÍ hay `carried`: no puede seguir la cadena hasta
  // OTRA fila si `carried.placement` es null. Con el CHECK viejo en forma OR
  // (arreglado en 20260725_saga_placement.sql, ver data-model.md §7.4) una
  // fila (position=N, placement=null) sí podía existir — dev llegó a tener
  // una — y `others.find((r) => r.placement !== null)` podía traerse el
  // 'libre' de una fila HERMANA, produciendo (position=carried.position,
  // placement='libre'): el CHECK actual lo rechaza igual (esa combinación
  // exige position null). Si `carried` existe, el placement que se arrastra
  // sale SOLO de esa misma fila (o 'fijo' por defecto, que es lo único
  // compatible con un position no nulo) — nunca de otra.
  const carriedPlacement = carried
    ? (carried.placement ?? "fijo")
    : (others.find((r) => r.placement !== null)?.placement ?? null);
  return {
    deleteFrom,
    insert: {
      saga_id: targetTableSagaId,
      position: carried?.position ?? null,
      placement: carriedPlacement,
      role: carriedRole?.role ?? null,
      is_primary: wasPrimaryInTree || !hasPrimaryAnywhere,
    },
    promoteTarget: false,
    patchTarget: null,
  };
}

// Aplica una lista de ops contra la BD (el llamador ya debe haber pasado su
// propio gate collaborator+, patrón manage-saga-actions). El editor de grafo
// que la llamaba (saveSagaGraph) se retiró en la fase 2a (Task 11): esta
// función queda sin consumidor en el árbol hasta que la curación de
// membresía del editor de secuencia la reconecte. Devuelve el primer error o
// null.
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
      .select("saga_id, position, placement, role, is_primary")
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
        placement: plan.insert.placement,
        role: plan.insert.role,
        is_primary: plan.insert.is_primary,
      });
      if (error) return "insert-failed";
    }
    if (plan.promoteTarget || plan.patchTarget) {
      // Re-promoción (DEFER F1) y patch enrich-only (#186) van en el MISMO
      // UPDATE sobre la fila del destino, calculado a partir de `plan`
      // (derivado de `rows`, ya leído antes del delete de arriba) — nunca de
      // una relectura tras el delete, que ya habría perdido la hermana.
      const patch: { is_primary?: true; position?: number; placement?: SagaPlacement; role?: SagaItemRole } = {};
      if (plan.promoteTarget) patch.is_primary = true;
      if (plan.patchTarget?.position !== null && plan.patchTarget?.position !== undefined) {
        patch.position = plan.patchTarget.position;
      }
      if (plan.patchTarget?.placement !== null && plan.patchTarget?.placement !== undefined) {
        patch.placement = plan.patchTarget.placement;
      }
      if (plan.patchTarget?.role !== null && plan.patchTarget?.role !== undefined) {
        patch.role = plan.patchTarget.role;
      }
      const { error } = await supabase
        .from("saga_items")
        .update(patch)
        .eq("saga_id", targetTableSagaId)
        .eq("item_type", op.itemType)
        .eq("item_id", op.itemId);
      if (error) return "promote-failed";
    }
  }
  return null;
}
