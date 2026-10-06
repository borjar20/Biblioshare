"use server";
// Acciones del dueño (spec 2026-10-06 §2 y §4). «Actualizar» recalcula con
// service role DESPUÉS de identificar al usuario por su sesión: el payload
// nunca viaja desde el navegador.
import { revalidateWrapUp } from "@/lib/reactivity/revalidate";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { buildWrapUp } from "./build";
import { getOwnWrapUp } from "./get-own-wrap-ups";
import { canRefresh } from "./refresh-policy";
import { isWrapUpKind, wrapUpWindow, type WrapUpKind } from "./windows";

function assertKind(kind: unknown): asserts kind is WrapUpKind {
  if (!isWrapUpKind(kind)) throw new Error("bad_kind");
}

export async function markWrapUpSeen(kind: WrapUpKind): Promise<void> {
  assertKind(kind);
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_wrap_up_seen", { p_kind: kind });
  if (error) throw error;
  revalidateWrapUp(kind);
}

export async function refreshWrapUp(
  kind: WrapUpKind,
): Promise<{ ok: true } | { ok: false; reason: "not_found" | "published" | "too_soon" | "empty" }> {
  assertKind(kind);
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: "not_found" };
  const row = await getOwnWrapUp(kind);
  if (!row) return { ok: false, reason: "not_found" };
  const verdict = canRefresh(row, new Date());
  if (verdict !== "ok") return { ok: false, reason: verdict };

  // Recalcula la MISMA ventana que la fila (no la de hoy): en un jueves,
  // «Actualizar» del semanal sigue siendo la semana guardada. Ancla: el día
  // siguiente al fin de periodo (semana/mes) o el 26-dic del año guardado.
  const admin = createServiceRoleClient();
  const anchor = kind === "year"
    ? new Date(`${row.payload.periodStart.slice(0, 4)}-12-26T12:00:00Z`)
    : new Date(Date.parse(`${row.payload.periodEnd}T12:00:00Z`) + 86_400_000);
  const window = wrapUpWindow(kind, anchor);
  const payload = await buildWrapUp(admin as unknown as Parameters<typeof buildWrapUp>[0], user.id, window);
  if (!payload) return { ok: false, reason: "empty" };
  const { error } = await admin.from("wrap_ups")
    .update({ payload: payload as never, intensity: payload.intensity, refreshed_at: new Date().toISOString() })
    .eq("user_id", user.id).eq("kind", kind).is("published_post_id", null);
  if (error) throw error;
  revalidateWrapUp(kind);
  return { ok: true };
}

export async function publishWrapUp(
  kind: WrapUpKind,
): Promise<{ ok: true; postId: string } | { ok: false; reason: string }> {
  assertKind(kind);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("publish_wrap_up", { p_kind: kind });
  if (error) return { ok: false, reason: error.message };
  revalidateWrapUp(kind, { social: true });
  return { ok: true, postId: data as string };
}

export async function unpublishWrapUp(kind: WrapUpKind): Promise<void> {
  assertKind(kind);
  const supabase = await createClient();
  const { error } = await supabase.rpc("unpublish_wrap_up", { p_kind: kind });
  if (error) throw error;
  revalidateWrapUp(kind, { social: true });
}
