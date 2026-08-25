"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { revalidateQuickAdd, revalidateQuickAddMany } from "@/lib/reactivity/revalidate";
import { applyTransition } from "@/lib/passes/apply-transition";
import type { ItemType } from "@/lib/catalog/types";

// Resultado discriminado (no se lanza: Next borra el mensaje de los Error de
// server action en prod — ver docs/TRAMPAS.md). `added` = la obra quedó en la
// cola (o ya estaba); `askResume` = hay un pase CERRADO de esa obra, así que no
// se insertó nada y el usuario tiene que decidir (continuar/reempezar) en su
// ficha. El botón NO debe cantar "en tu biblioteca" en ese caso (issue #299).
export type QuickAddResult = { kind: "added" } | { kind: "askResume" };

// Alta rápida desde el feed: mete la obra en la cola (planned) reusando la
// máquina de estados. Idempotente — si ya hay pase activo, applyTransition es
// no-op.
export async function quickAddToLibrary(
  itemType: ItemType,
  itemId: string,
): Promise<QuickAddResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const outcome = await applyTransition(supabase, user.id, itemType, itemId, "planned");
  // Solo si de verdad entró algo: en `askResume` no se ha insertado nada (hay un
  // pase cerrado y decide el usuario en la ficha), así que no hay nada rancio
  // que refrescar.
  if (outcome.kind !== "askResume") revalidateQuickAdd(itemType, itemId);
  return outcome.kind === "askResume" ? { kind: "askResume" } : { kind: "added" };
}

// Resumen del batch: cuántas quedaron en la cola, cuántas requieren decisión
// (askResume) y cuántas fallaron de verdad. Se captura POR ÍTEM para que un
// fallo a medias no suba al error boundary de Next (pantalla en blanco) y para
// dar una superficie de error al usuario (issue #299).
export type QuickAddManyResult = {
  added: number;
  needsDecision: number;
  failed: number;
};

// "Guardar los N en mi cola": UNA sola acción (un round-trip), transiciones en
// paralelo, un único revalidate al final — elegido sobre el bucle cliente por
// rendimiento (spec D4).
export async function quickAddManyToLibrary(
  items: { itemType: ItemType; itemId: string }[],
): Promise<QuickAddManyResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const outcomes = await Promise.all(
    items.map(async (i) => {
      try {
        const outcome = await applyTransition(supabase, user.id, i.itemType, i.itemId, "planned");
        return outcome.kind === "askResume" ? "needsDecision" : "added";
      } catch {
        // Reintentable: `planned` es idempotente, volver a pulsar reintenta.
        return "failed";
      }
    }),
  );
  if (outcomes.some((o) => o === "added")) revalidateQuickAddMany();
  return {
    added: outcomes.filter((o) => o === "added").length,
    needsDecision: outcomes.filter((o) => o === "needsDecision").length,
    failed: outcomes.filter((o) => o === "failed").length,
  };
}
